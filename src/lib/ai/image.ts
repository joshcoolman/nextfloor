import { TILE } from "@/lib/building/styleGuide";
import { readDimensions } from "@/lib/image/dimensions";
import { ContractError, RefusalError } from "./errors";

const MODEL = "gemini-3.1-flash-image";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  return parts.map((part) =>
    part?.inlineData || part?.inline_data
      ? {
          type: "image",
          data: (part.inlineData ?? part.inline_data).data,
          mime_type: (part.inlineData ?? part.inline_data).mimeType ?? (part.inline_data ?? {}).mime_type,
        }
      : { type: "text", text: part?.text },
  );
}

/** Allowed drift from 21:9 before a tile is rejected and regenerated. */
const ASPECT_TOLERANCE = 0.02;

export interface GeneratedTile {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * The reference tile is passed on every call. It is what holds palette, line
 * weight and lighting coherent across independently generated floors -- the
 * prompt alone is not enough.
 */
export async function generateFloorImage(
  apiKey: string,
  prompt: string,
  reference: { bytes: Buffer; mimeType: string } | null,
): Promise<GeneratedTile> {
  const input: unknown[] = [{ type: "text", text: prompt }];
  if (reference) {
    input.push({
      type: "text",
      text:
        "Match this reference tile exactly for building geometry, cutaway angle, " +
        "pixel scale, line weight, palette and lighting treatment. It is the floor " +
        "directly below. Only the interior contents differ.",
    });
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
        mime_type: TILE.mimeType,
        aspect_ratio: TILE.aspectRatio,
        image_size: TILE.imageSize,
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
    // The image model's own words are the only useful debugging signal here,
    // so carry them all the way to the caller instead of the status code alone.
    const detail =
      body?.error?.message ??
      body?.message ??
      body?.error?.status ??
      raw.slice(0, 400).trim();
    const message = `Image model returned ${response.status}: ${detail || "no detail given"}`;
    console.error("[nextfloor] image generation failed", response.status, raw.slice(0, 2000));
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
    console.error("[nextfloor] image model returned no artwork", raw.slice(0, 2000));
    throw new RefusalError(
      said || "The image model returned no artwork for this floor.",
      "image_no_output",
    );
  }

  const bytes = Buffer.from(image.data, "base64");
  const size = readDimensions(bytes);
  if (!size) throw new ContractError("Generated tile was not a readable PNG or JPEG.");

  const [w, h] = TILE.aspectRatio.split(":").map(Number);
  const target = w / h;
  const actual = size.width / size.height;
  if (Math.abs(actual - target) / target > ASPECT_TOLERANCE) {
    throw new ContractError(
      `Generated tile is ${size.width}x${size.height}, which is not ${TILE.aspectRatio}.`,
    );
  }

  return {
    bytes,
    mimeType: image.mime_type ?? TILE.mimeType,
    width: size.width,
    height: size.height,
  };
}
