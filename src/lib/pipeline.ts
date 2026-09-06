import { randomUUID } from "node:crypto";
import { composeImagePrompt, composeSeedPrompt } from "@/lib/building/prompt";
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
import {
  BASEMENT_ORDINAL,
  ROOF_ORDINAL,
  insertFloor,
  listFloors,
  nextFloorOrdinal,
  referenceTile,
} from "@/lib/db/floors";
import { getImage, putImage } from "@/lib/storage";

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
    ? composeImagePrompt(spec, kind)
    : composeSeedPrompt(spec, kind);

  let tile;
  let attempts = 0;
  let lastContractFailure = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      tile = await generateFloorImage(options.keys.google, prompt, reference);
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

  const extension = tile.mimeType === "image/png" ? "png" : "jpg";
  const key = `floors/${randomUUID()}.${extension}`;
  await putImage(key, tile.bytes, tile.mimeType);

  return insertFloor({
    ordinal,
    kind,
    status: "ready",
    themePrompt: theme,
    displayName: spec.displayName,
    spec,
    meta: { attempts, width: tile.width, height: tile.height },
    image: { key, mime: tile.mimeType, width: tile.width, height: tile.height },
    isReference: options.isReference ?? false,
  });
}

async function loadReference(): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const ref = await referenceTile();
  if (!ref) return null;
  const stored = await getImage(ref.key);
  return stored ? { bytes: stored.bytes, mimeType: stored.mime } : null;
}

/**
 * The building always exists. On an empty database the lobby is generated
 * first and becomes the reference tile; the caps are then matched to it.
 */
export async function seedBuilding(keys: Keys): Promise<Floor[]> {
  const existing = await listFloors();
  const created: Floor[] = [];

  // Keyed on the reference tile, not on floor count: if the lobby came back
  // dead there is nothing for later floors to match against, so try again.
  if (!(await referenceTile())) {
    created.push(
      await generateFloor({ keys, theme: BASE_FLOOR_THEME, kind: "floor", isReference: true }),
    );
  }
  if (!existing.some((floor) => floor.kind === "basement")) {
    created.push(await generateFloor({ keys, theme: BASEMENT_THEME, kind: "basement" }));
  }
  if (!existing.some((floor) => floor.kind === "roof")) {
    created.push(await generateFloor({ keys, theme: ROOF_THEME, kind: "roof" }));
  }
  return created;
}
