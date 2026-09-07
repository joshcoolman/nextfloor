import { createHash, randomUUID } from "node:crypto";
import { composeEditPrompt, composeSeedPrompt } from "@/lib/building/prompt";
import { EDIT_PROMPT_NAME } from "@/lib/prompts";
import {
  BASEMENT_THEME,
  BASE_FLOOR_THEME,
  ROOF_THEME,
} from "@/lib/building/styleGuide";
import { generateFloorImage } from "@/lib/ai/image";
import { generateFloorSpec } from "@/lib/ai/spec";
import { ContractError, RefusalError } from "@/lib/ai/errors";
import type { Keys } from "@/lib/ai/keys";
import type { Effort, Floor, FloorKind } from "@/lib/ai/types";
import type { Reference } from "@/lib/ai/providers/types";
import {
  BASEMENT_ORDINAL,
  REFERENCE_ORDINAL,
  ROOF_ORDINAL,
  clearStaticSlot,
  completeFloor,
  insertFloor,
  listFloors,
  referenceTile,
} from "@/lib/db/floors";
import { deleteImage, getImage, putImage } from "@/lib/storage";
import { restoreAlpha } from "@/lib/image/alpha";
import { extensionFor, optimizeFloorImage } from "@/lib/image/optimize";
import { analyzeTone, matchTone } from "@/lib/image/tone";
import { assertConsistentTiles, readStartingTile } from "@/lib/building/importTiles";

export interface GenerateOptions {
  keys: Keys;
  /** The pending floor whose slot has already been claimed. */
  floorId: string;
  ordinal: number;
  theme: string;
  effort?: Effort;
}

/**
 * Theme -> spec -> prompt -> image -> validate -> persist.
 *
 * Fills in a floor whose slot was reserved before this ran, so the tower shows
 * the storey under construction while the work happens.
 *
 * A refusal, or a tile that violates the contract twice, does not throw: the
 * floor is completed as dead. A burnt-out storey is a better outcome than a
 * lost one, and it is the honest record of what the models did.
 */
export async function generateFloor(options: GenerateOptions): Promise<Floor | null> {
  const theme = options.theme.trim();
  const existing = await listFloors();

  const dead = (reason: string, meta: Record<string, unknown>) =>
    completeFloor(options.floorId, {
      status: "dead",
      displayName: theme.slice(0, 40),
      spec: null,
      failureReason: reason,
      meta,
    });

  let spec;
  try {
    spec = await generateFloorSpec(options.keys.anthropic, theme, {
      kind: "floor",
      existingThemes: existing
        .filter((floor) => floor.kind === "floor" && floor.status === "ready")
        .slice(options.keys.funding ? -200 : 0)
        .map((floor) => floor.displayName),
      effort: options.effort,
      funding: options.keys.funding,
    });
  } catch (error) {
    if (error instanceof RefusalError) {
      return dead(error.message, { stage: "spec", category: error.category, refusal: true });
    }
    return dead(error instanceof Error ? error.message : "The theme interpreter failed.", {
      stage: "spec",
    });
  }

  const reference = await loadReference();
  const prompt = reference
    ? composeEditPrompt(spec, theme, options.ordinal)
    : composeSeedPrompt(spec, "floor");

  let tile;
  let attempts = 0;
  let lastContractFailure = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      tile = await generateFloorImage(options.keys, prompt, reference);
      break;
    } catch (error) {
      if (error instanceof RefusalError) {
        return dead(error.message, { stage: "image", category: error.category, refusal: true, spec });
      }
      if (error instanceof ContractError) {
        lastContractFailure = error.message;
        continue;
      }
      return dead(error instanceof Error ? error.message : "Image generation failed.", {
        stage: "image",
        spec,
      });
    }
  }

  if (!tile) {
    return dead(lastContractFailure || "The generated tile never satisfied the tile contract.", {
      stage: "validation",
      spec,
    });
  }

  const restored = await restoreAlpha(tile.bytes);
  const restoredMime = restored === tile.bytes ? tile.mimeType : "image/png";
  // Encoding is a delivery concern, so it happens after the artwork is final and
  // nothing upstream of here knows about it.
  const optimized = await optimizeFloorImage(restored, restoredMime);
  const key = `floors/${randomUUID()}.${extensionFor(optimized.mimeType)}`;
  await putImage(key, optimized.bytes, optimized.mimeType);

  return completeFloor(options.floorId, {
    status: "ready",
    displayName: spec.displayName,
    spec,
    // Which prompt built it, so a floor generated during an experiment can be
    // told from one generated before it without reading the deploy history.
    meta: {
      attempts,
      effort: options.effort ?? "medium",
      editPrompt: reference ? EDIT_PROMPT_NAME : null,
      encoding: optimized.strategy,
      originalBytes: optimized.originalBytes,
      storedBytes: optimized.optimizedBytes,
      width: tile.width,
      height: tile.height,
    },
    image: { key, mime: optimized.mimeType, width: tile.width, height: tile.height },
  });
}

/**
 * The public base URL lets providers fetch the reference tile themselves rather
 * than receive several megabytes of base64 in the request body. Railway sets
 * RAILWAY_PUBLIC_DOMAIN; set PUBLIC_BASE_URL to point a local run at it too.
 */
function publicBase(): string | null {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

/**
 * Whether a reference URL actually serves the tile, cached for the life of the
 * process.
 *
 * Renaming the Railway domain left PUBLIC_BASE_URL pointing at a dead host, and
 * every generation quietly handed the image model 101 bytes of "Application not
 * found" in place of the reference. The model does not report that as a missing
 * image -- it either fails with a generic invalid_request or, worse, draws a
 * floor with nothing to match. Both look like content problems from the outside
 * and neither is.
 */
const reachable = new Map<string, boolean>();

async function serves(url: string): Promise<boolean> {
  const known = reachable.get(url);
  if (known !== undefined) return known;
  let ok = false;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    ok = response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    ok = false;
  }
  if (!ok) {
    console.warn(`[nextfloor] reference URL does not serve the tile, sending bytes: ${url}`);
  }
  reachable.set(url, ok);
  return ok;
}

async function loadReference(): Promise<Reference | null> {
  const ref = await referenceTile();
  if (!ref) return null;
  const stored = await getImage(ref.key);
  if (!stored) return null;
  const base = publicBase();
  const url = base ? `${base}/api/floors/${ref.id}/image` : null;
  return {
    bytes: stored.bytes,
    mimeType: stored.mime,
    width: ref.width ?? undefined,
    height: ref.height ?? undefined,
    // The URL saves several megabytes of base64 per request, but only when it
    // works. Unverified, it is a silent downgrade to no reference at all.
    url: url && (await serves(url)) ? url : null,
  };
}

/**
 * Imports a hand-drawn tile from `public/`, replacing whatever occupies that
 * slot. The artwork on disk is authoritative: a generated floor left over from
 * an earlier run, or an older version of the same file, is discarded rather
 * than kept. The file's hash is stored so replacing the art on disk propagates
 * on the next page load without a manual wipe.
 */
async function importFloor(
  kind: FloorKind,
  theme: string,
  displayName: string,
  isReference: boolean,
  existing: Floor[],
): Promise<Floor | null> {
  const tile = readStartingTile(kind);
  if (!tile) return null;

  const sha = createHash("sha256").update(tile.bytes).digest("hex").slice(0, 16);
  // Match the static row specifically. For `floor` that is the reference tile;
  // the generated floors alongside it must survive an artwork change.
  const current = existing.find(
    (floor) => floor.kind === kind && (kind !== "floor" || floor.meta?.source === "public"),
  );
  if (current && current.meta?.sha === sha) return null;

  for (const key of await clearStaticSlot(kind)) {
    await deleteImage(key);
  }

  const extension = tile.mimeType === "image/png" ? "png" : "jpg";
  const key = `floors/${randomUUID()}.${extension}`;
  await putImage(key, tile.bytes, tile.mimeType);

  return insertFloor({
    ordinal:
      kind === "roof"
        ? ROOF_ORDINAL
        : kind === "basement"
          ? BASEMENT_ORDINAL
          : REFERENCE_ORDINAL,
    kind,
    status: "ready",
    themePrompt: theme,
    displayName,
    spec: null,
    meta: { source: "public", sha, width: tile.width, height: tile.height },
    image: { key, mime: tile.mimeType, width: tile.width, height: tile.height },
    isReference,
  });
}

/**
 * The building always exists. Its roof, reference floor and basement are drawn
 * artwork imported from `public/`, so there is nothing to generate and no key
 * needed -- a visitor with no keys still gets a building to look at. Adding a
 * floor is the only action that costs anything.
 *
 * Idempotent: the unique index on is_reference makes a concurrent second call
 * fail rather than duplicate the reference floor.
 */
export async function ensureBuilding(): Promise<Floor[]> {
  assertConsistentTiles();
  const existing = await listFloors();
  const created: Floor[] = [];

  const floor = await importFloor("floor", BASE_FLOOR_THEME, "80s Video Games", true, existing);
  if (floor) created.push(floor);

  const basement = await importFloor("basement", BASEMENT_THEME, "Sub-Level", false, existing);
  if (basement) created.push(basement);

  const roof = await importFloor("roof", ROOF_THEME, "Rooftop", false, existing);
  if (roof) created.push(roof);

  return created;
}
