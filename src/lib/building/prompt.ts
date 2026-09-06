import { renderEditPrompt, renderSeedPrompt } from "@/lib/prompts";
import type { FloorKind, FloorSpec } from "@/lib/ai/types";

/**
 * The Art Director stage. Deliberately deterministic code rather than a second
 * model call: the structural half of the prompt has to be identical on every
 * generation, and an LLM cannot promise that. The text itself lives in
 * `src/lib/prompts/`.
 */
/**
 * Renders the spec as a THEME DETAILS block: an intro, one flat bulleted list
 * and a tone line. A single list reads better to the
 * image model than eight labelled fields, which it tends to treat as headings
 * to draw rather than content to depict.
 */
function composeContent(spec: FloorSpec): string {
  const bullets = [
    ...spec.rooms.map((room) => `${room.name}: ${room.description}`),
    ...spec.props,
    ...spec.characters,
    ...spec.signage,
    ...spec.storytelling,
    ...spec.easterEggs,
    spec.architecture,
    spec.lighting,
    spec.palette,
  ];

  return [
    `THEME DETAILS:`,
    ``,
    `Transform the interior into ${spec.concept}`,
    ``,
    `Include:`,
    ...bullets.map((line) => `- ${line}`),
    ``,
    `The floor should feel busy, lived-in, and packed with things to discover.`,
  ].join("\n");
}

/** Used when a reference tile exists, which is every floor after the first. */
export function composeEditPrompt(spec: FloorSpec, theme: string, number: number): string {
  return renderEditPrompt({ theme, content: composeContent(spec), number });
}

/** Used only for the very first tile, which has no reference image to match. */
export function composeSeedPrompt(spec: FloorSpec, kind: FloorKind): string {
  return renderSeedPrompt({
    kind,
    content: composeContent(spec),
    note:
      "This is the first floor of the building and defines the visual language " +
      "every later floor will be matched against. Commit hard to the structure " +
      "and style rules above.",
  });
}
