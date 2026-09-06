/**
 * Tile geometry. The prose half of the contract -- the style and structure the
 * image model is held to -- lives in `src/lib/prompts/`.
 */

export const TILE = {
  /** Hard constraint from image model support. A floor band is not free-form. */
  aspectRatio: "21:9",
  /**
   * Fraction of tile height that the slab occupies. Tiles stack with this much
   * overlap so the upper tile's concrete slab covers the lower tile's ceiling
   * line, and seam drift hides inside the concrete instead of showing as a gap.
   */
  slabOverlap: 0.035,
} as const;

export const BASE_FLOOR_THEME = "the ground floor lobby of an old mixed-use city building";
export const ROOF_THEME = "the roof of the building";
export const BASEMENT_THEME = "the basement of the building";
