# Floor Edit Instructions (basic)

An experiment, not a replacement. `edit-instructions.md` is the working prompt
and is not to be edited to match this one.

The hypothesis: most of the working prompt argues with the reference image
rather than adding to it. Three separate sections tell the model to match the
reference tile it already has in hand, and a PURPOSE section explains HTML
layering to something that does not lay out HTML. This file states each
constraint once and leaves the reference to carry the rest -- 494 words down to
about 170.

What is deliberately kept, because it was earned rather than written:

- The floor number instruction. Shorter, but still explicit about replacing the
  reference's number rather than adding a second one.
- The guard against a standalone building or an exterior scene.
- The transparent surround and predictable top/bottom edges, without which the
  tiles cannot overlap.
- Pixel art stated as firmly as before. It is the one thing a weaker prompt
  loses first, and the whole look rests on it.

What is NOT tested here: the THEME DETAILS block, which is the larger half of
the prompt and is built by `composeContent()` in TypeScript, not by this file.
Changing both at once would make the result unreadable.

Set `EDIT_PROMPT=basic` to use this file. Anything else uses the working prompt.

Placeholders: `{{theme}}`, `{{number}}` and `{{content}}`.

---

## EDIT

Create ONE modular middle-floor tile for a vertically stackable isometric
pixel-art building, by editing the supplied reference tile.

THEME: {{theme}}

FLOOR NUMBER:
The reference has a floor number painted large on the exterior wall beside the
elevator door. Replace it with {{number}} -- same position, size, font, colour
and weathering, with the reference's own number gone. It must be legible, and
must appear nowhere else on the floor.

KEEP FROM THE REFERENCE:
Everything structural. Camera angle, building dimensions, wall and floor
thickness, left and right endpoints, pixel density, art direction, and the clean
transparent surround that lets floors overlap when they are stacked. This is one
module of a taller building, not a standalone illustration, a separate building,
or an exterior scene.

CHANGE:
The interior only -- architecture, props, furniture, characters, lighting,
signage, activity. Express "{{theme}}" through those rather than through a sign
naming it. Fill the floor with 4-6 distinct areas, people using them, and small
details that reward zooming in.

STYLE:
Highly detailed isometric pixel art, 16/32-bit game aesthetic. Crisp deliberate
pixel edges, consistent pixel density and object scale, rich interior lighting,
tiny expressive characters. Dense but readable.

{{content}}
