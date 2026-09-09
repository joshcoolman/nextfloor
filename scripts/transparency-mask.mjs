/** Re-run only background segmentation on an archived original, never artwork generation. */
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { runTransparencyExperiment } from "../src/lib/image/birefnet.ts";

const source = process.argv[2];
if (!source) throw new Error("Usage: pnpm transparency:mask path/to/raw.png");
const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
if (!key) throw new Error("Set FAL_KEY in .env.local.");
const bytes = await readFile(resolve(source));
const { format } = await sharp(bytes).metadata();
const mime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[format];
if (!mime) throw new Error("Use an original PNG, JPEG or WebP render.");
const directory = join(process.cwd(), ".local", "transparency", `manual-${Date.now()}`);
console.log(`One BiRefNet mask request; no artwork generation. Results: ${directory}`);
await runTransparencyExperiment(key, bytes, mime, directory);
