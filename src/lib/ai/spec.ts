import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FloorSpecSchema, type Effort, type FloorKind, type FloorSpec } from "./types";
import { RefusalError } from "./errors";

/**
 * Sonnet rather than Opus: this stage is creative expansion, not hard
 * reasoning, and output tokens dominate its cost -- $10/MTok against $25.
 * Set ANTHROPIC_SPEC_MODEL to compare.
 */
const MODEL = process.env.ANTHROPIC_SPEC_MODEL || "claude-sonnet-5";

const SYSTEM = `
You are the Theme Interpreter for a generative isometric pixel-art building.

A user gives you a theme. You turn it into a rich specification for one single
floor of a cutaway building, which an image model will then draw.

The building's geometry is fixed and is not yours to describe: exterior shell,
stair tower on the left, elevator shaft on the right, concrete slab along the
bottom. Never mention them. You describe only what lives inside the floor.

Rules:
- Exactly five or six rooms, ordered left to right across the cutaway.
- Aim for density. Somebody should be able to zoom in and keep finding things.
- Give the floor small stories: an argument, a mishap, someone hiding, a cat
  somewhere it should not be.
- Reference real brands, games and characters where they fit the theme; this is
  a personal art project, not a commercial product.
- Keep in mind that the image model downstream mediates content, and heavily
  protected IP can trigger a rejection that costs the whole floor. Some brands
  are safe and some are policed hard; judge which is which. Where the risk is
  real, lighten the wording rather than the idea -- describe the thing instead
  of naming it, and stay as close to the user's theme as you can.
- displayName is at most 28 characters, title case, no quotes.
`.trim();

export interface SpecContext {
  kind: FloorKind;
  /** Themes already in the building, so the interpreter diverges from them. */
  existingThemes: string[];
  effort?: Effort;
}

export async function generateFloorSpec(
  apiKey: string,
  theme: string,
  context: SpecContext,
): Promise<FloorSpec> {
  const client = new Anthropic({ apiKey });

  const avoid = context.existingThemes.length
    ? `\n\nThe building already contains these floors: ${context.existingThemes.join(
        ", ",
      )}. This floor must feel clearly distinct from all of them, even if the theme is similar.`
    : "";

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: context.effort ?? "medium",
      format: zodOutputFormat(FloorSpecSchema),
    },
    messages: [{ role: "user", content: `Theme: ${theme}${avoid}` }],
  });

  if (response.stop_reason === "refusal") {
    throw new RefusalError(
      response.stop_details?.explanation ??
        "The theme interpreter declined to describe this floor.",
      response.stop_details?.category ?? null,
    );
  }

  const spec = response.parsed_output;
  if (!spec) throw new Error("Theme interpreter returned no usable specification.");
  return spec;
}
