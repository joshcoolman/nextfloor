#!/usr/bin/env node
/**
 * Re-encodes every stored tile as lossless WebP, in place.
 *
 * The building was generated before the pipeline optimised anything, so its
 * tiles are provider PNGs written for speed: around 7 MB each. This is the
 * one-time catch-up; new floors are encoded on the way in.
 *
 * Nothing about a tile changes except its bytes. Every re-encode is verified
 * pixel-for-pixel on visible pixels, alpha values and silhouette before it is
 * written, and a tile that fails verification or does not get meaningfully
 * smaller is left exactly as it was.
 *
 * The storage key keeps its original .png suffix. Keys are opaque handles and
 * the mime is stored beside them, so renaming would be churn for nothing.
 *
 *   node --env-file=.env.local scripts/optimize-stored-tiles.mjs [--apply]
 *
 * Without --apply it reports what it would do and writes nothing.
 */
import sharp from "sharp";
import pg from "pg";

const apply = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.S3_BUCKET) {
  console.error("This script writes to Postgres storage. S3_BUCKET is set; port it before running.");
  process.exit(1);
}

const visuallyIdentical = async (a, b) => {
  const [one, two] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (one.info.width !== two.info.width || one.info.height !== two.info.height) return false;
  for (let p = 0; p < one.data.length; p += 4) {
    if (one.data[p + 3] !== two.data[p + 3]) return false;
    if (one.data[p + 3] === 0) continue;
    if (one.data[p] !== two.data[p] || one.data[p + 1] !== two.data[p + 1] || one.data[p + 2] !== two.data[p + 2]) return false;
  }
  return true;
};

const { rows } = await pool.query(
  `select f.ordinal, f.display_name, i.key, i.mime, i.bytes
     from floors f join floor_images i on i.key = f.image_key
    order by f.ordinal`);

let before = 0, after = 0, changed = 0;
for (const row of rows) {
  before += row.bytes.length;
  const label = `${String(row.ordinal).padStart(7)}  ${row.display_name.slice(0, 26).padEnd(28)}`;

  if (row.mime === "image/webp") {
    after += row.bytes.length;
    console.log(`${label} already webp, skipped`);
    continue;
  }

  const webp = await sharp(row.bytes).webp({ lossless: true, effort: 6 }).toBuffer();
  const saving = 1 - webp.length / row.bytes.length;

  if (saving < 0.1) {
    after += row.bytes.length;
    console.log(`${label} only ${(saving * 100).toFixed(0)}% smaller, left alone`);
    continue;
  }
  if (!(await visuallyIdentical(row.bytes, webp))) {
    after += row.bytes.length;
    console.log(`${label} NOT identical, left alone`);
    continue;
  }

  after += webp.length;
  changed += 1;
  console.log(`${label} ${(row.bytes.length / 1048576).toFixed(2)} MB -> ${(webp.length / 1048576).toFixed(2)} MB  ${(saving * 100).toFixed(0)}%${apply ? "" : "  (dry run)"}`);

  if (apply) {
    await pool.query(`update floor_images set mime = $2, bytes = $3 where key = $1`,
      [row.key, "image/webp", webp]);
  }
}

console.log(`\n${changed}/${rows.length} tiles  ${(before / 1048576).toFixed(0)} MB -> ${(after / 1048576).toFixed(0)} MB  = ${((1 - after / before) * 100).toFixed(0)}% smaller`);
if (!apply) console.log("Dry run. Re-run with --apply to write.");
await pool.end();
