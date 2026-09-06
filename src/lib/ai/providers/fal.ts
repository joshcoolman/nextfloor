/* eslint-disable @typescript-eslint/no-explicit-any */
import { TILE } from "@/lib/building/styleGuide";
import { RefusalError } from "../errors";
import { REFERENCE_INSTRUCTION, type ImageProvider, type Reference } from "./types";

const BASE = "https://fal.run";

/**
 * Two models, because the two jobs are different. The seed tile has nothing to
 * match, so it is text to image. Every later tile is an edit of the reference
 * floor -- which is a stronger guarantee than reference conditioning: the model
 * is asked to keep the shell and replace only the interior.
 */
const SEED_MODEL = "fal-ai/flux-pro/v1.1-ultra";
const EDIT_MODEL = "fal-ai/flux-pro/kontext";

/** Most permissive. Refusals are meant to produce dead floors, not silent blocks. */
const SAFETY_TOLERANCE = "6";

export const fal: ImageProvider = {
  name: "fal",
  outputFormat: "png",

  async generate(apiKey: string, prompt: string, reference: Reference | null) {
    const model = reference ? EDIT_MODEL : SEED_MODEL;
    const input: Record<string, unknown> = {
      prompt: reference ? `${prompt}\n\n${REFERENCE_INSTRUCTION}` : prompt,
      aspect_ratio: TILE.aspectRatio,
      output_format: "png",
      num_images: 1,
      safety_tolerance: SAFETY_TOLERANCE,
    };

    if (reference) {
      // fal accepts a data URI wherever it accepts an image URL, which keeps the
      // reference tile off the public internet.
      input.image_url = `data:${reference.mimeType};base64,${reference.bytes.toString("base64")}`;
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
