import { POLICY } from "./policy";

export function anthropicPricesSafe(markdown: string): boolean {
  const within = (name: string, input: number, output: number) => {
    const line = markdown.split("\n").find((line) => line.startsWith(`| ${name} `));
    if (!line) return false;
    const cells = line.split("|");
    const price = (cell: string) => /^\s*\$(\d+(?:\.\d+)?)\s*\/\s*MTok\s*$/.exec(cell)?.[1];
    const a = Number(price(cells[2] ?? ""));
    const b = Number(price(cells[6] ?? ""));
    return a > 0 && a <= input && b > 0 && b <= output;
  };
  return within("Claude Sonnet 5", 2, 10) && within("Claude Haiku 4.5", 1, 5);
}

export function falPriceSafe(body: unknown): boolean {
  const data = body as { prices?: Array<{ endpoint_id: string; unit: string; currency: string; unit_price: number }> };
  const price = Array.isArray(data?.prices) ? data.prices.find((entry) => entry?.endpoint_id === POLICY.imageModel) : undefined;
  return !!price && price.unit === "image" && price.currency === "USD" &&
    typeof price.unit_price === "number" && price.unit_price > 0 && price.unit_price * 1_000_000 <= POLICY.imageCeiling;
}

let checked: { until: number; safe: boolean } | undefined;
let checking: Promise<boolean> | undefined;

/** Provider reads only; never calls a generation endpoint. Unknown/changed formats fail closed. */
export async function pricesSafe(falKey: string): Promise<boolean> {
  if (checked && Date.now() < checked.until) return checked.safe;
  if (checking) return checking;
  checking = (async () => {
    let safe = false;
    try {
      const [anthropic, fal] = await Promise.all([
        fetch("https://platform.claude.com/docs/en/about-claude/pricing.md", { signal: AbortSignal.timeout(8000), cache: "no-store" }),
        fetch(`https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(POLICY.imageModel)}`, {
          headers: { Authorization: `Key ${falKey}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
        }),
      ]);
      safe = anthropic.ok && fal.ok && anthropicPricesSafe(await anthropic.text()) && falPriceSafe(await fal.json());
    } catch { /* A network failure closes sponsorship, not the building. */ }
    checked = { safe, until: Date.now() + (safe ? 60_000 : 30_000) };
    return safe;
  })().finally(() => { checking = undefined; });
  return checking;
}
