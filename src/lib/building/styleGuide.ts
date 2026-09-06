/**
 * The Building Style Guide.
 *
 * This is the immutable contract every floor tile obeys. It is the reason
 * independently generated floors read as one continuous building, so the
 * structural language below must stay byte-identical across generations --
 * only the interior description changes. Edit with care: changing this file
 * invalidates the visual compatibility of every floor generated before it.
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

/** Structural language. Identical in every prompt, every generation. */
export const STRUCTURE = `
STRUCTURE (immutable -- identical in every floor of this building):
- One single floor of a cutaway building, seen in isometric projection.
- The camera is dead-on. The building's left and right cut edges are exactly
  vertical in frame. Interior depth recedes back and to the right.
- The building fills the frame edge to edge, left to right, with no margin.
- Far left edge band (about 7% of the width): an exterior steel stair and fire
  escape tower, bolted to the facade, running vertically off the top and bottom
  of the frame. Same position and width in every floor.
- Far right edge band (about 7% of the width): an elevator shaft with a lit car,
  alongside vertical pipe runs and conduit, running vertically off the top and
  bottom of the frame. Same position and width in every floor.
- Along the bottom edge: a thick grey poured-concrete floor slab with a visible
  chipped edge, spanning the full width. Identical in every floor.
- Above the slab, the interior is a single open cutaway storey divided into
  five or six rooms by interior partition walls.
- Both stair tower and elevator shaft connect through this floor to the floors
  above and below. Nothing about the exterior shell changes between floors.
`.trim();

/** Visual language. Also identical in every prompt. */
export const STYLE = `
STYLE (immutable):
- Detailed pixel art. Crisp pixels, limited palette, consistent pixel scale.
- Background outside the building is flat near-black navy (#12131f). Opaque.
- Dark ambient light. Every bright area comes from a practical light source in
  the scene: lamps, screens, neon, windows, fire. Saturated colour appears only
  in those light sources, their spill, and signage.
- Dense with small human-scale detail. Tiny figures, roughly 5 to 12 of them,
  going about their business. Props, clutter, wear, plants, cables, posters.
- The floor should reward close inspection. Small jokes and small stories.
- No text captions, no title, no border, no frame, no watermark.
- Do not draw a floor number.
`.trim();

export const BASE_FLOOR_THEME = "the ground floor lobby of an old mixed-use city building";
export const ROOF_THEME = "the roof of the building";
export const BASEMENT_THEME = "the basement of the building";

/**
 * The caps are generated once and pinned to the top and bottom of the stack.
 * They keep the shell and the two vertical anchors so the tower terminates
 * instead of ending on a raw cut edge.
 */
export const CAP_STRUCTURE: Record<"roof" | "basement", string> = {
  roof: `
STRUCTURE (immutable -- this is the roof cap of the building):
- The roof of a cutaway building, seen in isometric projection.
- The camera is dead-on. The building's left and right cut edges are exactly
  vertical in frame. Roof depth recedes back and to the right.
- The building fills the frame edge to edge, left to right, with no margin.
- Far left edge band (about 7% of the width): the exterior steel stair and fire
  escape tower arrives here and terminates in a stair bulkhead with a door.
- Far right edge band (about 7% of the width): the elevator shaft terminates in
  a lift motor room, with vent stacks and pipe runs beside it.
- Along the bottom edge: a thick grey poured-concrete floor slab with a visible
  chipped edge, spanning the full width. Identical to every floor below.
- Above the slab is open sky-facing roof deck: parapet wall, water tank on a
  steel frame, HVAC units, antennas, ducts, puddles, gravel.
- Nothing above the parapet except night sky.
`.trim(),
  basement: `
STRUCTURE (immutable -- this is the basement of the building):
- The lowest floor of a cutaway building, seen in isometric projection, cut into
  the ground.
- The camera is dead-on. The building's left and right cut edges are exactly
  vertical in frame. Interior depth recedes back and to the right.
- The building fills the frame edge to edge, left to right, with no margin.
- Far left edge band (about 7% of the width): the stair tower arrives from above
  and ends at a landing on the basement floor.
- Far right edge band (about 7% of the width): the elevator shaft bottoms out in
  a pit with buffers, beside vertical pipe runs and conduit.
- The walls here are old rough stone and brick foundation, not facade.
- Along the bottom edge: a thick grey poured-concrete slab footing with a visible
  chipped edge, spanning the full width.
- Above it, a single storey of basement divided into five or six spaces.
`.trim(),
};
