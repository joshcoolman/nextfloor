import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ORPHAN_LIMIT, orphanFraction } from "./artifacts";

export const BIREFNET = {
  endpoint: "fal-ai/birefnet/v2",
  model: "General Use (Light 2K)",
  operating_resolution: "2048x2048",
} as const;

/** Local evaluation only: the extra call is not part of sponsored accounting. */
export function birefnetEnabled(sponsored = false): boolean {
  return process.env.NODE_ENV === "development" && !sponsored && process.env.FAL_TRANSPARENCY === "birefnet";
}

export async function requestMask(apiKey: string, source: Buffer, mime: string): Promise<Buffer> {
  console.info("[nextfloor] transparency request", { ...BIREFNET, mask_only: true, refine_foreground: false });
  const response = await fetch(`https://fal.run/${BIREFNET.endpoint}`, {
    method: "POST",
    headers: { authorization: `Key ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      image_url: `data:${mime};base64,${source.toString("base64")}`,
      model: BIREFNET.model,
      operating_resolution: BIREFNET.operating_resolution,
      mask_only: true,
      refine_foreground: false,
      output_format: "png",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`BiRefNet mask request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as { image?: { url?: string } };
  if (!body.image?.url) throw new Error("BiRefNet returned no mask image.");
  const download = await fetch(body.image.url, { signal: AbortSignal.timeout(60_000) });
  if (!download.ok) throw new Error(`BiRefNet mask download failed (${download.status}).`);
  return Buffer.from(await download.arrayBuffer());
}

/** Use mask luminance as coverage. Never resize or change the source's RGB. */
export async function applyAlphaMask(source: Buffer, mask: Buffer) {
  const original = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const coverage = await sharp(mask).removeAlpha().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = original.info;
  if (channels !== 4) throw new Error("Expected an RGB artwork image.");
  if (width !== coverage.info.width || height !== coverage.info.height) {
    throw new Error(`Mask is ${coverage.info.width}x${coverage.info.height}; artwork is ${width}x${height}. Refusing to resize the artwork or guess mask alignment.`);
  }
  let clear = 0;
  let visible = 0;
  let partial = 0;
  for (let p = 0; p < width * height; p++) {
    const alpha = Math.round(original.data[p * 4 + 3] * coverage.data[p] / 255);
    original.data[p * 4 + 3] = alpha;
    if (alpha <= 16) clear++;
    else visible++;
    if (alpha > 0 && alpha < 255) partial++;
  }
  const clearFraction = clear / (width * height);
  const visibleFraction = visible / (width * height);
  if (clearFraction < 0.05 || visibleFraction < 0.05) {
    throw new Error("BiRefNet mask is almost entirely opaque or transparent; original artwork retained.");
  }
  const bytes = await sharp(original.data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { bytes, width, height, clearFraction, partialFraction: partial / (width * height) };
}

/** Archives allow another mask attempt without paying to regenerate artwork. */
export async function runTransparencyExperiment(apiKey: string, source: Buffer, mime: string, directory: string) {
  await mkdir(directory, { recursive: true });
  const rawName = mime === "image/jpeg" ? "raw.jpg" : mime === "image/webp" ? "raw.webp" : "raw.png";
  await writeFile(join(directory, rawName), source);
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const provenance = { ...BIREFNET, rawName, sourceSha256: sha(source), refineForeground: false, rgbProcessing: "unchanged" };
  await writeFile(join(directory, "report.json"), JSON.stringify({ ...provenance, status: "mask-pending" }, null, 2));
  try {
    const mask = await requestMask(apiKey, source, mime);
    await writeFile(join(directory, "mask.png"), mask);
    const result = await applyAlphaMask(source, mask);
    await writeFile(join(directory, "result.png"), result.bytes);
    const orphans = await orphanFraction(result.bytes);
    if (orphans > ORPHAN_LIMIT) throw new Error(`Masked image has ${(orphans * 100).toFixed(2)}% detached pixels; inspect the saved result before accepting it.`);
    const report = { ...provenance, status: "ready", width: result.width, height: result.height,
      clearFraction: result.clearFraction, partialFraction: result.partialFraction, orphanFraction: orphans,
      maskSha256: sha(mask), resultSha256: sha(result.bytes) };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
    console.info("[nextfloor] transparency result", { directory, ...report });
    return { bytes: result.bytes, report };
  } catch (error) {
    await writeFile(join(directory, "report.json"), JSON.stringify({ ...provenance, status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
    throw error;
  }
}
