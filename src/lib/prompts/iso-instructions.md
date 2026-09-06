# Building Style Guide

The immutable contract every floor tile obeys. This is what makes independently
generated floors read as one continuous building.

Edit freely while tuning — but understand that changing it invalidates the
visual compatibility of every floor generated before the change.

Placeholders: `{{structure}}` and `{{content}}`.

---

## LEAD

Detailed 16-bit PIXEL ART game sprite art, in the style of a dense isometric
cutaway of a busy apartment block at night. Hand-drawn crisp pixels, visible
pixel grid, flat blocks of colour, hard aliased edges, limited palette. Crowded
with tiny pixel characters and clutter, warm glowing practical lights against
darkness. Absolutely NOT a photograph, NOT a 3D render, NOT a CAD drawing, NOT an
architectural visualisation. No smooth gradients, no realistic materials, no
camera depth of field. The frame is a very wide, short band -- 2048 x 512 pixels,
aspect ratio 4:1 -- and the interior fills it entirely, corner to corner,
bleeding off every side with no black band, border or empty margin anywhere.

## STYLE

STYLE (immutable):
- Detailed pixel art. Crisp pixels, limited palette, consistent pixel scale.
- Everything outside the building is flat, uniform, pure magenta (#FF00FF),
  solid and even, with no texture, pattern, gradient or detail. Nothing of the
  scene extends into it: no shadows, no glow, no spill of light.
- Dark ambient light. Every bright area comes from a practical light source in
  the scene: lamps, screens, neon, windows, fire. Saturated colour appears only
  in those light sources, their spill, and signage.
- Dense with small human-scale detail. Tiny figures, roughly 5 to 12 of them,
  going about their business. Props, clutter, wear, plants, cables, posters.
- The floor should reward close inspection. Small jokes and small stories.
- No text captions, no title, no border, no frame, no watermark.
- Do not draw a floor number.

## STRUCTURE

{{structure}}

## CONTENT

{{content}}
