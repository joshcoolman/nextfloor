import { NextResponse } from "next/server";
import { MissingKeyError, resolveKeys, serverKeysAvailable } from "@/lib/ai/keys";
import { listFloors, referenceTile } from "@/lib/db/floors";
import { generateFloor } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const floors = await listFloors();
  return NextResponse.json({
    floors,
    seeded: Boolean(await referenceTile()),
    serverKeys: serverKeysAvailable(),
  });
}

export async function POST(request: Request) {
  let keys;
  try {
    keys = resolveKeys(request);
  } catch (error) {
    if (error instanceof MissingKeyError) {
      return NextResponse.json({ error: error.message, missing: error.which }, { status: 401 });
    }
    throw error;
  }

  const body = await request.json().catch(() => ({}));
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  if (!theme) return NextResponse.json({ error: "A theme is required." }, { status: 400 });
  if (theme.length > 300) {
    return NextResponse.json({ error: "That theme is too long." }, { status: 400 });
  }

  try {
    const floor = await generateFloor({ keys, theme });
    return NextResponse.json({ floor });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Floor generation failed." },
      { status: 502 },
    );
  }
}
