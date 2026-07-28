import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";

/**
 * Cloudflare R2 storage adapter.
 *
 * R2 is S3-compatible, so we use the AWS SDK. Env schema (see `@/config/env`)
 * guarantees that when `STORAGE_PROVIDER === "r2"`, every R2_* variable is
 * present.
 *
 * This module is infrastructure — treat it as an internal implementation of an
 * `AssetStoragePort` when we introduce that port. Do not import this directly
 * from use cases; wire it through the composition root.
 */

export interface StorageUploadResult {
  key: string;
  url: string;
  provider: string;
}

let cachedClient: S3Client | undefined;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

function getBucket(): string {
  return env.R2_BUCKET_NAME!;
}

export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<StorageUploadResult> {
  switch (env.STORAGE_PROVIDER) {
    case "r2": {
      const client = getR2Client();
      await client.send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return {
        key,
        url: `${env.R2_PUBLIC_URL}/${key}`,
        provider: "r2",
      };
    }
    default:
      return { key, url: `/api/storage/${key}`, provider: env.STORAGE_PROVIDER };
  }
}

export async function uploadFromUrl(
  url: string,
  key: string,
  contentType: string,
): Promise<StorageUploadResult> {
  if (env.STORAGE_PROVIDER === "passthrough") {
    return { key, url, provider: "passthrough" };
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch media from provider: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(buffer, key, contentType);
}

export async function getFileUrl(key: string): Promise<string> {
  switch (env.STORAGE_PROVIDER) {
    case "r2":
      return `${env.R2_PUBLIC_URL}/${key}`;
    default:
      return `/api/storage/${key}`;
  }
}

export async function generateSignedUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (env.STORAGE_PROVIDER === "r2") {
    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
  return getFileUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (env.STORAGE_PROVIDER === "r2") {
    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      }),
    );
  }
}
