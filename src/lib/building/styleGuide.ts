/**
 * Tile geometry. The prose half of the contract -- the style and structure the
 * image model is held to -- lives in `src/lib/prompts/`.
 */

export const TILE = {
  /**
   * Fallback frame, used only when generating a tile with no reference to
   * follow. Real dimensions come from the artwork: every tile in the database
   * carries its own size and the layout follows that.
   */
  aspectRatio: "2:1",
  width: 1774,
  height: 887,
  /**
   * Vertical repeat as a fraction of tile height.
   *
   * In isometric art the frame is much taller than one storey, because it also
   * contains the depth receding away from the viewer. Stacking tiles a full
   * frame apart therefore leaves a large gap. This is the floor-to-floor
   * distance measured against the artwork; tiles are transparent PNGs, so
   * overlapping them composites cleanly rather than hiding the floor below.
   */
  pitchRatio: 0.42,
} as const;

export const BASE_FLOOR_THEME = "the ground floor lobby of an old mixed-use city building";
export const ROOF_THEME = "the roof of the building";
export const BASEMENT_THEME = "the basement of the building";
