import { NextResponse } from "next/server";
import { deleteFloor } from "@/lib/db/floors";
import { deleteImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteFloor(id);
  if (!result.deleted) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  if (result.imageKey) await deleteImage(result.imageKey);
  return NextResponse.json({ ok: true });
}
