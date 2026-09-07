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

/**
 * How far a pixel may differ from a sampled background colour, per channel.
 *
 * The background is asked to be flat black and the outline #222222, which are 34
 * levels apart, so anything under about 25 stops at the outline rather than
 * eating through it. 20 leaves margin for encoder noise on both sides.
 *
 * Tolerance is not free: what survives the fill is the blend between background
 * and outline, and every extra level consumes another band of it and exposes
 * something lighter behind. That matters most on the roughly two thirds of the
 * silhouette where the model draws no outline at all and the fill runs into
 * artwork.
 *
 * 40 is the fallback for a background that is not flat -- a checkerboard or a
 * gradient -- where a tight tolerance stops the fill almost immediately.
 */
const TOLERANCES = [20, 40];

/**
 * A tile whose background has been keyed lands somewhere around a third
 * transparent. Far below that means the fill stopped early and the tolerance
 * was too tight for this background.
 */
const PLAUSIBLE = 0.15;
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
   * Four samples, one per corner, because a transparency checkerboard has two
   * colours and only some corners see each.
   */
  const samples: Array<[number, number, number]> = [];
  const addSample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const next: [number, number, number] = [raw[i], raw[i + 1], raw[i + 2]];
    // Two corners of a checkerboard differ; four corners of flat black do not.
    const known = samples.some(
      (s) =>
        Math.abs(s[0] - next[0]) <= 2 &&
        Math.abs(s[1] - next[1]) <= 2 &&
        Math.abs(s[2] - next[2]) <= 2,
    );
    if (!known) samples.push(next);
  };
  // Corners only, inset by a pixel.
  //
  // Sampling all round the border looks more thorough and is worse: the building
  // reaches the image edge on plenty of tiles -- 142 border pixels of artwork on
  // one, 86 on another -- so an edge sample lands on the floor itself and admits
  // a building colour as background, which the fill then eats wherever it can
  // reach. The corners are the one place the artwork never is: measured across
  // all eighteen tiles in the building, zero have artwork in a corner.
  //
  // The inset is for encoders and resamplers, which occasionally leave the
  // outermost row slightly off -- a sample there describes an artifact.
  const inset = 1;
  addSample(inset, inset);
  addSample(width - 1 - inset, inset);
  addSample(inset, height - 1 - inset);
  addSample(width - 1 - inset, height - 1 - inset);

  /**
   * Colour decides what background looks like; connectivity decides what is
   * background. The fill only ever reaches pixels joined to the border, so a
   * neon sign inside the floor that happens to match is never touched -- which
   * is what makes keying on a saturated colour safe at all.
   */
  const flood = (tolerance: number) => {
    const alpha = new Uint8Array(width * height);
    const isBackground = (i: number) =>
      samples.some(
        (s) =>
          Math.abs(raw[i] - s[0]) <= tolerance &&
          Math.abs(raw[i + 1] - s[1]) <= tolerance &&
          Math.abs(raw[i + 2] - s[2]) <= tolerance,
      );
    const stack: Array<[number, number]> = [];
    for (let x = 0; x < width; x += 1) stack.push([x, 0], [x, height - 1]);
    for (let y = 0; y < height; y += 1) stack.push([0, y], [width - 1, y]);
    let cleared = 0;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const p = y * width + x;
      if (alpha[p]) continue;
      if (!isBackground(p * 4)) continue;
      alpha[p] = 1;
      cleared += 1;
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
    return { alpha, cleared };
  };

  // Tightest tolerance that actually clears the background. Widening is a
  // fallback for a background that is not flat, not a default.
  let keyed = flood(TOLERANCES[0]);
  for (let i = 1; i < TOLERANCES.length; i += 1) {
    if (keyed.cleared / (width * height) >= PLAUSIBLE) break;
    keyed = flood(TOLERANCES[i]);
  }

  for (let p = 0; p < width * height; p += 1) {
    if (keyed.alpha[p]) raw[p * 4 + 3] = 0;
  }

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
