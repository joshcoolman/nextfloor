export interface Keys {
  anthropic: string;
  fal: string;
}

export class MissingKeyError extends Error {
  constructor(readonly which: string[]) {
    super(`Missing ${which.join(" and ")}.`);
    this.name = "MissingKeyError";
  }
}

const serverKeysAllowed = () => process.env.ALLOW_SERVER_KEYS === "true";

function pick(request: Request, header: string, ...envNames: string[]): string {
  const fromHeader = request.headers.get(header)?.trim();
  if (fromHeader) return fromHeader;
  if (!serverKeysAllowed()) return "";
  for (const name of envNames) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
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
    // FAL_KEY is fal's own convention; FAL_API_KEY is the name people reach for.
    fal: pick(request, "x-fal-key", "FAL_KEY", "FAL_API_KEY"),
  };

  const missing: string[] = [];
  if (!keys.anthropic) missing.push("an Anthropic key");
  if (!keys.fal) missing.push("a fal key");
  if (missing.length) throw new MissingKeyError(missing);

  return keys;
}

export function serverKeysAvailable(): boolean {
  if (!serverKeysAllowed()) return false;
  return Boolean(
    process.env.ANTHROPIC_API_KEY && (process.env.FAL_KEY || process.env.FAL_API_KEY),
  );
}
