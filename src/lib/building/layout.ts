import { TILE } from "./styleGuide";
import type { Floor } from "@/lib/ai/types";

export const TILE_WIDTH = TILE.width;
export const TILE_HEIGHT = TILE.height;
/** Floors are drawn to butt exactly; overlap is a hedge against seam drift. */
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
