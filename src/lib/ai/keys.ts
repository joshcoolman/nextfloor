export interface Keys {
  anthropic: string;
  /** Google and fal are alternatives; exactly one image key is needed. */
  google: string;
  fal: string;
}

export class MissingKeyError extends Error {
  constructor(readonly which: string[]) {
    super(`Missing ${which.join(" and ")}.`);
    this.name = "MissingKeyError";
  }
}

const serverKeysAllowed = () => process.env.ALLOW_SERVER_KEYS === "true";

function pick(request: Request, header: string, envName: string): string {
  return (
    request.headers.get(header)?.trim() ||
    (serverKeysAllowed() ? process.env[envName] : undefined) ||
    ""
  );
}

/**
 * Bring your own key. Keys arrive per request from the browser and are never
 * persisted or logged. The host's own keys in the environment are used only
 * when explicitly opted in, so a public deployment does not quietly spend the
 * owner's money on strangers' floors.
 */
export function resolveKeys(request: Request): Keys {
  const keys: Keys = {
    anthropic: pick(request, "x-anthropic-key", "ANTHROPIC_API_KEY"),
    google: pick(request, "x-google-key", "GOOGLE_API_KEY"),
    fal: pick(request, "x-fal-key", "FAL_KEY"),
  };

  const missing: string[] = [];
  if (!keys.anthropic) missing.push("an Anthropic key");
  if (!keys.google && !keys.fal) missing.push("an image key (fal or Google)");
  if (missing.length) throw new MissingKeyError(missing);

  return keys;
}

export function serverKeysAvailable(): boolean {
  if (!serverKeysAllowed()) return false;
  return Boolean(process.env.ANTHROPIC_API_KEY && (process.env.FAL_KEY || process.env.GOOGLE_API_KEY));
}
