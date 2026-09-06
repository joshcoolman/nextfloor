import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FloorKind } from "@/lib/ai/types";

/**
 * Prompt text lives in markdown next to this file rather than in TypeScript
 * string literals. It is the part of the system that gets tuned every session,
 * so it needs to be findable, diffable, and editable without touching code.
 *
 * Files are read from disk at runtime; `next.config.ts` traces this directory
 * into the deployed build so they exist in production too.
 */
const DIR = join(process.cwd(), "src", "lib", "prompts");

const cache = new Map<string, string>();

function read(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const text = readFileSync(join(DIR, name), "utf8");
  cache.set(name, text);
  return text;
}

/**
 * The shell file is a document, not a prompt. Only the content under the
 * headings is sent; the prose above them is there for whoever edits it.
 */
function section(document: string, heading: string): string {
  const start = document.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`Prompt section "${heading}" is missing.`);
  const from = start + `## ${heading}`.length;
  const next = document.indexOf("\n## ", from);
  return document.slice(from, next === -1 ? undefined : next).trim();
}

const STRUCTURE_FILE: Record<FloorKind, string> = {
  floor: "structure-floor.md",
  roof: "structure-roof.md",
  basement: "structure-basement.md",
};

export interface PromptVars {
  kind: FloorKind;
  content: string;
  /** Appended last. Used for the seed tile, which has no reference to match. */
  note?: string;
}

export function renderPrompt({ kind, content, note }: PromptVars): string {
  const shell = read("iso-instructions.md");
  const body = [
    section(shell, "LEAD"),
    section(shell, "STYLE"),
    section(shell, "STRUCTURE").replace("{{structure}}", read(STRUCTURE_FILE[kind]).trim()),
    section(shell, "CONTENT").replace("{{content}}", content),
  ];
  if (note) body.push(note);
  return body.join("\n\n");
}

/** Exposed so a debug script can render exactly what production would send. */
export const PROMPT_DIR = DIR;
