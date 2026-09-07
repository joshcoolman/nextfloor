import { after, NextResponse } from "next/server";
import { MissingKeyError, resolveKeys, serverKeysAvailable } from "@/lib/ai/keys";
import { listFloors, parkReferenceTile, reserveFloor, sweepStalePending } from "@/lib/db/floors";
import { isLocalRequest } from "@/lib/local";
import { ensureBuilding, generateFloor } from "@/lib/pipeline";
import { EFFORTS, type Effort } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  // The static building raises itself on first visit; no keys, no generation.
  try {
    await ensureBuilding();
    await parkReferenceTile();
    await sweepStalePending();
  } catch (error) {
    console.error("[nextfloor] could not raise the static building", error);
  }
  return NextResponse.json({
    // The reference tile is the model's example, not a storey. Serving it would
    // put an unnumbered arcade in the tower and hold floor 1 against being built.
    floors: (await listFloors()).filter((floor) => !floor.isReference),
    serverKeys: serverKeysAvailable(),
    local: isLocalRequest(request),
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
  // Claude has no meaningful limit here, but the theme is also pasted into the
  // image prompt three times, and that prompt is already long. This is a guard
  // on the image stage, not on the interpreter.
  if (theme.length > 2000) {
    return NextResponse.json({ error: "That theme is too long." }, { status: 400 });
  }

  // Claim the slot now and answer immediately; generate after the response has
  // been sent. The reservation is a real row, so the floor shows as under
  // construction straight away and survives a browser refresh.
  let pending;
  const effort: Effort = EFFORTS.includes(body.effort) ? body.effort : "medium";

  try {
    pending = await reserveFloor(theme);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reserve a floor." },
      { status: 502 },
    );
  }

  after(async () => {
    try {
      await generateFloor({
        keys,
        floorId: pending.id,
        ordinal: pending.ordinal,
        theme,
        effort,
      });
    } catch (error) {
      console.error("[nextfloor] generation failed after response", error);
    }
  });

  return NextResponse.json({ floor: pending });
}
