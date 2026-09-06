import { TILE } from "@/lib/building/styleGuide";
import { readDimensions } from "@/lib/image/dimensions";
import { ContractError } from "./errors";
import type { Keys } from "./keys";
import { fal } from "./providers/fal";
import { gemini } from "./providers/gemini";
import type { GeneratedTile, ImageProvider, Reference } from "./providers/types";

export type { GeneratedTile } from "./providers/types";

/** Allowed drift from 21:9 before a tile is rejected and regenerated. */
const ASPECT_TOLERANCE = 0.02;

/**
 * Whichever image key the caller supplied decides the provider. fal is tried
 * first because it can emit PNG, and pixel art through JPEG loses the crisp
 * edges the whole look depends on.
 */
export function selectProvider(keys: Keys): { provider: ImageProvider; apiKey: string } | null {
  if (keys.fal) return { provider: fal, apiKey: keys.fal };
  if (keys.google) return { provider: gemini, apiKey: keys.google };
  return null;
}

/**
 * The reference tile is passed on every call. It is what holds palette, line
 * weight and lighting coherent across independently generated floors -- the
 * prompt alone is not enough.
 */
export async function generateFloorImage(
  keys: Keys,
  prompt: string,
  reference: Reference | null,
): Promise<GeneratedTile> {
  const selected = selectProvider(keys);
  if (!selected) throw new Error("No image provider key was supplied.");

  const tile = await selected.provider.generate(selected.apiKey, prompt, reference);

  const size = readDimensions(tile.bytes);
  if (!size) throw new ContractError("Generated tile was not a readable PNG or JPEG.");

  const [w, h] = TILE.aspectRatio.split(":").map(Number);
  const target = w / h;
  const actual = size.width / size.height;
  if (Math.abs(actual - target) / target > ASPECT_TOLERANCE) {
    throw new ContractError(
      `Generated tile is ${size.width}x${size.height}, which is not ${TILE.aspectRatio}.`,
    );
  }

  return { ...tile, width: size.width, height: size.height };
}
