import { NextResponse } from "next/server";
import { renderEditPrompt, renderSeedPrompt } from "@/lib/prompts";
import type { FloorKind } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Renders exactly what would be sent to the image model, so the prompt can be
 * read and diffed without spending a generation to find out.
 */
export async function GET(request: Request) {
  const kind = (new URL(request.url).searchParams.get("kind") ?? "floor") as FloorKind;
  if (!["floor", "roof", "basement"].includes(kind)) {
    return NextResponse.json({ error: "Unknown floor kind." }, { status: 400 });
  }
  const content = "<< the generated floor specification is inserted here >>";
  const mode = new URL(request.url).searchParams.get("mode") ?? "seed";
  const text =
    mode === "edit"
      ? renderEditPrompt({ theme: "<< the user's theme >>", content, number: 7 })
      : renderSeedPrompt({ kind, content });
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
