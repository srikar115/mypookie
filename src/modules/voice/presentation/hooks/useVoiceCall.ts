"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { RemoteParticipant, RemoteTrackPublication } from "livekit-client";
import type { CallSessionDto } from "@/modules/voice";
import type { VoiceTransportGrant } from "@/modules/voice";

/**
 * UI states shown to the user during a call.
 *
 *   - `connecting`      – token/room join in flight.
 *   - `ringing`         – room joined, waiting for the agent to publish
 *                         its first audio track (the "pick-up" moment).
 *                         A synthesized ringback plays during this window.
 *   - `listening`       – call live, neither side actively speaking.
 *   - `user_speaking`   – LiveKit VAD says local mic is active.
 *   - `character_thinking` – user stopped, agent hasn't emitted audio yet
 *                         (STT + LLM tail).
 *   - `character_speaking` – agent's audio track is producing sound.
 *   - `ended` / `error` – terminal states.
 */
export type CallState =
  | "idle"
  | "connecting"
  | "ringing"
  | "listening"
  | "user_speaking"
  | "character_thinking"
  | "character_speaking"
  | "ended"
  | "error";

interface UseVoiceCallResult {
  readonly state: CallState;
  readonly error: string | null;
  readonly durationSec: number;
  readonly muted: boolean;
  readonly session: CallSessionDto | null;
  readonly start: (conversationId: string) => Promise<void>;
  readonly hangUp: () => Promise<void>;
  readonly toggleMute: () => void;
}

interface StartCallResponse {
  readonly ok: true;
  readonly session: CallSessionDto;
  readonly grant: VoiceTransportGrant;
}

/**
 * Small Web Audio ringback generator. Two soft sine partials at 440/480 Hz
 * gated in a 2-on / 4-off pattern, matching the North-American ringback
 * cadence but slightly warmer. Deliberately doesn't ship an audio asset —
 * one fewer file to serve, and the tone is trivially adjustable.
 */
class Ringtone {
  private ctx: AudioContext | null = null;
  private stopFn: (() => void) | null = null;

  start(): void {
    if (this.stopFn) return; // already ringing
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 440;
      osc1.connect(gain);
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 480;
      osc2.connect(gain);

      osc1.start();
      osc2.start();

      // 2-second ring / 4-second silence loop, with a short fade in/out so
      // the tone doesn't click. Uses setTimeout rather than gain automation
      // so we can bail cleanly on stop().
      let stopped = false;
      const scheduleRing = () => {
        if (stopped) return;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.95);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);
        setTimeout(scheduleRing, 6_000);
      };
      scheduleRing();

      this.stopFn = () => {
        stopped = true;
        try {
          osc1.stop();
          osc2.stop();
        } catch {
          /* ignore */
        }
        try {
          void ctx.close();
        } catch {
          /* ignore */
        }
        this.ctx = null;
      };
    } catch {
      // Web Audio unavailable — silently skip the ringback.
    }
  }

  stop(): void {
    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
  }
}

/**
 * useVoiceCall — top-level client hook for the voice-call feature.
 *
 * Responsibilities:
 *   1. Request mic permission (browser prompt).
 *   2. Fetch a LiveKit token via `POST /api/chat/[id]/call/token`.
 *   3. Play a ringback while waiting for the agent to publish audio.
 *   4. Join the LiveKit room, publish the local mic, and ATTACH incoming
 *      audio tracks to hidden `<audio>` elements so the browser plays
 *      them (LiveKit does NOT auto-play — you must attach).
 *   5. Track the state machine as VAD flips between local/remote.
 *   6. On hang-up, `POST /api/chat/[id]/call/end` and disconnect.
 */
export function useVoiceCall(): UseVoiceCallResult {
  const roomRef = useRef<Room | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<CallSessionDto | null>(null);

  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detachAllAudio = useCallback(() => {
    for (const [, el] of audioElsRef.current) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
    }
    audioElsRef.current.clear();
  }, []);

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (ringtoneRef.current) {
      ringtoneRef.current.stop();
      ringtoneRef.current = null;
    }
    detachAllAudio();
    const r = roomRef.current;
    roomRef.current = null;
    if (r) {
      try {
        r.disconnect();
      } catch {
        /* best-effort */
      }
    }
  }, [detachAllAudio]);

  const hangUp = useCallback(async () => {
    const sess = session;
    const convoId = conversationIdRef.current;
    cleanup();
    setState("ended");
    if (sess && convoId) {
      try {
        await fetch(`/api/chat/${convoId}/call/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callSessionId: sess.id,
            dropReason: "user_hangup",
          }),
        });
      } catch (e) {
        console.warn("[useVoiceCall] /call/end failed", e);
      }
    }
  }, [cleanup, session]);

  const start = useCallback(async (conversationId: string) => {
    if (state !== "idle" && state !== "ended" && state !== "error") {
      return;
    }
    setError(null);
    setDurationSec(0);
    setSession(null);
    setMuted(false);
    setState("connecting");
    conversationIdRef.current = conversationId;

    // 1) Mic permission — request explicitly before the room join so we
    //    surface a clean error rather than a mid-connect failure.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Microphone access denied: ${msg}`);
      setState("error");
      return;
    }

    // Start ringback IMMEDIATELY inside the click-driven code path so the
    // browser's autoplay policy is satisfied. Ringback stops on the first
    // remote audio track (see TrackSubscribed handler below).
    const ringtone = new Ringtone();
    ringtoneRef.current = ringtone;
    ringtone.start();
    setState("ringing");

    // 2) Token
    let payload: StartCallResponse;
    try {
      const res = await fetch(`/api/chat/${conversationId}/call/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json()) as
        | StartCallResponse
        | { ok: false; error: string };
      if (!res.ok || !("ok" in body) || body.ok !== true) {
        const errMsg =
          "error" in body && body.error
            ? body.error
            : `Call setup failed (${res.status}).`;
        ringtone.stop();
        setError(errMsg);
        setState("error");
        return;
      }
      payload = body;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ringtone.stop();
      setError(`Network error: ${msg}`);
      setState("error");
      return;
    }
    setSession(payload.session);

    // 3) Room
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    // Attach every remote audio track we subscribe to. LiveKit does NOT
    // auto-play — the returned <audio> element must live in the DOM (we
    // append to <body> hidden). Also: the first remote audio track is our
    // "pick-up" moment; kill the ringback and flip state.
    room.on(
      RoomEvent.TrackSubscribed,
      (track: Track, pub: RemoteTrackPublication, _p: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const audioTrack = track as RemoteAudioTrack;
        const el = audioTrack.attach() as HTMLAudioElement;
        el.autoplay = true;
        el.setAttribute("data-livekit-audio", pub.trackSid);
        // Hide off-screen; we only want the audio, not a visible player.
        el.style.position = "fixed";
        el.style.left = "-9999px";
        el.style.width = "1px";
        el.style.height = "1px";
        document.body.appendChild(el);
        audioElsRef.current.set(pub.trackSid, el);

        // First agent audio track → character has picked up. Kill the
        // ringback, flip state, AND start the duration timer here — a
        // real phone call meters from the pickup, not from the moment
        // the caller dials. Guarded so re-subscribes (rare) don't
        // restart the clock.
        if (ringtoneRef.current) {
          ringtoneRef.current.stop();
          ringtoneRef.current = null;
        }
        if (durationTimerRef.current === null) {
          startedAtRef.current = Date.now();
          setDurationSec(0);
          durationTimerRef.current = setInterval(() => {
            setDurationSec(
              Math.floor((Date.now() - startedAtRef.current) / 1000),
            );
          }, 1000);
        }
        setState((prev) =>
          prev === "ringing" || prev === "connecting"
            ? "character_speaking"
            : prev,
        );
      },
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (_track: Track, pub: RemoteTrackPublication) => {
        const el = audioElsRef.current.get(pub.trackSid);
        if (el) {
          try {
            el.pause();
            el.srcObject = null;
            el.remove();
          } catch {
            /* ignore */
          }
          audioElsRef.current.delete(pub.trackSid);
        }
      },
    );

    room.on(RoomEvent.ConnectionStateChanged, (cs) => {
      if (cs === ConnectionState.Disconnected) {
        cleanup();
        setState("ended");
      }
    });

    // LiveKit's active-speaker event flips based on VAD confidence. We
    // use it to derive user_speaking vs character_thinking vs speaking
    // once the call is live (ignored during ringing so a stray VAD blip
    // doesn't jump us out of the "ringing" state prematurely).
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const localSid = room.localParticipant?.sid;
      const remoteActive = speakers.some((p) => p.sid !== localSid);
      const localActive = speakers.some((p) => p.sid === localSid);
      setState((prev) => {
        if (prev === "ringing" || prev === "connecting") return prev;
        if (localActive) return "user_speaking";
        if (remoteActive) return "character_speaking";
        if (prev === "user_speaking") return "character_thinking";
        if (prev === "character_speaking") return "listening";
        return prev;
      });
    });

    // 4) Connect and publish the local mic.
    try {
      await room.connect(payload.grant.url, payload.grant.token);
      // Explicit unlock for Safari/iOS. No-op on already-unlocked contexts.
      try {
        await room.startAudio();
      } catch {
        /* ignore — user gesture chain usually already unlocked it */
      }
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ringtone.stop();
      setError(`Could not join call: ${msg}`);
      cleanup();
      setState("error");
      return;
    }

    // 5) Credit ticker. Duration timer is started only when the
    //    character picks up (see TrackSubscribed handler above), so the
    //    on-screen 00:00 counter reads like a real phone call.
    const sessionId = payload.session.id;
    tickTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/${conversationId}/call/tick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callSessionId: sessionId }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok: boolean;
          ended?: boolean;
          reason?: string | null;
        };
        if (body.ended) {
          setError(
            body.reason === "credit_exhausted"
              ? "Out of credits — call ended."
              : "Call ended.",
          );
          cleanup();
          setState("ended");
        }
      } catch {
        // network flap — next tick will retry
      }
    }, 12_000);
  }, [cleanup, state]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, error, durationSec, muted, session, start, hangUp, toggleMute };
}
