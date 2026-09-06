import { createHash, randomUUID } from "node:crypto";
import { composeEditPrompt, composeSeedPrompt } from "@/lib/building/prompt";
import {
  BASEMENT_THEME,
  BASE_FLOOR_THEME,
  ROOF_THEME,
} from "@/lib/building/styleGuide";
import { generateFloorImage } from "@/lib/ai/image";
import { generateFloorSpec } from "@/lib/ai/spec";
import { ContractError, RefusalError } from "@/lib/ai/errors";
import type { Keys } from "@/lib/ai/keys";
import type { Floor, FloorKind } from "@/lib/ai/types";
import type { Reference } from "@/lib/ai/providers/types";
import {
  BASEMENT_ORDINAL,
  ROOF_ORDINAL,
  clearStaticSlot,
  insertFloor,
  listFloors,
  nextFloorOrdinal,
  referenceTile,
} from "@/lib/db/floors";
import { deleteImage, getImage, putImage } from "@/lib/storage";
import { restoreAlpha } from "@/lib/image/alpha";
import { analyzeTone, matchTone } from "@/lib/image/tone";
import { assertConsistentTiles, readStartingTile } from "@/lib/building/importTiles";

export interface GenerateOptions {
  keys: Keys;
  theme: string;
  kind?: FloorKind;
  ordinal?: number;
  isReference?: boolean;
}

/**
 * Theme -> spec -> prompt -> image -> validate -> persist.
 *
 * A refusal or a tile that violates the contract twice does not throw: it is
 * persisted as a dead floor. A burnt-out floor in the tower is a better outcome
 * than a lost floor, and it is the honest record of what the models did.
 */
export async function generateFloor(options: GenerateOptions): Promise<Floor> {
  const kind = options.kind ?? "floor";
  const theme = options.theme.trim();
  const existing = await listFloors();
  const ordinal =
    options.ordinal ??
    (kind === "roof" ? ROOF_ORDINAL : kind === "basement" ? BASEMENT_ORDINAL : await nextFloorOrdinal());

  const dead = (reason: string, meta: Record<string, unknown>) =>
    insertFloor({
      ordinal,
      kind,
      status: "dead",
      themePrompt: theme,
      displayName: theme.slice(0, 28),
      spec: null,
      failureReason: reason,
      meta,
      isReference: false,
    });

  let spec;
  try {
    spec = await generateFloorSpec(options.keys.anthropic, theme, {
      kind,
      existingThemes: existing
        .filter((floor) => floor.kind === "floor" && floor.status === "ready")
        .map((floor) => floor.displayName),
    });
  } catch (error) {
    if (error instanceof RefusalError) {
      return dead(error.message, { stage: "spec", category: error.category });
    }
    throw error;
  }

  const reference = await loadReference();
  const prompt = reference
    ? composeEditPrompt(spec, theme, ordinal)
    : composeSeedPrompt(spec, kind);

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
        return dead(error.message, { stage: "image", category: error.category, spec });
      }
      if (error instanceof ContractError) {
        lastContractFailure = error.message;
        continue;
      }
      throw error;
    }
  }

  if (!tile) {
    return dead(lastContractFailure || "The generated tile never satisfied the tile contract.", {
      stage: "validation",
      spec,
    });
  }

  // Models return the transparency checkerboard as opaque grey often enough
  // that this has to be a pipeline stage rather than a manual clean-up.
  const keyed = await restoreAlpha(tile.bytes);
  // Generated floors come back flatter than the drawn artwork, so they are
  // graded to match the reference tile they were built from.
  const bytes = reference ? await matchTone(keyed, await analyzeTone(reference.bytes)) : keyed;
  const mimeType = bytes === tile.bytes ? tile.mimeType : "image/png";
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const key = `floors/${randomUUID()}.${extension}`;
  await putImage(key, bytes, mimeType);

  return insertFloor({
    ordinal,
    kind,
    status: "ready",
    themePrompt: theme,
    displayName: spec.displayName,
    spec,
    meta: { attempts, width: tile.width, height: tile.height },
    image: { key, mime: mimeType, width: tile.width, height: tile.height },
    isReference: options.isReference ?? false,
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

async function loadReference(): Promise<Reference | null> {
  const ref = await referenceTile();
  if (!ref) return null;
  const stored = await getImage(ref.key);
  if (!stored) return null;
  const base = publicBase();
  return {
    bytes: stored.bytes,
    mimeType: stored.mime,
    width: ref.width ?? undefined,
    height: ref.height ?? undefined,
    url: base ? `${base}/api/floors/${ref.id}/image` : null,
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
    ordinal: kind === "roof" ? ROOF_ORDINAL : kind === "basement" ? BASEMENT_ORDINAL : 1,
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
