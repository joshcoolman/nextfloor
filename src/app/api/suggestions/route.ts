import { getSuggestions } from "@/lib/sponsorship/suggestions";
import { suggestionKey } from "@/lib/ai/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST because a stale batch can reserve budget and generate a replacement. */
export async function POST(request: Request) {
  try { return Response.json(await getSuggestions(suggestionKey(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ batchId: null, suggestions: [] }); }
}
