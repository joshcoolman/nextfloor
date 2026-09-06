import { pool } from "@/lib/db/client";

/**
 * Tile bytes live behind this seam. Postgres large-object-free `bytea` is the
 * default because it needs no extra service and survives a Railway instance
 * move; set S3_BUCKET and the app writes to an S3-compatible bucket instead.
 */
export interface StoredImage {
  mime: string;
  bytes: Buffer;
}

const bucket = process.env.S3_BUCKET;

export async function putImage(key: string, bytes: Buffer, mime: string): Promise<void> {
  if (bucket) {
    const { s3 } = await import("./s3");
    await s3().put(key, bytes, mime);
    return;
  }
  await pool().query(
    `insert into floor_images (key, mime, bytes) values ($1, $2, $3)
     on conflict (key) do update set mime = excluded.mime, bytes = excluded.bytes`,
    [key, mime, bytes],
  );
}

export async function getImage(key: string): Promise<StoredImage | null> {
  if (bucket) {
    const { s3 } = await import("./s3");
    return s3().get(key);
  }
  const { rows } = await pool().query<{ mime: string; bytes: Buffer }>(
    `select mime, bytes from floor_images where key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function deleteImage(key: string): Promise<void> {
  if (bucket) {
    const { s3 } = await import("./s3");
    await s3().remove(key);
    return;
  }
  await pool().query(`delete from floor_images where key = $1`, [key]);
}
