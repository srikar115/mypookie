export interface StorageUploadResult {
  key: string;
  url: string;
  provider: string;
}

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER ?? "passthrough";

// ─── Core upload ──────────────────────────────────────────────────────────────

export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<StorageUploadResult> {
  switch (STORAGE_PROVIDER) {
    case "s3":
      return s3Upload(buffer, key, contentType);
    default:
      return { key, url: `/api/storage/${key}`, provider: "local" };
  }
}

async function s3Upload(
  _buffer: Buffer,
  _key: string,
  _contentType: string
): Promise<StorageUploadResult> {
  // TODO: implement S3/R2 upload
  throw new Error("S3 storage not yet configured. Set STORAGE_PROVIDER=local for development.");
}

// ─── Upload from external URL (for provider-generated media) ─────────────────

export async function uploadFromUrl(
  url: string,
  key: string,
  contentType: string
): Promise<StorageUploadResult> {
  if (STORAGE_PROVIDER === "passthrough") {
    // In passthrough mode: just return the external URL directly
    return { key, url, provider: "passthrough" };
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media from provider: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(buffer, key, contentType);
}

// ─── URL utilities ────────────────────────────────────────────────────────────

export async function getFileUrl(key: string): Promise<string> {
  switch (STORAGE_PROVIDER) {
    case "s3":
      return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
    case "r2":
      return `${process.env.R2_PUBLIC_URL}/${key}`;
    default:
      return `/api/storage/${key}`;
  }
}

export async function generateSignedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (STORAGE_PROVIDER === "s3") {
    // TODO: generate pre-signed S3 URL
    throw new Error("Signed URLs not configured");
  }
  return getFileUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  if (STORAGE_PROVIDER === "s3") {
    // TODO: S3 delete
    throw new Error("S3 delete not configured");
  }
  // Local/passthrough: no-op
}
