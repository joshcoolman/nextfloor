# Floor Edit Instructions

Sent with the reference tile for every generated floor. The reference is a locked
template: the model changes the tenants, never the building.

Placeholders: `{{theme}}`, `{{number}}` and `{{content}}`. `{{content}}` is the
THEME DETAILS block produced by the Theme Interpreter.

---

## EDIT

Create ONE modular middle-floor tile for a vertically stackable isometric
pixel-art building.

THEME: {{theme}}

FLOOR NUMBER -- THE ONE PERMITTED EXTERIOR CHANGE:
The reference tile has a floor number painted large on the exterior wall beside
the elevator door. This floor is number {{number}}. Paint {{number}} in that
exact position, at the same size, in the same font, colour and weathering as the
reference's number, and remove the reference's number completely. Everything
else about that wall and the rest of the exterior stays identical. The number
{{number}} must appear there, must be clearly legible, and must not appear
anywhere else on the floor. Do not copy the reference's number.

PURPOSE:
This image is one independently generated floor in a potentially very tall
building. Many floor images will be layered together in HTML. Therefore the
exterior geometry, camera, scale, and connection edges must remain extremely
consistent between generations.

STRUCTURAL REQUIREMENTS -- DO NOT VARY:
- One long, wide isometric cutaway floor.
- Fixed 3/4 isometric camera angle.
- Camera position and perspective must remain identical between floors.
- Long horizontal building footprint running left-to-right.
- Entire floor visible; nothing cropped by the image boundaries.
- Same approximate floor width, depth, wall height, and structural proportions
  as the reference floor.
- Front edge forms one continuous isometric building ledge.
- Rear wall follows the same isometric angle.
- Left and right structural endpoints must remain in the same positions.
- Maintain consistent concrete/steel structural framing.
- Keep major columns and building-edge geometry consistent.
- Floor must visually connect to another identical module immediately above and
  below it.
- Do not create a standalone floating island, separate building, perspective
  variation, or exterior environment.

COMPOSITION:
The structural shell is fixed. The theme changes ONLY the interior architecture,
decorations, occupants, props, lighting, signage, furniture, and environmental
storytelling.

Populate the floor densely with many small details and miniature scenes. Create
approximately 4-6 visually distinct areas across the floor. Include people
interacting naturally with the environment. Include small humorous or interesting
details that reward zooming in.

STYLE:
Highly detailed isometric pixel art. Crisp deliberate pixel edges. 16/32-bit
game-art aesthetic. Dense environmental storytelling. Dark industrial building
structure. Rich interior lighting. Tiny expressive pixel-art characters. Highly
detailed but visually readable. Consistent pixel density and object scale
throughout.

THEME INTERPRETATION:
Interpret "{{theme}}" creatively and immediately recognizably. Do not simply
place a sign containing the theme. Express the theme through architecture, props,
furniture, characters, lighting, activities, signage, and environmental details.

{{content}}

TRANSPARENCY -- CRITICAL:
Output PNG with TRUE ALPHA TRANSPARENCY. Everything outside the building tile
must be fully transparent. Do NOT draw a white, black, colored, gradient, or
scenic background. Do NOT simulate transparency. No shadows extending onto an
imaginary background.

STACKING:
This is a modular building component, not a complete illustration. Preserve clean
transparent space surrounding the building. The top/rear structural boundary and
bottom/front structural boundary must remain clean and predictable so adjacent
floor PNGs can overlap slightly when positioned in HTML.

REFERENCE IMAGE:
Match the supplied reference image closely for camera angle, building dimensions,
perspective, structural geometry, pixel density, wall thickness, floor thickness,
framing, left/right endpoints, and overall art direction.

Change the INTERIOR CONTENT to match "{{theme}}". Do not redesign the fundamental
building module.
