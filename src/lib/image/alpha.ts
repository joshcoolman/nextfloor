import sharp from "sharp";

/**
 * Turns whatever background a model returned into real transparency.
 *
 * Alpha is not a colour, so a diffusion model cannot draw it. Asked for a
 * transparent background it draws the only picture of transparency that exists:
 * a checkerboard. So the prompt asks for a flat key colour instead -- something
 * it can actually paint -- and the transparency is made here.
 *
 * Three cases have to work, because the model obliges inconsistently:
 *   1. A flat key-coloured surround. Keyed exactly.
 *   2. A neutral white/grey checkerboard. Keyed by matching the border colours.
 *   3. Real alpha, speckled with opaque leftovers from a drawn checkerboard.
 *
 * Case 3 is why the fill traverses transparent pixels rather than stopping at
 * them: the leftovers are islands inside an already-transparent surround, and a
 * fill that halts at alpha would never reach them.
 */

/** The key colour the prompt asks for. Nothing in the artwork's palette is near it. */
export const KEY_COLOUR = { r: 255, g: 0, b: 255 } as const;
/** How far a pixel may sit from the key colour and still be background. */
const KEY_DISTANCE = 90;
/** How far from a sampled neutral background colour, when no key is present. */
const TOLERANCE = 14;
/** Max channel spread for a pixel to count as neutral grey. */
const NEUTRAL = 10;
/** Fraction of opaque border pixels that must be key-coloured to enter key mode. */
const KEY_BORDER_SHARE = 0.2;
/** Alpha at or below which a pixel counts as already transparent. */
const CLEAR = 16;

export async function restoreAlpha(input: Buffer): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return input;

  const raw = await image.raw().toBuffer();
  const at = (x: number, y: number) => (y * width + x) * 4;

  const keyDistance = (i: number) => {
    const dr = raw[i] - KEY_COLOUR.r;
    const dg = raw[i + 1] - KEY_COLOUR.g;
    const db = raw[i + 2] - KEY_COLOUR.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // Decide from the border whether this is a keyed tile or a neutral one.
  let borderOpaque = 0;
  let borderKeyed = 0;
  const sampleBorder = (x: number, y: number) => {
    const i = at(x, y);
    if (raw[i + 3] <= CLEAR) return;
    borderOpaque += 1;
    if (keyDistance(i) <= KEY_DISTANCE) borderKeyed += 1;
  };
  for (let x = 0; x < width; x += 1) {
    sampleBorder(x, 0);
    sampleBorder(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    sampleBorder(0, y);
    sampleBorder(width - 1, y);
  }

  const keyed = borderOpaque > 0 && borderKeyed / borderOpaque >= KEY_BORDER_SHARE;

  let isBackground: (i: number) => boolean;
  if (keyed) {
    isBackground = (i) => keyDistance(i) <= KEY_DISTANCE;
  } else {
    // Neutral tones sampled from OPAQUE border pixels. Sampling the corner
    // blindly reads the RGB of an already-transparent pixel, which is arbitrary.
    let lo = Infinity;
    let hi = -Infinity;
    const sampleTone = (x: number, y: number) => {
      const i = at(x, y);
      if (raw[i + 3] <= CLEAR) return;
      const r = raw[i];
      const g = raw[i + 1];
      const b = raw[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL) return;
      const luma = (r + g + b) / 3;
      lo = Math.min(lo, luma);
      hi = Math.max(hi, luma);
    };
    for (let x = 0; x < width; x += 1) {
      sampleTone(x, 0);
      sampleTone(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      sampleTone(0, y);
      sampleTone(width - 1, y);
    }
    if (lo === Infinity) {
      isBackground = () => false;
    } else {
      const low = lo - TOLERANCE;
      const high = hi + TOLERANCE;
      isBackground = (i) => {
        const r = raw[i];
        const g = raw[i + 1];
        const b = raw[i + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) > NEUTRAL) return false;
        const luma = (r + g + b) / 3;
        return luma >= low && luma <= high;
      };
    }
  }

  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x, 0, x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(0, y, width - 1, y);
  }

  let cleared = 0;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    const i = p * 4;

    const alreadyClear = raw[i + 3] <= CLEAR;
    const clearable = !alreadyClear && isBackground(i);
    // Traverse through existing transparency so opaque islands inside an
    // already-keyed surround are still reachable.
    if (!alreadyClear && !clearable) continue;

    seen[p] = 1;
    if (clearable) {
      raw[i + 3] = 0;
      cleared += 1;
    }
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1, x + 1, y + 1, x - 1, y - 1, x + 1, y - 1, x - 1, y + 1);
  }

  // Whatever the background was, a drawn checkerboard leaves opaque islands
  // stranded in the void. Colour cannot separate them from the building's own
  // grey concrete, but size and connectivity can: the artwork is one large mass
  // and the leftovers are specks.
  cleared += removeSpeckle(raw, width, height);

  if (!cleared) return input;

  defringe(raw, width, height, keyed ? [KEY_COLOUR.r, KEY_COLOUR.g, KEY_COLOUR.b] : null);

  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** An opaque island smaller than this, adrift in transparency, is not artwork. */
const MAX_SPECK = 600;

/**
 * Clears small opaque components that are not part of the building.
 *
 * Deliberately independent of colour: the leftover checkerboard squares are the
 * same light grey as the concrete, so any colour rule that caught them would
 * also eat the slab edges. Connectivity separates them cleanly -- the artwork is
 * a single large component, the leftovers are hundreds of tiny ones.
 */
function removeSpeckle(raw: Buffer, width: number, height: number): number {
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const members: number[][] = [];

  for (let start = 0; start < width * height; start += 1) {
    if (label[start] !== -1 || raw[start * 4 + 3] <= CLEAR) continue;
    const id = sizes.length;
    const pixels: number[] = [];
    const queue = [start];
    label[start] = id;
    while (queue.length) {
      const p = queue.pop()!;
      pixels.push(p);
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (label[n] !== -1 || raw[n * 4 + 3] <= CLEAR) continue;
          label[n] = id;
          queue.push(n);
        }
      }
    }
    sizes.push(pixels.length);
    members.push(pixels);
  }

  const largest = sizes.reduce((best, size, i) => (size > sizes[best] ? i : best), 0);

  let cleared = 0;
  for (let id = 0; id < sizes.length; id += 1) {
    if (id === largest || sizes[id] > MAX_SPECK) continue;
    for (const p of members[id]) {
      raw[p * 4 + 3] = 0;
      cleared += 1;
    }
  }
  return cleared;
}

export async function defringeImage(input: Buffer): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return input;

  const raw = await image.raw().toBuffer();
  defringe(raw, width, height, null);
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/** Beyond this distance from the background colour a pixel is treated as solid art. */
const FRINGE_DISTANCE = 140;

/**
 * Un-blends the one-pixel boundary between art and keyed-out background.
 *
 * An anti-aliased edge pixel is a blend of artwork and whatever it was drawn
 * over, so keeping it whole leaves a rim of that background around the tile.
 * Each boundary pixel is treated as `P = a*F + (1-a)*B` and solved for both.
 *
 * With a key colour B is known exactly, which makes this arithmetic rather than
 * an estimate; without one it is the mean of the pixel's cleared neighbours.
 */
function defringe(
  raw: Buffer,
  width: number,
  height: number,
  key: [number, number, number] | null,
): void {
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
          if (key) {
            br += key[0];
            bg += key[1];
            bb += key[2];
          } else {
            br += original[n];
            bg += original[n + 1];
            bb += original[n + 2];
          }
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

      raw[i] = clamp((original[i] - (1 - alpha) * br) / alpha);
      raw[i + 1] = clamp((original[i + 1] - (1 - alpha) * bg) / alpha);
      raw[i + 2] = clamp((original[i + 2] - (1 - alpha) * bb) / alpha);
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
