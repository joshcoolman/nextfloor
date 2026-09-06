import sharp from "sharp";

/**
 * Detects the transparency checkerboard the image model intermittently draws.
 *
 * Colour cannot separate it from the artwork -- the squares are the same greys
 * as the building's concrete. Connectivity can: a floor tile is one enormous
 * connected mass of opaque pixels, and a drawn checkerboard is hundreds of tiny
 * islands scattered through the surround.
 *
 * Measured across a real building, the separation is not marginal:
 *
 *   ten clean tiles      0.000% - 0.021% orphan pixels
 *   one checkerboarded   4.645%
 *
 * This only measures. It never alters a pixel -- an earlier attempt to clean
 * these up in place punched holes through the artwork, and a wasted
 * regeneration is a far cheaper mistake than damaged output.
 */

/** Above this fraction of orphaned opaque pixels, a tile is rejected. */
export const ORPHAN_LIMIT = 0.005;

/** Alpha at or below which a pixel is transparent. */
const CLEAR = 16;

/**
 * Fraction of opaque pixels that do not belong to the largest connected
 * component. Zero for a clean tile.
 */
export async function orphanFraction(input: Buffer): Promise<number> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return 0;

  const raw = await image.raw().toBuffer();
  const count = width * height;
  const label = new Int32Array(count).fill(-1);

  let total = 0;
  let largest = 0;

  for (let start = 0; start < count; start += 1) {
    if (label[start] !== -1 || raw[start * 4 + 3] <= CLEAR) continue;

    let size = 0;
    const stack = [start];
    label[start] = start;
    while (stack.length) {
      const p = stack.pop()!;
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (label[n] !== -1 || raw[n * 4 + 3] <= CLEAR) continue;
          label[n] = start;
          stack.push(n);
        }
      }
    }

    total += size;
    if (size > largest) largest = size;
  }

  return total ? (total - largest) / total : 0;
}
