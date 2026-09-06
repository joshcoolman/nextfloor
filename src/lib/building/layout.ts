import { TILE } from "./styleGuide";
import type { Floor } from "@/lib/ai/types";

/** Fallbacks only; a building with floors in it uses the floors' own size. */
export const TILE_WIDTH = TILE.width;
export const TILE_HEIGHT = TILE.height;
export const TILE_PITCH = Math.round(TILE_HEIGHT * TILE.pitchRatio);

export interface Frame {
  width: number;
  height: number;
  pitch: number;
}

/** The artwork defines the frame. Constants are only used for an empty building. */
export function frameOf(floors: Floor[]): Frame {
  const sized = floors.find((floor) => floor.width && floor.height);
  const width = sized?.width ?? TILE_WIDTH;
  const height = sized?.height ?? TILE_HEIGHT;
  return { width, height, pitch: Math.round(height * TILE.pitchRatio) };
}

export interface PlacedFloor {
  floor: Floor;
  /** Content-space y of the tile's top edge. */
  top: number;
  center: number;
  /** Number shown in the gutter. Null for the caps. */
  label: number | null;
}

/** Top of the tower first, which is how the building is read on screen. */
export function placeFloors(floors: Floor[], frame: Frame): PlacedFloor[] {
  const ordered = [...floors].sort((a, b) => b.ordinal - a.ordinal);
  return ordered.map((floor, index) => ({
    floor,
    top: index * frame.pitch,
    center: index * frame.pitch + frame.height / 2,
    label: floor.kind === "floor" ? Math.round(floor.ordinal) : null,
  }));
}

export function towerHeight(count: number, frame: Frame): number {
  return count === 0 ? frame.height : (count - 1) * frame.pitch + frame.height;
}
