import sharp from "sharp";

/**
 * Restores real transparency to a tile whose background is opaque.
 *
 * Image generators routinely return the transparency checkerboard as actual
 * grey squares, or a flat background, even when asked for alpha. Those pixels
 * then render as a rectangle behind the floor instead of showing the tower
 * behind it. Keying works by flood fill inward from the image border, so
 * matching colours inside the artwork are never touched.
 */

/** How far a pixel may differ from a background colour and still be background. */
const TOLERANCE = 14;
/** Max channel spread for a pixel to count as neutral grey. */
const NEUTRAL = 10;
/** Below this, the tile already has usable transparency and is left alone. */
const ALREADY_TRANSPARENT = 0.05;

export async function restoreAlpha(input: Buffer): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return input;

  const raw = await image.raw().toBuffer();

  let transparent = 0;
  for (let i = 3; i < raw.length; i += 4) {
    if (raw[i] < 16) transparent += 1;
  }
  if (transparent / (width * height) > ALREADY_TRANSPARENT) return input;

  const corner = [raw[0], raw[1], raw[2]];
  let other: number[] | null = null;
  for (let x = 1; x < Math.min(width, 200) && !other; x += 1) {
    const i = x * 4;
    if (Math.abs(raw[i] - corner[0]) > TOLERANCE) other = [raw[i], raw[i + 1], raw[i + 2]];
  }
  const second = other ?? corner;

  // Resampling leaves blended pixels along every checker boundary. Matching only
  // the two exact colours leaves those in place and they dam the flood fill, so
  // anything neutral within the background's brightness range counts too.
  const lo = Math.min(corner[0], second[0]) - TOLERANCE;
  const hi = Math.max(corner[0], second[0]) + TOLERANCE;

  const isBackground = (i: number) => {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL) return false;
    const luma = (r + g + b) / 3;
    return luma >= lo && luma <= hi;
  };

  const seen = new Uint8Array(width * height);
  const stack: Array<[number, number]> = [];
  for (let x = 0; x < width; x += 1) stack.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y += 1) stack.push([0, y], [width - 1, y]);

  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!isBackground(i)) continue;
    seen[p] = 1;
    raw[i + 3] = 0;
    stack.push(
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
      [x + 1, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
    );
  }

  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
