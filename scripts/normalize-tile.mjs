#!/usr/bin/env node
/**
 * Fits a generated tile to the reference tile's frame.
 *
 * Generated tiles come back at a different size, with the building filling more
 * of the canvas than the hand-drawn tiles do. Rendered into the same box they
 * sit a few percent large with a different vertical offset, so ledges do not
 * meet and the floor below appears cut off. No prompt wording fixes this
 * reliably; measuring does.
 *
 * The building's alpha bounding box is scaled to the reference's width, then
 * placed so the left and BOTTOM edges coincide. The bottom edge is where a tile
 * meets the floor below, so that is the seam that must not move.
 *
 * Usage: node scripts/normalize-tile.mjs <generated.png> <output.png>
 *        [--reference public/middle-floor.png]
 */
import sharp from "sharp";

const [src, out] = process.argv.slice(2);
const refIndex = process.argv.indexOf("--reference");
const refPath = refIndex === -1 ? "public/middle-floor.png" : process.argv[refIndex + 1];

if (!src || !out) {
  console.error("Usage: node scripts/normalize-tile.mjs <generated.png> <output.png>");
  process.exit(1);
}

async function bbox(input) {
  const image = sharp(input).ensureAlpha();
  const { width, height } = await image.metadata();
  const raw = await image.raw().toBuffer();
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (raw[(y * width + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, W: width, H: height };
}

const reference = await bbox(refPath);
const before = await bbox(src);

const scale = reference.w / before.w;
const resized = await sharp(src)
  .resize(Math.round(before.W * scale), Math.round(before.H * scale), { kernel: "lanczos3" })
  .png()
  .toBuffer();
const after = await bbox(resized);

await sharp({
  create: {
    width: reference.W,
    height: reference.H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: resized, left: reference.x0 - after.x0, top: reference.y1 - after.y1 }])
  .png()
  .toFile(out);

const final = await bbox(out);
console.log(`reference  x:${reference.x0}-${reference.x1}  bottom:${reference.y1}`);
console.log(`normalised x:${final.x0}-${final.x1}  bottom:${final.y1}`);
