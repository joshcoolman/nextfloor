export interface GeneratedTile {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  model?: string;
}

export interface Reference {
  bytes: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  /**
   * Publicly fetchable URL for the same tile, when the app knows its own public
   * address. Providers that take a URL should prefer it: a 4K PNG as a base64
   * data URI is a multi-megabyte request body.
   */
  url: string | null;
}

import type { Funding } from "@/lib/sponsorship/policy";

export interface ImageProvider {
  name: string;
  /** What this provider can actually emit. Not every API offers a choice. */
  outputFormat: "png" | "jpeg";
  generate(apiKey: string, prompt: string, reference: Reference | null, funding?: Funding): Promise<GeneratedTile>;
}
