"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaStatusDto } from "../../application/dto/media-generation.dto";
import { FAL_IMAGE_TIMEOUT_MS, FAL_VIDEO_TIMEOUT_MS } from "@/config/media";

const POLL_INTERVAL_MS = 3000;

/**
 * How long to keep polling before giving up. The fal timeouts are the floor;
 * the extra headroom covers queue wait, the R2 upload, and cold starts.
 *
 * A deadline is not optional: the row is only moved to FAILED by the run
 * request itself, so if that request dies (server restart, redeploy, dev
 * recompile) the row is stranded at RUNNING and an unbounded poll would spin
 * forever behind a spinner that never resolves.
 */
const POLL_BUDGET_MS = {
  IMAGE: FAL_IMAGE_TIMEOUT_MS + 60_000,
  VIDEO: FAL_VIDEO_TIMEOUT_MS + 120_000,
} as const;

type MediaStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface MediaGenerationState {
  status: MediaStatus;
  storageUrl: string | null;
  error: string | null;
}

interface UseMediaGenerationResult {
  /** Live state per mediaId, for rendering bubbles in place. */
  generations: Record<string, MediaGenerationState>;
  startGeneration: (mediaId: string, kind?: "IMAGE" | "VIDEO") => void;
  /**
   * Pick up a generation that was already started — a row loaded from history
   * that is still PENDING/RUNNING because the page was reloaded mid-flight.
   *
   * Polls only. It deliberately does not fire /api/media/run: that request is
   * what debits credits, and the original one may well still be in flight.
   */
  resumePolling: (mediaId: string, kind: "IMAGE" | "VIDEO", startedAt: Date) => void;
}

/**
 * useMediaGeneration — drives media generation lifecycles for the open thread.
 *
 * Keyed by mediaId rather than holding one generation, because a thread can
 * legitimately have several in flight (the user fires a second request while
 * the first is still rendering) and because the caller renders one bubble per
 * id — collapsing them into a single status would let a newer generation
 * overwrite an older bubble's result.
 *
 * Call startGeneration(mediaId, kind) after startMediaGenerationAction
 * succeeds. It fires POST /api/media/run (keepalive) and polls
 * GET /api/media/[mediaId] every 3s until COMPLETED, FAILED, or the budget for
 * that media kind runs out.
 */
export function useMediaGeneration(): UseMediaGenerationResult {
  const [generations, setGenerations] = useState<Record<string, MediaGenerationState>>({});

  const pollersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const deadlinesRef = useRef<Map<string, number>>(new Map());

  const patch = useCallback((mediaId: string, next: Partial<MediaGenerationState>) => {
    setGenerations((prev) => {
      const current = prev[mediaId] ?? { status: "PENDING", storageUrl: null, error: null };
      return { ...prev, [mediaId]: { ...current, ...next } };
    });
  }, []);

  const stopPolling = useCallback((mediaId: string) => {
    const interval = pollersRef.current.get(mediaId);
    if (interval) {
      clearInterval(interval);
      pollersRef.current.delete(mediaId);
    }
    deadlinesRef.current.delete(mediaId);
  }, []);

  const fail = useCallback(
    (mediaId: string, message: string) => {
      stopPolling(mediaId);
      patch(mediaId, { status: "FAILED", error: message });
    },
    [patch, stopPolling],
  );

  const pollStatus = useCallback(
    async (mediaId: string) => {
      const deadline = deadlinesRef.current.get(mediaId) ?? 0;
      if (Date.now() > deadline) {
        fail(mediaId, "Generation timed out. Please try again.");
        return;
      }

      try {
        const res = await fetch(`/api/media/${mediaId}`);
        if (!res.ok) {
          // A 404 means the row is gone; anything else is a transient blip that
          // the next tick can retry, so only hard-fail on 404.
          if (res.status === 404) fail(mediaId, "Generation not found.");
          return;
        }
        const body = (await res.json()) as { ok: boolean; status?: MediaStatusDto };
        if (!body.ok || !body.status) return;

        const s = body.status;
        patch(mediaId, {
          status: s.status,
          ...(s.storageUrl ? { storageUrl: s.storageUrl } : {}),
          ...(s.errorMessage ? { error: s.errorMessage } : {}),
        });

        if (s.status === "COMPLETED" || s.status === "FAILED") {
          stopPolling(mediaId);
        }
      } catch (e) {
        // Network blip — leave the interval running and try again next tick.
        console.warn("[useMediaGeneration] poll error", e);
      }
    },
    [fail, patch, stopPolling],
  );

  const startGeneration = useCallback(
    (mediaId: string, kind: "IMAGE" | "VIDEO" = "IMAGE") => {
      // Guard against a double-fire for the *same* id, while still allowing a
      // second, different generation later in the conversation.
      if (pollersRef.current.has(mediaId)) return;

      patch(mediaId, { status: "PENDING", storageUrl: null, error: null });
      deadlinesRef.current.set(mediaId, Date.now() + POLL_BUDGET_MS[kind]);

      // Fire the run route. `keepalive` lets it outlive a navigation.
      void (async () => {
        try {
          const res = await fetch("/api/media/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaId }),
            keepalive: true,
          });
          // fetch only rejects on network failure, so an error *status* has to
          // be checked explicitly — otherwise a 500 here would leave the poll
          // loop spinning against a row nothing is advancing.
          if (!res.ok) {
            const detail = await res
              .json()
              .then((b: { error?: string }) => b.error)
              .catch(() => null);
            fail(mediaId, detail ?? `Generation failed to start (${res.status}).`);
          }
        } catch (e) {
          console.warn("[useMediaGeneration] run error", e);
          fail(mediaId, "Generation request failed.");
        }
      })();

      const interval = setInterval(() => {
        void pollStatus(mediaId);
      }, POLL_INTERVAL_MS);
      pollersRef.current.set(mediaId, interval);
    },
    [fail, patch, pollStatus],
  );

  const resumePolling = useCallback(
    (mediaId: string, kind: "IMAGE" | "VIDEO", startedAt: Date) => {
      if (pollersRef.current.has(mediaId)) return;

      // The budget runs from when the row was created, not from now. A row that
      // has sat at RUNNING for twenty minutes is not going to finish — whatever
      // was driving it died — so it should resolve to a failure on the first
      // tick rather than earning a fresh two-and-a-half minutes of spinner.
      deadlinesRef.current.set(mediaId, startedAt.getTime() + POLL_BUDGET_MS[kind]);

      // No synchronous state write here: this runs from an effect, and patching
      // in the effect body would trigger a cascading render. The first poll is
      // async, so its update lands in a promise callback instead.
      void pollStatus(mediaId);

      const interval = setInterval(() => {
        void pollStatus(mediaId);
      }, POLL_INTERVAL_MS);
      pollersRef.current.set(mediaId, interval);
    },
    [pollStatus],
  );

  useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      for (const interval of pollers.values()) clearInterval(interval);
      pollers.clear();
    };
  }, []);

  return { generations, startGeneration, resumePolling };
}
