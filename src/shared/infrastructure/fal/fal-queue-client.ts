import "server-only";
import { env } from "@/config/env";
import { FAL_IMAGE_TIMEOUT_MS, FAL_POLL_INTERVAL_MS, FAL_VIDEO_TIMEOUT_MS } from "@/config/media";

/**
 * FalQueueClient — raw HTTP client for the fal.ai queue API.
 *
 * Uses explicit fetch calls (not @fal-ai/client fal.subscribe()) so we can:
 *  - persist the providerRequestId on the media_generations row before the job
 *    finishes (needed for resumable polling if the server restarts);
 *  - apply per-kind timeouts (image 90s, video 5min);
 *  - have a clear, testable interface with no singleton side-effects.
 *
 * The wizard's FalImageGenerator continues to use @fal-ai/client unchanged.
 *
 * Auth header: `Authorization: Key <FAL_API_KEY>` for all fal calls.
 *
 * Queue pattern:
 *   1. POST https://queue.fal.run/{modelSlug} → { status_url, response_url, request_id }
 *   2. GET {status_url}?logs=1 every 2.5s → { status: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED }
 *   3. GET {response_url} → model output
 */

export interface FalQueueSubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export interface FalQueueStatusResult {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: string;
}

export interface FalMediaResult {
  imageUrl: string | null;
  videoUrl: string | null;
  seed: number | null;
}

export class FalQueueError extends Error {
  constructor(
    message: string,
    public readonly code: "submit_failed" | "poll_timeout" | "poll_failed" | "result_failed" | "not_configured",
  ) {
    super(message);
    this.name = "FalQueueError";
  }
}

function getApiKey(): string {
  const key = env.FAL_API_KEY;
  if (!key) {
    throw new FalQueueError(
      "FAL_API_KEY is not configured. Set it in .env to enable media generation.",
      "not_configured",
    );
  }
  return key;
}

function falHeaders(): HeadersInit {
  return {
    Authorization: `Key ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Step 1: Submit a generation request to the fal queue.
 * Returns the request ID, status URL, and response URL immediately.
 */
export async function submitToFalQueue(
  modelSlug: string,
  input: Record<string, unknown>,
): Promise<FalQueueSubmitResult> {
  const url = `https://queue.fal.run/${modelSlug}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify(input),
    });
  } catch (e) {
    throw new FalQueueError(
      `Network error submitting to fal queue (${modelSlug}): ${e instanceof Error ? e.message : String(e)}`,
      "submit_failed",
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FalQueueError(
      `fal queue submit failed (${res.status}): ${body.slice(0, 200)}`,
      "submit_failed",
    );
  }

  const json = (await res.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };

  if (!json.request_id || !json.status_url || !json.response_url) {
    throw new FalQueueError(
      `fal queue submit response missing fields: ${JSON.stringify(json).slice(0, 200)}`,
      "submit_failed",
    );
  }

  return {
    requestId: json.request_id,
    statusUrl: json.status_url,
    responseUrl: json.response_url,
  };
}

/**
 * Step 2: Poll the status URL until COMPLETED or FAILED (or timeout).
 */
export async function pollFalQueueStatus(
  statusUrl: string,
  kind: "image" | "video",
): Promise<void> {
  const timeout = kind === "video" ? FAL_VIDEO_TIMEOUT_MS : FAL_IMAGE_TIMEOUT_MS;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await sleep(FAL_POLL_INTERVAL_MS);

    let res: Response;
    try {
      res = await fetch(`${statusUrl}?logs=1`, { headers: falHeaders() });
    } catch (e) {
      throw new FalQueueError(
        `Network error polling fal status: ${e instanceof Error ? e.message : String(e)}`,
        "poll_failed",
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new FalQueueError(
        `fal status poll failed (${res.status}): ${body.slice(0, 200)}`,
        "poll_failed",
      );
    }

    const json = (await res.json()) as FalQueueStatusResult;

    if (json.status === "COMPLETED") return;
    if (json.status === "FAILED") {
      throw new FalQueueError(
        `fal generation failed: ${json.error ?? "unknown error"}`,
        "poll_failed",
      );
    }
    // IN_QUEUE or IN_PROGRESS → keep polling
  }

  throw new FalQueueError(
    `fal generation timed out after ${timeout / 1000}s`,
    "poll_timeout",
  );
}

/**
 * Step 3: Fetch the completed result from the response URL.
 * Extracts image URL (images[0].url or image.url) and video URL (video.url).
 */
export async function fetchFalResult(responseUrl: string): Promise<FalMediaResult> {
  let res: Response;
  try {
    res = await fetch(responseUrl, { headers: falHeaders() });
  } catch (e) {
    throw new FalQueueError(
      `Network error fetching fal result: ${e instanceof Error ? e.message : String(e)}`,
      "result_failed",
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FalQueueError(
      `fal result fetch failed (${res.status}): ${body.slice(0, 200)}`,
      "result_failed",
    );
  }

  const json = (await res.json()) as Record<string, unknown>;

  // Image extraction — prefer images[] array, fall back to single image object.
  let imageUrl: string | null = null;
  if (Array.isArray(json.images) && json.images.length > 0) {
    const first = json.images[0] as Record<string, unknown>;
    imageUrl = typeof first.url === "string" ? first.url : null;
  } else if (json.image && typeof (json.image as Record<string, unknown>).url === "string") {
    imageUrl = (json.image as Record<string, unknown>).url as string;
  }

  // Video extraction.
  let videoUrl: string | null = null;
  if (json.video && typeof (json.video as Record<string, unknown>).url === "string") {
    videoUrl = (json.video as Record<string, unknown>).url as string;
  }

  // Seed (optional, used for edit-mode consistency).
  const seed = typeof json.seed === "number" ? json.seed : null;

  return { imageUrl, videoUrl, seed };
}

/**
 * Convenience: submit → poll → fetch in one call.
 * Useful when the caller doesn't need to persist requestId mid-flight.
 */
export async function runFalGeneration(
  modelSlug: string,
  input: Record<string, unknown>,
  kind: "image" | "video",
): Promise<FalMediaResult & { requestId: string }> {
  const { requestId, statusUrl, responseUrl } = await submitToFalQueue(modelSlug, input);
  await pollFalQueueStatus(statusUrl, kind);
  const result = await fetchFalResult(responseUrl);
  return { ...result, requestId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
