import { getSuggestions } from "@/lib/sponsorship/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST because a stale batch can reserve budget and generate a replacement. */
export async function POST() {
  try { return Response.json(await getSuggestions(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ batchId: null, suggestions: [] }); }
}
