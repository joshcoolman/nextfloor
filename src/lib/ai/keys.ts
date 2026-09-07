import type { Funding } from "@/lib/sponsorship/policy";

export interface Keys {
  anthropic: string;
  fal: string;
  funding?: Funding;
}

export class MissingKeyError extends Error {
  constructor(readonly which: string[]) {
    super(`Missing ${which.join(" and ")}.`);
    this.name = "MissingKeyError";
  }
}

export function sponsoredKeys(): Keys | null {
  if (process.env.SPONSORED_GENERATION !== "true") return null;
  const anthropic = process.env.SPONSORED_ANTHROPIC_KEY;
  const fal = process.env.SPONSORED_FAL_KEY;
  return anthropic && fal ? { anthropic, fal } : null;
}

/**
 * Bring your own key. Keys arrive per request from the browser and are never
 * persisted or logged. The host's own keys in the environment are used only
 * when explicitly opted in, so a public deployment does not quietly spend the
 * owner's money on strangers' floors. Host-funded calls use sponsoredKeys()
 * only after passing the separate budget gate; no per-provider fallback.
 */
export function resolveKeys(request: Request): Keys {
  const keys: Keys = {
    anthropic: request.headers.get("x-anthropic-key")?.trim() ?? "",
    // FAL_KEY is fal's own convention; FAL_API_KEY is the name people reach for.
    fal: request.headers.get("x-fal-key")?.trim() ?? "",
  };

  const missing: string[] = [];
  if (!keys.anthropic) missing.push("an Anthropic key");
  if (!keys.fal) missing.push("a fal key");
  if (missing.length) throw new MissingKeyError(missing);

  return keys;
}

export function visitorKeys(request: Request): Keys | null {
  if (!request.headers.get("x-anthropic-key")?.trim() && !request.headers.get("x-fal-key")?.trim()) return null;
  return resolveKeys(request);
}
