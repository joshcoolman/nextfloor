/* eslint-disable @typescript-eslint/no-explicit-any */
import { TILE } from "@/lib/building/styleGuide";
import { RefusalError } from "../errors";
import { REFERENCE_INSTRUCTION, type ImageProvider, type Reference } from "./types";

const MODEL = "gemini-3.1-flash-image";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Gemini's interactions endpoint rejects image/png and emits JPEG only. Pixel
 * art is the worst case for JPEG ringing, so tiles are generated at 4K to keep
 * the compression noise below the apparent size of a drawn pixel.
 */
const IMAGE_SIZE = "4K";

interface Block {
  type: string;
  data?: string;
  text?: string;
  mime_type?: string;
}

/**
 * Reads the image out of a response. The interactions endpoint returns
 * `steps[].content[]`; the older generateContent shape returns
 * `candidates[].content.parts[]`. Accept either rather than break on a rename.
 */
function collectBlocks(body: any): Block[] {
  const steps: Block[] = (body?.steps ?? [])
    .filter((step: any) => step?.type === "model_output")
    .flatMap((step: any) => step?.content ?? []);
  if (steps.length) return steps;

  const parts: any[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => {
    const inline = part?.inlineData ?? part?.inline_data;
    return inline
      ? { type: "image", data: inline.data, mime_type: inline.mimeType ?? inline.mime_type }
      : { type: "text", text: part?.text };
  });
}

export const gemini: ImageProvider = {
  name: "gemini",
  outputFormat: "jpeg",

  async generate(apiKey: string, prompt: string, reference: Reference | null) {
    const input: unknown[] = [{ type: "text", text: prompt }];
    if (reference) {
      input.push({ type: "text", text: REFERENCE_INSTRUCTION });
      input.push({
        type: "image",
        mime_type: reference.mimeType,
        data: reference.bytes.toString("base64"),
      });
    }

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model: MODEL,
        input,
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: TILE.aspectRatio,
          image_size: IMAGE_SIZE,
        },
      }),
    });

    const raw = await response.text();
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Non-JSON responses (proxy errors, HTML error pages) still need reporting.
    }

    if (!response.ok) {
      const detail =
        body?.error?.message ?? body?.message ?? raw.slice(0, 400).trim() ?? "";
      const message = `Image model returned ${response.status}: ${detail || "no detail given"}`;
      console.error("[nextfloor] gemini failed", response.status, raw.slice(0, 2000));
      if (/safety|blocked|policy|prohibited/i.test(message)) {
        throw new RefusalError(message, "image_safety");
      }
      throw new Error(message);
    }

    const blocks = collectBlocks(body);
    const image = blocks.find((block) => block.type === "image" && block.data);
    if (!image?.data) {
      const said = blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join(" ")
        .trim();
      console.error("[nextfloor] gemini returned no artwork", raw.slice(0, 2000));
      throw new RefusalError(
        said || "The image model returned no artwork for this floor.",
        "image_no_output",
      );
    }

    return {
      bytes: Buffer.from(image.data, "base64"),
      mimeType: image.mime_type ?? "image/jpeg",
      width: 0,
      height: 0,
    };
  },
};
