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
export type FloorStatus = "ready" | "dead";

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
  createdAt: string;
}
