# Floor Edit Instructions

Sent with the reference tile for every floor after the first. The reference is a
locked template: the model changes the tenants, never the building.

Adapted from a prompt that produced the original reference artwork. One thing was
deliberately changed: the original asked for the complete floor module to be
visible with a clean exterior around it, which leaves a margin and prevents tiles
from butting together. Floors here must bleed to the frame edges instead.

Placeholders: `{{theme}}` and `{{content}}`.

---

## EDIT

Create ONE new floor for a large continuous isometric pixel-art cutaway building.

USER THEME: "{{theme}}"

IMPORTANT: The supplied reference image defines the permanent architecture,
camera, scale, pixel-art style, dimensions, structural shell, and perspective of
the building. You are NOT designing a new building. You are creating a new themed
interior inside exactly the same architectural floor module.

PRESERVE THE REFERENCE GEOMETRY EXACTLY.

The generated floor must stack directly above and below other independently
generated floors made from the same reference, and appear to be one continuous
building.

STRUCTURAL REQUIREMENTS -- keep exactly the same:
- isometric viewing angle, camera position, camera distance
- floor width, floor height, ceiling height
- exterior left and right walls, exterior silhouette, wall thickness
- floor slab thickness, ceiling slab thickness, structural columns
- elevator and service shaft position
- stair and circulation connection positions
- openings at the top and bottom of the module
- scale of doors, furniture, people and props
- pixel density and pixel-art rendering style

Do not crop, zoom, rotate, tilt, resize, widen, narrow, or otherwise modify the
architectural shell. Think of the reference architecture as a locked template.
Only redesign the spaces INSIDE the floor.

FRAMING -- the frame is 2048 x 512, aspect ratio 4:1. The reference bleeds off
all four edges of the image, and so must this:
- The left and right edges of the image cut through the same exterior elements,
  at the same pixel positions, as the reference.
- The top edge cuts straight through the ceiling slab and the bottom edge cuts
  straight through the floor slab, exactly as in the reference.
- No margin, no border, no empty band, no visible background environment around
  the building. Any sliver of sky past the shell is pure black, as in the
  reference.
- The storey is OPEN at the top and bottom, exactly as the reference is, so that
  identical floors butt against it above and below with no seam.
- Do not add another floor, a roof, or a basement. Generate exactly ONE module.
- Do not place floating objects outside the building.

THEME INTERPRETATION

Interpret the theme creatively as a richly populated environment. Do not merely
place a few obvious themed objects -- transform the entire interior into a
believable miniature world. Three to six distinct visual areas within the floor,
filled with small details: furniture, equipment, decoration, signage, lighting,
tiny characters, storage, clutter, cables, pipes, shelves, posters, machines,
plants, food, tools, and amusing background details.

Characters should be doing things rather than standing still. The scene should
reward zooming in. Include tiny visual jokes, unusual situations, and small
narrative moments.

Evoke the era or genre; do not reproduce copyrighted characters, logos or game
titles. Invent near-misses instead. Signage is shape, colour and logo rather than
readable words -- generated lettering comes out garbled and breaks the illusion.

{{content}}

VISUAL STYLE

Highly detailed handcrafted isometric pixel art. Dense visual storytelling. Crisp
intentional pixel clusters. Strong readable silhouettes. Small sprite-like
people. Dark outlines where they aid readability. Rich but controlled palette.
Warm pools of interior light mixed with occasional coloured practical lighting
appropriate to the theme. Industrial building shell contrasted with colourful
inhabited interiors. A miniature living world seen through the cutaway side of a
gigantic building.

Avoid smooth vector illustration, painterly brushwork, photorealism, 3D-rendered
realism, blurry detail, and anti-aliased edges. Do not oversize objects; maintain
the miniature scale of the reference.

CONTINUITY

This image is one component of a potentially 100-floor building. Consistency
matters more than novelty in the exterior architecture; creative freedom belongs
inside the rooms. The shell must remain boringly consistent -- every floor is the
same prefabricated module occupied by completely different tenants.

At first glance the result should look like another floor of the exact building
in the reference. Only on looking inside should the viewer discover it has become
"{{theme}}".
