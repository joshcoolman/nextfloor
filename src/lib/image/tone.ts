import sharp from "sharp";

/**
 * Matches a generated tile's tone to the reference tile's.
 *
 * Generated floors come back flatter than the drawn artwork: measured across
 * the building, the black point is identical but mean luminance sits ~20%
 * higher and saturation ~20% lower. Lifted midtones and washed colour, not a
 * broken black point -- which is why it reads as lacking punch rather than
 * looking grey.
 *
 * The correction is measured, not fixed: the reference tile is the target, so
 * this stays right if the artwork's grade ever changes.
 */

export interface Tone {
  /** Mean luminance of opaque pixels, 0-255. */
  mean: number;
  /** Mean saturation of opaque pixels, 0-1. */
  saturation: number;
}

/** Bounds on the correction, so an outlier tile cannot be pushed to mush. */
const MIN_GAMMA = 0.8;
const MAX_GAMMA = 1.5;
const MIN_SATURATION = 0.9;
const MAX_SATURATION = 1.7;
/** Below this alpha a pixel is edge or background and should not skew the stats. */
const OPAQUE = 200;

export async function analyzeTone(input: Buffer): Promise<Tone> {
  const image = sharp(input).ensureAlpha();
  const raw = await image.raw().toBuffer();
  return toneOf(raw);
}

function toneOf(raw: Buffer): Tone {
  let count = 0;
  let luma = 0;
  let saturation = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i + 3] < OPAQUE) continue;
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    saturation += max === 0 ? 0 : (max - min) / max;
    count += 1;
  }
  return count
    ? { mean: luma / count, saturation: saturation / count }
    : { mean: 0, saturation: 0 };
}

export async function matchTone(input: Buffer, target: Tone): Promise<Buffer> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return input;

  const raw = await image.raw().toBuffer();
  const tone = toneOf(raw);
  if (!tone.mean || !target.mean) return input;

  // Gamma that maps this tile's mean luminance onto the reference's. Applied to
  // the whole tone curve, so it darkens midtones without touching the ends.
  const gamma = clamp(
    Math.log(target.mean / 255) / Math.log(tone.mean / 255),
    MIN_GAMMA,
    MAX_GAMMA,
  );
  const saturation = clamp(
    tone.saturation ? target.saturation / tone.saturation : 1,
    MIN_SATURATION,
    MAX_SATURATION,
  );

  const curve = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    curve[v] = Math.round(255 * Math.pow(v / 255, gamma));
  }

  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i + 3] === 0) continue;
    const r = curve[raw[i]];
    const g = curve[raw[i + 1]];
    const b = curve[raw[i + 2]];
    // Push each channel away from its own luminance to lift saturation, which
    // preserves hue and leaves neutral pixels neutral.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    raw[i] = clamp(Math.round(luma + (r - luma) * saturation), 0, 255);
    raw[i + 1] = clamp(Math.round(luma + (g - luma) * saturation), 0, 255);
    raw[i + 2] = clamp(Math.round(luma + (b - luma) * saturation), 0, 255);
  }

  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
