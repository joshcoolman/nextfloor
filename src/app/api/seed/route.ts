import { NextResponse } from "next/server";
import { MissingKeyError, resolveKeys } from "@/lib/ai/keys";
import { seedBuilding } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

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

  try {
    const floors = await seedBuilding(keys);
    return NextResponse.json({ floors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not raise the building." },
      { status: 502 },
    );
  }
}
