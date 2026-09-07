import { sponsoredKeys } from "@/lib/ai/keys";
import { availability } from "@/lib/sponsorship/ledger";
import { pricesSafe } from "@/lib/sponsorship/pricing";
import { NO_SPONSORSHIP } from "@/lib/sponsorship/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = sponsoredKeys();
  if (!keys) return Response.json(NO_SPONSORSHIP);
  try {
    if (await pricesSafe(keys.fal)) return Response.json(await availability());
  } catch { /* No accounting certainty means no sponsored admission. */ }
  return Response.json({ ...NO_SPONSORSHIP, enabled: true, reason: "unavailable" });
}
