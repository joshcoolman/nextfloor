#!/usr/bin/env node
/**
 * Strips a baked-in transparency checkerboard from a tile and restores real
 * alpha.
 *
 * Image generators often export the checkerboard as opaque grey squares. Those
 * squares then render as grey in the tower instead of showing the page behind
 * them. Keying is done by flood fill from the image border, so greys that
 * appear inside the artwork -- concrete, pipework -- are never touched.
 *
 * Usage: node scripts/dealpha.mjs public/middle-floor.png [...more]
 */
import sharp from "sharp";

/** How far a pixel may differ from a checker colour and still count as background. */
const TOLERANCE = 14;
/** Max channel spread for a pixel to count as neutral grey. */
const NEUTRAL = 10;

async function dealpha(path) {
  const image = sharp(path).ensureAlpha();
  const { width, height } = await image.metadata();
  const raw = await image.raw().toBuffer();

  const at = (x, y) => (y * width + x) * 4;
  const corner = [raw[0], raw[1], raw[2]];

  // The checkerboard is two greys. Find the second by walking in from the corner.
  let other = null;
  for (let x = 1; x < Math.min(width, 200) && !other; x += 1) {
    const i = at(x, 0);
    if (Math.abs(raw[i] - corner[0]) > TOLERANCE) other = [raw[i], raw[i + 1], raw[i + 2]];
  }
  if (!other) other = corner;

  // Resampling leaves blended pixels along every square boundary. Matching only
  // the two exact greys leaves those in place and they dam the flood fill, so
  // anything neutral within the checker's brightness range counts too.
  const lo = Math.min(corner[0], other[0]) - TOLERANCE;
  const hi = Math.max(corner[0], other[0]) + TOLERANCE;

  const isBackground = (i) => {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > NEUTRAL) return false;
    const luma = (r + g + b) / 3;
    return luma >= lo && luma <= hi;
  };

  // Flood fill inward from every border pixel that looks like checkerboard.
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) {
    stack.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push([0, y], [width - 1, y]);
  }

  let cleared = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!isBackground(i)) continue;
    seen[p] = 1;
    raw[i + 3] = 0;
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

  await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(`${path}.tmp`);
  const { renameSync } = await import("node:fs");
  renameSync(`${path}.tmp`, path);
  const percent = ((cleared / (width * height)) * 100).toFixed(1);
  console.log(`${path}: cleared ${cleared} px (${percent}%) to transparent`);
}

for (const path of process.argv.slice(2)) {
  await dealpha(path);
}
