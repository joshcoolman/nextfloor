import { TILE } from "@/lib/building/styleGuide";
import { readDimensions } from "@/lib/image/dimensions";
import { ContractError, RefusalError } from "./errors";

const MODEL = "gemini-3.1-flash-image";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

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

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.error?.message ?? `Image model returned ${response.status}.`;
    if (response.status === 400 && /safety|blocked|policy/i.test(message)) {
      throw new RefusalError(message, "image_safety");
    }
    throw new Error(message);
  }

  const blocks: Array<{ type: string; data?: string; text?: string; mime_type?: string }> =
    (body?.steps ?? [])
      .filter((step: { type: string }) => step.type === "model_output")
      .flatMap((step: { content?: unknown[] }) => step.content ?? []);

  const image = blocks.find((block) => block.type === "image" && block.data);
  if (!image?.data) {
    const said = blocks
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join(" ")
      .trim();
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
