import { z } from "zod";

export const FloorSpecSchema = z.object({
  /** Short label shown in the gutter. Not drawn into the artwork. */
  displayName: z.string(),
  concept: z.string(),
  rooms: z.array(z.object({ name: z.string(), description: z.string() })),
  architecture: z.string(),
  props: z.array(z.string()),
  characters: z.array(z.string()),
  lighting: z.string(),
  palette: z.string(),
  storytelling: z.array(z.string()),
  signage: z.array(z.string()),
  easterEggs: z.array(z.string()),
});

export type FloorSpec = z.infer<typeof FloorSpecSchema>;

export type FloorKind = "floor" | "roof" | "basement";

/**
 * How hard the theme interpreter thinks. Affects only the floor description,
 * not the artwork -- and thinking tokens are billed as output, so this is the
 * main cost dial.
 */
export type Effort = "low" | "medium" | "high";
export const EFFORTS: Effort[] = ["low", "medium", "high"];
export type FloorStatus = "pending" | "ready" | "dead";

export interface Floor {
  id: string;
  ordinal: number;
  kind: FloorKind;
  status: FloorStatus;
  themePrompt: string;
  displayName: string;
  spec: FloorSpec | null;
  failureReason: string | null;
  meta: Record<string, unknown>;
  /** Pixel size of the tile, so the layout follows the art rather than a constant. */
  width: number | null;
  height: number | null;
  createdAt: string;
}
