import sharp from "sharp";
import { imageKeyFor } from "@/lib/db/floors";
import { KEY_COLOUR } from "@/lib/image/alpha";
import { getImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?matte=key composites the tile onto the chroma key colour. The image model
  // is shown this rather than a transparent PNG: handed alpha, the preprocessing
  // in front of it flattens onto a checkerboard, and the model then reproduces
  // the checkerboard as part of the artwork it was told to match.
  const matte = new URL(request.url).searchParams.get("matte") === "key";
  const record = await imageKeyFor(id);
  if (!record) return new Response("Not found", { status: 404 });

  const stored = await getImage(record.key);
  if (!stored) return new Response("Not found", { status: 404 });

  const bytes = matte
    ? await sharp(stored.bytes)
        .flatten({ background: { r: KEY_COLOUR.r, g: KEY_COLOUR.g, b: KEY_COLOUR.b } })
        .png()
        .toBuffer()
    : stored.bytes;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": matte ? "image/png" : stored.mime,
      // Tiles are immutable once generated.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
