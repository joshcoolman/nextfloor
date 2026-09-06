export interface Keys {
  anthropic: string;
  google: string;
}

export class MissingKeyError extends Error {
  constructor(readonly which: string[]) {
    super(`Missing ${which.join(" and ")} key.`);
    this.name = "MissingKeyError";
  }
}

const serverKeysAllowed = () => process.env.ALLOW_SERVER_KEYS === "true";

/**
 * Bring your own key. Keys arrive per request from the browser and are never
 * persisted or logged. The host's own keys in the environment are used only
 * when explicitly opted in, so a public deployment does not quietly spend the
 * owner's money on strangers' floors.
 */
export function resolveKeys(request: Request): Keys {
  const anthropic =
    request.headers.get("x-anthropic-key")?.trim() ||
    (serverKeysAllowed() ? process.env.ANTHROPIC_API_KEY : undefined) ||
    "";
  const google =
    request.headers.get("x-google-key")?.trim() ||
    (serverKeysAllowed() ? process.env.GOOGLE_API_KEY : undefined) ||
    "";

  const missing: string[] = [];
  if (!anthropic) missing.push("Anthropic");
  if (!google) missing.push("Google");
  if (missing.length) throw new MissingKeyError(missing);

  return { anthropic, google };
}

export function serverKeysAvailable(): boolean {
  return serverKeysAllowed() && Boolean(process.env.ANTHROPIC_API_KEY && process.env.GOOGLE_API_KEY);
}
