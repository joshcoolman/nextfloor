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

/** How far a pixel may differ from a sampled background colour, per channel. */
const TOLERANCE = 16;
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

  /**
   * Sample the background rather than assume it.
   *
   * This is the magic wand: click outside the subject, small tolerance,
   * contiguous. The colour is whatever is actually there.
   *
   * The previous version required the background to be neutral grey, which is
   * true of a transparency checkerboard and of nothing else. A green background
   * (11,32,26) and a sky-blue one (163,220,252) both came back from the model
   * and both defeated it outright -- the fill never started and the tile would
   * have shipped as an opaque rectangle.
   *
   * Several samples, because a checkerboard has two colours and a gradient has
   * many. Corners and edge midpoints are all outside the artwork; a sample that
   * happens to land on the building only widens what counts as background along
   * an edge the fill already reaches.
   */
  const samples: Array<[number, number, number]> = [];
  const addSample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const next: [number, number, number] = [raw[i], raw[i + 1], raw[i + 2]];
    const known = samples.some(
      (s) =>
        Math.abs(s[0] - next[0]) <= TOLERANCE &&
        Math.abs(s[1] - next[1]) <= TOLERANCE &&
        Math.abs(s[2] - next[2]) <= TOLERANCE,
    );
    if (!known) samples.push(next);
  };
  // Inset by a pixel: encoders and resamplers occasionally leave the outermost
  // row slightly off, and a sample taken there describes an artifact rather than
  // the background.
  const inset = 1;
  const cx = (i: number) => Math.min(width - 1 - inset, Math.max(inset, Math.round((i * width) / 8)));
  const cy = (i: number) => Math.min(height - 1 - inset, Math.max(inset, Math.round((i * height) / 8)));
  for (let i = 0; i <= 8; i += 1) {
    addSample(cx(i), inset);
    addSample(cx(i), height - 1 - inset);
    addSample(inset, cy(i));
    addSample(width - 1 - inset, cy(i));
  }

  /**
   * Colour decides what background looks like; connectivity decides what is
   * background. The fill only ever reaches pixels joined to the border, so a
   * neon sign inside the floor that happens to match is never touched -- which
   * is what makes keying on a saturated colour safe at all.
   */
  const isBackground = (i: number) => {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    return samples.some(
      (s) =>
        Math.abs(r - s[0]) <= TOLERANCE &&
        Math.abs(g - s[1]) <= TOLERANCE &&
        Math.abs(b - s[2]) <= TOLERANCE,
    );
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
export async function defringeImage(input: Buffer): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return input;

  const raw = await image.raw().toBuffer();
  defringe(raw, width, height);
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

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
