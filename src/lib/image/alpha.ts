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

  defringe(raw, width, height);

  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Beyond this distance from the background colour a pixel is treated as solid art. */
const FRINGE_DISTANCE = 140;

/**
 * Un-blends the one-pixel boundary between art and keyed-out background.
 *
 * Keying is binary: a pixel is either cleared or kept. But an anti-aliased edge
 * pixel is a blend of the artwork and whatever background it was drawn over,
 * and keeping it whole leaves a rim of that background colour around every
 * tile -- white speckle against a dark building.
 *
 * Each boundary pixel is treated as `P = a*F + (1-a)*B`, where B is the mean of
 * its cleared neighbours. Estimating `a` from how far P sits from B recovers
 * both the coverage and the underlying colour F.
 */
function defringe(raw: Buffer, width: number, height: number): void {
  const original = Buffer.from(raw);
  const at = (x: number, y: number) => (y * width + x) * 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(x, y);
      if (raw[i + 3] === 0) continue;

      let br = 0;
      let bg = 0;
      let bb = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = at(nx, ny);
          if (raw[n + 3] !== 0) continue;
          br += original[n];
          bg += original[n + 1];
          bb += original[n + 2];
          count += 1;
        }
      }
      if (!count) continue;

      br /= count;
      bg /= count;
      bb /= count;

      const dr = original[i] - br;
      const dg = original[i + 1] - bg;
      const db = original[i + 2] - bb;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance >= FRINGE_DISTANCE) continue;

      const alpha = Math.max(0, Math.min(1, distance / FRINGE_DISTANCE));
      if (alpha < 0.06) {
        raw[i + 3] = 0;
        continue;
      }

      raw[i] = Math.max(0, Math.min(255, (original[i] - (1 - alpha) * br) / alpha));
      raw[i + 1] = Math.max(0, Math.min(255, (original[i + 1] - (1 - alpha) * bg) / alpha));
      raw[i + 2] = Math.max(0, Math.min(255, (original[i + 2] - (1 - alpha) * bb) / alpha));
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
}
