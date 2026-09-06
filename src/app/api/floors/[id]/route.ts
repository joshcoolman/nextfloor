import { NextResponse } from "next/server";
import { deleteFloor } from "@/lib/db/floors";
import { isLocalRequest } from "@/lib/local";
import { deleteImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Deleting floors is a local-only action: the live building is not something
  // a passing visitor should be able to demolish.
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Floors can only be deleted locally." }, { status: 403 });
  }

  const { id } = await params;
  const result = await deleteFloor(id);
  if (!result.deleted) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  if (result.imageKey) await deleteImage(result.imageKey);
  return NextResponse.json({ ok: true });
}
