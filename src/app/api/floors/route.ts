import { after, NextResponse } from "next/server";
import { MissingKeyError, visitorKeys, sponsoredKeys, environmentKeys } from "@/lib/ai/keys";
import { listFloors, parkReferenceTile, sweepStalePending, completeFloor } from "@/lib/db/floors";
import { availability, reserveGeneration, settleBudget } from "@/lib/sponsorship/ledger";
import { pricesSafe } from "@/lib/sponsorship/pricing";
import { SponsorshipError } from "@/lib/sponsorship/policy";
import { NO_SPONSORSHIP } from "@/lib/sponsorship/types";
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
  const host = sponsoredKeys();
  const environment = environmentKeys();
  const sponsored = host ? await availability().catch(() => ({ ...NO_SPONSORSHIP, enabled: true, reason: "unavailable" as const })) : NO_SPONSORSHIP;
  return NextResponse.json({
    // The reference tile is the model's example, not a storey. Serving it would
    // put an unnumbered arcade in the tower and hold floor 1 against being built.
    floors: (await listFloors()).filter((floor) => !floor.isReference),
    serverKeys: Boolean(environment.anthropic && environment.fal),
    keyAvailability: { anthropic: Boolean(environment.anthropic), fal: Boolean(environment.fal) },
    sponsored,
    local: isLocalRequest(request),
  });
}

export async function POST(request: Request) {
  let keys;
  try {
    keys = visitorKeys(request);
  } catch (error) {
    if (error instanceof MissingKeyError) {
      return NextResponse.json({ error: error.message, missing: error.which }, { status: 401 });
    }
    throw error;
  }

  const rawBody = await request.json().catch(() => null);
  const body = rawBody && typeof rawBody === "object" ? rawBody : {};
  const requestId = body.requestId;
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "A valid request ID is required." }, { status: 400 });
  }
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
  const sponsored = !keys;
  const effort: Effort = sponsored ? "medium" : EFFORTS.includes(body.effort) ? body.effort : "medium";
  if (!keys) {
    keys = sponsoredKeys();
    if (!keys) return NextResponse.json({ error: "Bring your own Anthropic and fal keys to create a floor.", code: "disabled" }, { status: 401 });
    if (!await pricesSafe(keys.fal)) return NextResponse.json({ error: "Free construction is temporarily unavailable. You can still use your own keys.", code: "unavailable" }, { status: 503 });
  }
  let reservation;

  try {
    reservation = await reserveGeneration(theme, effort, requestId, sponsored);
  } catch (error) {
    return NextResponse.json(
      error instanceof SponsorshipError ? { error: error.message, code: error.code, resetAt: error.resetAt } : { error: "Could not reserve a floor." },
      { status: error instanceof SponsorshipError ? error.status : 503 },
    );
  }

  const { floor: pending, funding, duplicate } = reservation;
  const generationKeys = { ...keys, funding };
  if (!duplicate) after(async () => {
    try {
      await generateFloor({
        keys: generationKeys,
        floorId: pending.id,
        ordinal: pending.ordinal,
        theme,
        effort,
      });
    } catch (error) {
      await completeFloor(pending.id, { status: "dead", displayName: theme.slice(0, 40), spec: null, failureReason: "Construction could not finish. Please try again." });
      console.error("[nextfloor] generation failed after response", error instanceof Error ? error.name : "unknown");
    } finally {
      if (funding) await settleBudget(funding);
    }
  });

  return NextResponse.json({ floor: pending, duplicate });
}
