/**
 * Tile geometry. The prose half of the contract -- the style and structure the
 * image model is held to -- lives in `src/lib/prompts/`.
 */

export const TILE = {
  /**
   * From the building spec sheet: 2048 x 512, aspect ratio 4:1, every floor
   * identical. Not a free choice -- the reference art is drawn to it.
   */
  aspectRatio: "4:1",
  width: 2048,
  height: 512,
  /**
   * Regular floors are drawn open at the top and bottom and are designed to
   * butt exactly, so no overlap is needed. Raise this only if real tiles show
   * a seam.
   */
  slabOverlap: 0,
} as const;

export const BASE_FLOOR_THEME = "the ground floor lobby of an old mixed-use city building";
export const ROOF_THEME = "the roof of the building";
export const BASEMENT_THEME = "the basement of the building";
