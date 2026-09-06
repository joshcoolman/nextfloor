import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectMime, readDimensions } from "@/lib/image/dimensions";
import type { FloorKind } from "@/lib/ai/types";

/**
 * Hand-drawn tiles supplied as static assets. The roof, the basement and the
 * reference floor are drawn on purpose rather than generated: the reference is
 * the single thing every later floor is matched against, and the caps are seen
 * on every visit.
 *
 * Several filenames are accepted because the art arrives named for what it is
 * rather than for what this code calls it.
 */
const DIR = join(process.cwd(), "public");

const ALIASES: Record<FloorKind, string[]> = {
  floor: ["building/floor", "floor-reference", "middle-floor", "reference-floor"],
  roof: ["building/roof", "top-floor", "roof"],
  basement: ["building/basement", "bottom-floor", "basement"],
};

export interface ImportedTile {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export function readStartingTile(kind: FloorKind): ImportedTile | null {
  for (const base of ALIASES[kind]) {
    for (const extension of ["png", "jpg", "jpeg"]) {
      const path = join(DIR, `${base}.${extension}`);
      if (!existsSync(path)) continue;

      const bytes = readFileSync(path);
      const size = readDimensions(bytes);
      const mimeType = detectMime(bytes);
      if (!size || !mimeType) {
        throw new Error(`public/${base}.${extension} is not a readable PNG or JPEG.`);
      }
      return { bytes, mimeType, width: size.width, height: size.height };
    }
  }
  return null;
}

/**
 * Every tile must share one frame, or the tower steps in and out as it scrolls.
 * Checked across whichever tiles are actually present rather than against a
 * fixed ratio, so the artwork defines the contract instead of this file.
 */
export function assertConsistentTiles(): void {
  const present = (["floor", "roof", "basement"] as FloorKind[])
    .map((kind) => ({ kind, tile: readStartingTile(kind) }))
    .filter((entry): entry is { kind: FloorKind; tile: ImportedTile } => entry.tile !== null);

  if (present.length < 2) return;

  const [first, ...rest] = present;
  for (const other of rest) {
    if (other.tile.width !== first.tile.width || other.tile.height !== first.tile.height) {
      throw new Error(
        `Starting tiles disagree: ${first.kind} is ${first.tile.width}x${first.tile.height} ` +
          `but ${other.kind} is ${other.tile.width}x${other.tile.height}. All tiles must share one frame.`,
      );
    }
  }
}
