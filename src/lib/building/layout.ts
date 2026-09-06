import { TILE } from "./styleGuide";
import type { Floor } from "@/lib/ai/types";

/** Content-space width of one tile. Matches the generated tile's 2K width. */
export const TILE_WIDTH = 2560;
export const TILE_HEIGHT = Math.round((TILE_WIDTH * 9) / 21);
/** Tiles overlap by the slab so seam drift hides inside the concrete. */
export const TILE_PITCH = Math.round(TILE_HEIGHT * (1 - TILE.slabOverlap));

export interface PlacedFloor {
  floor: Floor;
  /** Content-space y of the tile's top edge. */
  top: number;
  center: number;
  /** Number shown in the gutter. Null for the caps. */
  label: number | null;
}

/** Top of the tower first, which is how the building is read on screen. */
export function placeFloors(floors: Floor[]): PlacedFloor[] {
  const ordered = [...floors].sort((a, b) => b.ordinal - a.ordinal);
  return ordered.map((floor, index) => ({
    floor,
    top: index * TILE_PITCH,
    center: index * TILE_PITCH + TILE_HEIGHT / 2,
    label: floor.kind === "floor" ? Math.round(floor.ordinal) : null,
  }));
}

export function towerHeight(count: number): number {
  return count === 0 ? TILE_HEIGHT : (count - 1) * TILE_PITCH + TILE_HEIGHT;
}
