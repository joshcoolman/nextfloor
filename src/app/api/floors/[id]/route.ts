import { NextResponse } from "next/server";
import { deleteFloor, keepFloor } from "@/lib/db/floors";
import { isLocalRequest } from "@/lib/local";
import { deleteImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Demolition is a local-only action: the live building is not something a
  // passing visitor should be able to pull down. The exception is a condemned
  // floor, which is the visitor's own failed build and theirs to clear.
  const onlyDead = !isLocalRequest(request);

  const { id } = await params;
  const result = await deleteFloor(id, onlyDead);
  if (!result.deleted) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  if (result.imageKey) await deleteImage(result.imageKey);
  return NextResponse.json({ ok: true });
}

/** Keeps a condemned floor, which is what puts it in the building. */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const floor = await keepFloor(id);
  if (!floor) {
    return NextResponse.json({ error: "No condemned floor with that id." }, { status: 409 });
  }
  return NextResponse.json({ floor });
}
