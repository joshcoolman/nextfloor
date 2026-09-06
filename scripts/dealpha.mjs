#!/usr/bin/env node
/**
 * Restores real transparency to tiles whose background is opaque -- usually a
 * transparency checkerboard exported as actual grey squares.
 *
 * Usage: node scripts/dealpha.mjs public/bottom-floor.png [...more]
 *
 * Shares its implementation with the generation pipeline, which runs the same
 * pass on every tile the image model returns.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { restoreAlpha } from "../src/lib/image/alpha.ts";

for (const path of process.argv.slice(2)) {
  const before = readFileSync(path);
  const after = await restoreAlpha(before);
  if (after === before) {
    console.log(`${path}: already transparent, left alone`);
    continue;
  }
  writeFileSync(path, after);
  console.log(`${path}: alpha restored (${before.length} -> ${after.length} bytes)`);
}
