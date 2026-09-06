#!/usr/bin/env node
/**
 * Re-cleans generated floor tiles already stored in the database.
 *
 * Tiles keyed before edge de-fringing existed carry a rim of the background
 * they were drawn over -- white speckle around the building. This runs the
 * current de-fringe over them in place.
 *
 * Static tiles imported from public/ are skipped: they have genuine alpha and
 * nothing to repair.
 *
 * Usage: node scripts/refringe.mjs [--dry]
 */
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { defringeImage } from "../src/lib/image/alpha.ts";

// Plain node does not read .env.local the way Next does, so load it here rather
// than making every invocation prefix the connection string by hand.
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set, and no .env.local was found. Run from the repo root.");
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows } = await pool.query(
  `select f.id, f.display_name, f.image_key, i.bytes, i.mime
     from floors f
     join floor_images i on i.key = f.image_key
    where coalesce(f.meta->>'source', '') <> 'public'
      and f.status = 'ready'
    order by f.ordinal`,
);

if (!rows.length) {
  console.log("No generated tiles to clean.");
} else {
  for (const row of rows) {
    const cleaned = await defringeImage(row.bytes);
    const delta = cleaned.length - row.bytes.length;
    if (dry) {
      console.log(`${row.display_name}: would rewrite (${delta >= 0 ? "+" : ""}${delta} bytes)`);
      continue;
    }
    await pool.query(`update floor_images set bytes = $1, mime = 'image/png' where key = $2`, [
      cleaned,
      row.image_key,
    ]);
    console.log(`${row.display_name}: cleaned`);
  }
}

await pool.end();
