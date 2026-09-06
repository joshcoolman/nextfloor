import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectMime, readDimensions } from "@/lib/image/dimensions";
import { TILE } from "./styleGuide";
import type { FloorKind } from "@/lib/ai/types";

/**
 * Hand-made starting tiles. Dropping artwork in `public/building/` is better
 * than generating the first three floors: the reference tile is the single
 * thing every later floor is matched against, so it is worth drawing on
 * purpose rather than rolling for it.
 */
const DIR = join(process.cwd(), "public", "building");

const NAMES: Record<FloorKind, string> = {
  floor: "floor",
  roof: "roof",
  basement: "basement",
};

export interface ImportedTile {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export function readStartingTile(kind: FloorKind): ImportedTile | null {
  for (const extension of ["png", "jpg", "jpeg"]) {
    const path = join(DIR, `${NAMES[kind]}.${extension}`);
    if (!existsSync(path)) continue;

    const bytes = readFileSync(path);
    const size = readDimensions(bytes);
    const mimeType = detectMime(bytes);
    if (!size || !mimeType) {
      throw new Error(`public/building/${NAMES[kind]}.${extension} is not a readable PNG or JPEG.`);
    }
    // A starting tile at the wrong ratio would silently mismatch every floor
    // generated against it, so fail loudly at import instead.
    const [w, h] = TILE.aspectRatio.split(":").map(Number);
    const target = w / h;
    const actual = size.width / size.height;
    if (Math.abs(actual - target) / target > 0.02) {
      throw new Error(
        `public/building/${NAMES[kind]}.${extension} is ${size.width}x${size.height}, ` +
          `which is not ${TILE.aspectRatio}. Every tile must share one aspect ratio.`,
      );
    }

    return { bytes, mimeType, width: size.width, height: size.height };
  }
  return null;
}

export function hasStartingTiles(): boolean {
  return readStartingTile("floor") !== null;
}
