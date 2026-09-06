import type { StoredImage } from "./index";

/**
 * Lazily loaded so the app runs with no AWS SDK installed when S3_BUCKET is
 * unset, which is the default. Install @aws-sdk/client-s3 to use this path.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function s3() {
  const bucket = process.env.S3_BUCKET!;

  const client = async () => {
    // Resolved at runtime: the package is only installed when a bucket is used,
    // so it must not be a build-time dependency of the default Postgres path.
    const specifier = "@aws-sdk/client-s3";
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier);
    return {
      mod: mod as any,
      instance: new mod.S3Client({
        region: process.env.S3_REGION ?? "auto",
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
      }),
    };
  };

  return {
    async put(key: string, bytes: Buffer, mime: string) {
      const { mod, instance } = await client();
      await instance.send(
        new mod.PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: mime }),
      );
    },
    async get(key: string): Promise<StoredImage | null> {
      const { mod, instance } = await client();
      try {
        const out = await instance.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = Buffer.from(await out.Body!.transformToByteArray());
        return { mime: out.ContentType ?? "image/png", bytes };
      } catch {
        return null;
      }
    },
    async remove(key: string) {
      const { mod, instance } = await client();
      await instance.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
