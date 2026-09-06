import { CAP_STRUCTURE, STRUCTURE, STYLE } from "./styleGuide";
import type { FloorKind, FloorSpec } from "@/lib/ai/types";

/**
 * The Art Director stage. Deliberately deterministic code rather than a second
 * model call: the structural half of the prompt has to be identical on every
 * generation, and an LLM cannot promise that.
 */
export function composeImagePrompt(spec: FloorSpec, kind: FloorKind): string {
  const structure = kind === "floor" ? STRUCTURE : CAP_STRUCTURE[kind];

  const interior = [
    `CONTENT (this floor only): ${spec.concept}`,
    ``,
    `Rooms, left to right across the cutaway:`,
    ...spec.rooms.map((room, i) => `${i + 1}. ${room.name} -- ${room.description}`),
    ``,
    `Architecture and finishes: ${spec.architecture}`,
    `Lighting: ${spec.lighting}`,
    `Colour: ${spec.palette}`,
    `Props: ${spec.props.join("; ")}`,
    `People: ${spec.characters.join("; ")}`,
    `Signage and graphics (shapes and logos, no readable words): ${spec.signage.join("; ")}`,
    `Small stories happening in the scene: ${spec.storytelling.join("; ")}`,
    `Hidden details to reward zooming in: ${spec.easterEggs.join("; ")}`,
  ].join("\n");

  return [structure, "", STYLE, "", interior].join("\n");
}

/** Used only for the very first tile, which has no reference image to match. */
export function composeSeedPrompt(spec: FloorSpec, kind: FloorKind): string {
  return [
    composeImagePrompt(spec, kind),
    "",
    "This is the first floor of the building and defines the visual language " +
      "every later floor will be matched against. Commit hard to the structure " +
      "and style rules above.",
  ].join("\n");
}
