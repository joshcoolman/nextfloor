export interface GeneratedTile {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface Reference {
  bytes: Buffer;
  mimeType: string;
}

export interface ImageProvider {
  name: string;
  /** What this provider can actually emit. Not every API offers a choice. */
  outputFormat: "png" | "jpeg";
  generate(apiKey: string, prompt: string, reference: Reference | null): Promise<GeneratedTile>;
}

export const REFERENCE_INSTRUCTION =
  "Match this reference tile exactly for building geometry, cutaway angle, pixel " +
  "scale, line weight, palette and lighting treatment. It is the floor directly " +
  "below. Only the interior contents differ.";
