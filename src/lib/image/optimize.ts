import sharp from "sharp";

/**
 * Re-encodes a finished tile for delivery.
 *
 * Generators emit PNGs written for speed rather than size: a 2912x1440 floor
 * arrives around 7 MB, and the building was carrying 125 MB across eighteen
 * tiles. Lossless WebP holds the same pixels in roughly half the bytes.
 *
 * Lossless is not a preference here, it is a requirement. Tiles overlap, so the
 * alpha edge is where floors meet, and lossy compression puts its ringing
 * exactly there -- measured at ten times the semi-transparent fringe. The
 * artwork is also the whole point of the app: it is looked at closely, and a
 * codec tuned for photographs is the wrong trade at any ratio.
 *
 * The same reasoning rules out asking the provider for WebP directly, which is
 * far smaller still: the tile arrives opaque and has its background keyed out
 * afterwards, and lossy edges make that key ragged.
 */
export interface OptimizedImage {
  bytes: Buffer;
  mimeType: string;
  /** What was done, recorded on the floor so a tile's encoding is knowable. */
  strategy: string;
  originalBytes: number;
  optimizedBytes: number;
}

/** Below this saving the re-encode is not worth a second format in the building. */
const WORTH_IT = 0.9;

export async function optimizeFloorImage(
  bytes: Buffer,
  mimeType: string,
): Promise<OptimizedImage> {
  const unchanged: OptimizedImage = {
    bytes,
    mimeType,
    strategy: "none",
    originalBytes: bytes.length,
    optimizedBytes: bytes.length,
  };

  try {
    const webp = await sharp(bytes).webp({ lossless: true, effort: 6 }).toBuffer();
    if (webp.length >= bytes.length * WORTH_IT) return unchanged;
    return {
      bytes: webp,
      mimeType: "image/webp",
      strategy: "webp-lossless",
      originalBytes: bytes.length,
      optimizedBytes: webp.length,
    };
  } catch {
    // A tile that will not re-encode still ships. Delivery size is not worth
    // losing a floor over.
    return unchanged;
  }
}

/**
 * Confirms a re-encode changed nothing anyone can see.
 *
 * Fully transparent pixels are excluded: their colour channels are discarded by
 * every encoder and comparing them reports differences that cannot be seen.
 * What must hold is the visible colour, the alpha values, and the silhouette.
 */
export async function isVisuallyIdentical(a: Buffer, b: Buffer): Promise<boolean> {
  const [one, two] = await Promise.all([
    sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (one.info.width !== two.info.width || one.info.height !== two.info.height) return false;
  if (one.data.length !== two.data.length) return false;

  for (let p = 0; p < one.data.length; p += 4) {
    if (one.data[p + 3] !== two.data[p + 3]) return false;
    if (one.data[p + 3] === 0) continue;
    if (
      one.data[p] !== two.data[p] ||
      one.data[p + 1] !== two.data[p + 1] ||
      one.data[p + 2] !== two.data[p + 2]
    ) {
      return false;
    }
  }
  return true;
}

/** File extension for a stored tile's mime type. */
export function extensionFor(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}
