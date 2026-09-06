import { imageKeyFor } from "@/lib/db/floors";
import { getImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await imageKeyFor(id);
  if (!record) return new Response("Not found", { status: 404 });

  const stored = await getImage(record.key);
  if (!stored) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(stored.bytes), {
    headers: {
      "content-type": stored.mime,
      // Tiles are immutable once generated.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
