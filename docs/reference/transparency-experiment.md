# Nano Banana artwork with a separate alpha mask

GPT Image 2.5 produced excellent native transparency but did not match the
desired pixel-art rendering, including with Sunburst, increased quality,
larger output and an additional style reference. Its rendering experiment has
been removed. Existing generated floors and comparison images remain intact.

This experiment keeps Nano Banana's original prompt, reference and render
settings. Set `FAL_TRANSPARENCY=birefnet` in `.env.local`, restart `pnpm dev`, and
create a floor. It runs only in development on unsponsored requests.

After artwork generation, `fal-ai/birefnet/v2` estimates a fresh mask from that
specific image using `General Use (Light 2K)` at `2048x2048`, `mask_only: true`,
and `refine_foreground: false`. The mask changes only alpha; existing source
alpha is multiplied by mask coverage. RGB and canvas dimensions are preserved.
There is no flood fill, defringing, sharpening, fixed reference cutout, second
artwork generation, or delivery re-encoding on this path.

Each attempt retains `raw.png` (or the source's corresponding extension),
`mask.png`, `result.png`, and `report.json` under
`.local/transparency/<floor-id>/`. Reports record model settings, hashes,
coverage and detached-pixel measurements. Invalid masks fail the floor with a
transparency-stage error; the original remains available for another mask
attempt. No automatic fallback hides the failure.

To test masking again without regenerating artwork:

```sh
pnpm transparency:mask .local/transparency/<floor-id>/raw.png
```

This makes one paid mask request and saves a separate `manual-*` directory.
Use untouched renders: old repaired images cannot recover pixels already erased.

Inspect native-size details and composite over black, white, and neighbouring
floors. Check dark outlines, rear-wall changes, thin pipes, railings, holes,
external glow and detached debris. A clean outline must not come at the cost of
clipping artwork. The coverage/debris checks reject obvious failures; they do
not prove a silhouette is correct. Soft alpha and baked-in background colour
can still cause halos and need evaluation before further processing is added.

A fixed reference mask is unsuitable because the rear-wall silhouette varies.
A reference could later guide an uncertain boundary, but the first evaluation
uses a mask derived entirely from each new render.

Remove `FAL_TRANSPARENCY` to return to the existing local flood-fill path.
Production and sponsored generation retain their existing path until quality,
latency and the additional mask cost have been evaluated.

API: https://fal.ai/models/fal-ai/birefnet/v2/api
