import { TILE } from "@/lib/building/styleGuide";
import { detectMime, readDimensions } from "@/lib/image/dimensions";
import { ContractError } from "./errors";
import type { Keys } from "./keys";
import { fal } from "./providers/fal";
import type { GeneratedTile, Reference } from "./providers/types";

export type { GeneratedTile } from "./providers/types";

/** Allowed drift from 21:9 before a tile is rejected and regenerated. */
const ASPECT_TOLERANCE = 0.02;

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
  if (!keys.fal) throw new Error("No image provider key was supplied.");

  const tile = await fal.generate(keys.fal, prompt, reference);

  const size = readDimensions(tile.bytes);
  const mimeType = detectMime(tile.bytes);
  if (!size || !mimeType) {
    throw new ContractError("Generated tile was not a readable PNG or JPEG.");
  }

  const [w, h] = TILE.aspectRatio.split(":").map(Number);
  const target = w / h;
  const actual = size.width / size.height;
  if (Math.abs(actual - target) / target > ASPECT_TOLERANCE) {
    throw new ContractError(
      `Generated tile is ${size.width}x${size.height}, which is not ${TILE.aspectRatio}.`,
    );
  }

  return { ...tile, mimeType, width: size.width, height: size.height };
}
