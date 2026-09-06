/* eslint-disable @typescript-eslint/no-explicit-any */
import { TILE } from "@/lib/building/styleGuide";
import { RefusalError } from "../errors";
import type { ImageProvider, Reference } from "./types";

const BASE = "https://fal.run";

/**
 * Nano Banana, not FLUX. FLUX is photoreal-leaning and reads a long structural
 * prompt as a brief for an architectural render -- it produced a clean, empty,
 * white-background CAD cutaway and ignored the pixel-art instruction entirely.
 * The Gemini-class models follow long structured prompts and draw pixel art.
 *
 * Two endpoints, because the two jobs differ. The seed tile has nothing to
 * match, so it is text to image. Every later tile is an edit of the reference
 * floor, which is a stronger guarantee than conditioning: the model is asked to
 * keep the shell and replace only the interior.
 */
const SEED_MODEL = process.env.FAL_SEED_MODEL || "fal-ai/nano-banana-2";
/**
 * Nano Banana over FLUX 2 Pro Edit, decided by a head-to-head on the same
 * reference: both preserved the shell, but FLUX 2 rendered the interior as
 * smooth comic illustration while Nano Banana held the pixel-art style. Set
 * FAL_EDIT_MODEL to fal-ai/flux-2-pro/edit to compare again.
 */
const EDIT_MODEL = process.env.FAL_EDIT_MODEL || "fal-ai/nano-banana-pro/edit";

/** Most permissive. Refusals are meant to produce dead floors, not silent blocks. */
const SAFETY_TOLERANCE = "6";

/** Matches the tile contract: enough resolution to zoom into the detail. */
const RESOLUTION = "4K";

export const fal: ImageProvider = {
  name: "fal",
  outputFormat: "png",

  async generate(apiKey: string, prompt: string, reference: Reference | null) {
    const model = reference ? EDIT_MODEL : SEED_MODEL;
    const input: Record<string, unknown> = {
      // The edit prompt already carries the reference contract in full.
      prompt,
      aspect_ratio: TILE.aspectRatio,
      output_format: "png",
      resolution: RESOLUTION,
      num_images: 1,
      safety_tolerance: SAFETY_TOLERANCE,
    };

    if (reference) {
      input.image_urls = [
        reference.url ??
          `data:${reference.mimeType};base64,${reference.bytes.toString("base64")}`,
      ];
    }

    const response = await fetch(`${BASE}/${model}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Key ${apiKey}` },
      body: JSON.stringify(input),
    });

    const raw = await response.text();
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Non-JSON responses still need reporting.
    }

    if (!response.ok) {
      const detail =
        body?.detail?.[0]?.msg ??
        (typeof body?.detail === "string" ? body.detail : null) ??
        body?.error ??
        raw.slice(0, 400).trim();
      const message = `Image model returned ${response.status}: ${detail || "no detail given"}`;
      console.error("[nextfloor] fal failed", response.status, raw.slice(0, 2000));
      if (/safety|nsfw|policy|prohibited/i.test(message)) {
        throw new RefusalError(message, "image_safety");
      }
      throw new Error(message);
    }

    if (body?.has_nsfw_concepts?.[0]) {
      throw new RefusalError(
        "The image model's safety filter blanked this floor.",
        "image_safety",
      );
    }

    const image = body?.images?.[0];
    if (!image?.url) {
      console.error("[nextfloor] fal returned no artwork", raw.slice(0, 2000));
      throw new RefusalError("The image model returned no artwork for this floor.", "image_no_output");
    }

    const download = await fetch(image.url);
    if (!download.ok) {
      throw new Error(`Could not download the generated tile (${download.status}).`);
    }

    return {
      bytes: Buffer.from(await download.arrayBuffer()),
      mimeType: image.content_type ?? "image/png",
      width: 0,
      height: 0,
    };
  },
};
