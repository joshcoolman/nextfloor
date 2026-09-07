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
  const publicUse = process.env.PUBLIC_GENERATION === "true";
  if (!publicUse && process.env.SPONSORED_GENERATION !== "true") return null;
  const anthropic = (publicUse ? process.env.ANTHROPIC_API_KEY : "") || process.env.SPONSORED_ANTHROPIC_KEY;
  const fal = (publicUse ? process.env.FAL_KEY || process.env.FAL_API_KEY : "") || process.env.SPONSORED_FAL_KEY;
  return anthropic && fal ? { anthropic, fal } : null;
}

/** Only the development server uses environment credit without public opt-in.
 * Never trust a request Host header to grant unmetered production access. */
export function environmentKeys(): Keys {
  if (process.env.NODE_ENV !== "development") return { anthropic: "", fal: "" };
  return { anthropic: process.env.ANTHROPIC_API_KEY?.trim() ?? "",
    fal: (process.env.FAL_KEY || process.env.FAL_API_KEY)?.trim() ?? "" };
}

export function suggestionKey(request?: Request): string {
  return request?.headers.get("x-anthropic-key")?.trim() || environmentKeys().anthropic;
}

/** Browser values take precedence per provider; invalid supplied keys are never retried with host keys. */
export function resolveKeys(request: Request): Keys {
  const environment = environmentKeys();
  const keys: Keys = {
    anthropic: request.headers.get("x-anthropic-key")?.trim() || environment.anthropic,
    // FAL_KEY is fal's own convention; FAL_API_KEY is the name people reach for.
    fal: request.headers.get("x-fal-key")?.trim() || environment.fal,
  };

  const missing: string[] = [];
  if (!keys.anthropic) missing.push("an Anthropic key");
  if (!keys.fal) missing.push("a fal key");
  if (missing.length) throw new MissingKeyError(missing);

  return keys;
}

export function visitorKeys(request: Request): Keys | null {
  const environment = environmentKeys();
  if (!request.headers.get("x-anthropic-key")?.trim() && !request.headers.get("x-fal-key")?.trim() && !environment.anthropic && !environment.fal) return null;
  return resolveKeys(request);
}
