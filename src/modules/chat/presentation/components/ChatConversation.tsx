"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
  PanelRightOpen,
  Send,
} from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import type { CharacterSummaryDto } from "@/modules/characters";
import {
  CallBarContainer,
  VoiceCallButton,
  useVoiceCall,
  type CallState,
} from "@/modules/voice/client";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { CallEndedMarker } from "./CallEndedMarker";
import { TypingIndicator } from "./TypingIndicator";
import { useChatStream } from "../hooks/useChatStream";
import { decideOpenerFromTurns } from "../../domain/opener-policy";
import {
  classifyIntent,
  needsCompose,
  startMediaGenerationAction,
  MediaBubble,
  MediaComposer,
  ClarifyBubble,
  OfferBubble,
  ComposerModePills,
  useMediaGeneration,
  previewMediaPromptAction,
  listRecentMediaAction,
} from "@/modules/media/client";
import type { GeneratePayload } from "@/modules/media/client";
import type { RecentMediaItem, StartMediaResult } from "@/modules/media/client";
import { clientEnv } from "@/config/client-env";
import { MEDIA_COSTS } from "@/config/media";

/**
 * Call states in which a new voice turn can appear in the transcript —
 * everything between "the character picked up" and "somebody hung up".
 *
 * Module-level so membership can be collapsed to a boolean the polling effect
 * can depend on. Depending on `call.state` itself does not work: it tracks
 * voice activity and flips several times a second while anyone is talking.
 */
const CALL_ACTIVE_STATES: readonly CallState[] = [
  "listening",
  "user_speaking",
  "character_thinking",
  "character_speaking",
];

// Public feature flags (client-safe, from NEXT_PUBLIC_ env vars).
const VOICE_CALLS_ENABLED = clientEnv.NEXT_PUBLIC_VOICE_CALLS_ENABLED;
const CHAT_MEDIA_ENABLED = clientEnv.NEXT_PUBLIC_CHAT_MEDIA_ENABLED;
const CHAT_VIDEO_ENABLED = clientEnv.NEXT_PUBLIC_CHAT_VIDEO_ENABLED;

interface Props {
  readonly character: CharacterSummaryDto;
  readonly conversationId: string | null;
  readonly initialMessages: readonly ChatMessage[];
  readonly onToggleDetail: () => void;
  readonly detailOpen: boolean;
  /**
   * Called whenever the local message array grows so the workspace can
   * show a fresh preview line in the sidebar. Optional — the sidebar
   * happily falls back to the character's tagline greeting.
   */
  readonly onLastMessageChange?: (msg: ChatMessage) => void;
}

/**
 * Center column — the active conversation. Header, scrollable message
 * feed, and composer. Owns the streaming lifecycle via `useChatStream`;
 * the workspace only tells it which conversationId is active and what to
 * hydrate from.
 */
export function ChatConversation({
  character,
  conversationId,
  initialMessages,
  onToggleDetail,
  detailOpen,
  onLastMessageChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ─── Media state ───────────────────────────────────────────────
  type ComposerMode = "chat" | "image" | "video";
  const [composerMode, setComposerMode] = useState<ComposerMode>("chat");

  // Clarify bubble state — shown for ambiguous intent.
  const [clarifyState, setClarifyState] = useState<{
    question: string;
    intent: ReturnType<typeof classifyIntent>;
  } | null>(null);

  // Offer bubble state — companion-initiated media offer from <<VA mode:offer>>.
  const [offerState, setOfferState] = useState<{
    mediaType: "image" | "video";
    scene: string;
    cost: number;
  } | null>(null);

  // MediaComposer sheet state.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [composerScene, setComposerScene] = useState("");
  const [composerEditMode, setComposerEditMode] = useState(false);
  const [composerRefId, setComposerRefId] = useState<string | null>(null);
  // What the user actually typed, kept alongside the resolved prompt so the
  // transcript can show their words rather than the provider-facing text. Null
  // when the chat stream already recorded the message.
  const [composerUserText, setComposerUserText] = useState<string | null>(null);

  // Per-bubble media generation lifecycle, keyed by mediaId. `generations` is
  // the live view the bubbles read from — it advances PENDING → RUNNING →
  // COMPLETED as the hook polls, so a bubble resolves without a page refresh.
  const { generations, startGeneration, resumePolling } = useMediaGeneration();

  // Recent completed images for the composer's reference grid. Refreshed each
  // time the sheet opens so a photo generated moments ago is available as the
  // starting point for the next one.
  const [recentImages, setRecentImages] = useState<RecentMediaItem[]>([]);

  // One media action per turn. The client classifier fires the instant the user
  // hits Send; the <<VA>> sentinel only arrives when the stream finishes. Both
  // can legitimately describe the same request ("share your picture"), so
  // without this guard a single turn opens the composer AND kicks off a second
  // generation — two bubbles, double credits. First action wins, which means
  // the classifier handles explicit asks and the sentinel covers the case it
  // read as normal_chat (the companion offering unprompted).
  const mediaActionTakenRef = useRef(false);

  const { messages, streaming, reading, send, retry, initiateOpener, refresh, appendMediaMessage } =
    useChatStream({
      conversationId,
      initialMessages,
      onVisualAction: useCallback(
        (va: { mode: "generate" | "offer"; mediaType: "image" | "video"; scene: string; edit: boolean; cost: number }) => {
          if (!conversationId) return;
          if (mediaActionTakenRef.current) return;
          mediaActionTakenRef.current = true;

          const kind: "IMAGE" | "VIDEO" = va.mediaType === "video" ? "VIDEO" : "IMAGE";

          if (va.mode === "offer") {
            // Companion is teasing — render Yes/No and let the user decide.
            setOfferState({ mediaType: va.mediaType, scene: va.scene, cost: va.cost });
            return;
          }
          // mode === "generate": the server already confirmed the user asked
          // visually (it downgrades to "offer" otherwise), so go straight to it.
          void handleAutoGenerate(va.scene, kind, conversationId);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [conversationId],
      ),
    });

  // Generates without a confirmation step. Only the classifier's
  // high-confidence path and the <<VA>> sentinel reach this — both already have
  // the user's message in the transcript (the chat stream put it there), and
  // neither has any UI in which to review the prompt, so the server is left to
  // add an identity core if the request has no reference image.
  async function handleAutoGenerate(
    scene: string,
    kind: "IMAGE" | "VIDEO",
    convId: string,
  ) {
    const result = await startMediaGenerationAction({
      conversationId: convId,
      kind,
      prompt: scene,
      aspectRatio: kind === "VIDEO" ? "9:16" : "1:1",
      style: null,
      editMode: false,
      referenceMediaId: null,
      userPromptText: null,
      promptIsFinal: false,
      modelFamilyId: null,
      resolution: null,
      duration: null,
    });
    if (result.ok) {
      const { mediaId, messageId } = result.data;
      // Show the pending bubble before the network work starts — the message
      // that carries mediaGenerationId is created server-side, so without this
      // the thread has nothing to hang the spinner on until a manual reload.
      appendMediaMessage({ messageId, mediaGenerationId: mediaId, kind });
      startGeneration(mediaId, kind);
    }
  }

  // ─── Resume generations that outlived the page ─────────────────
  // A reload drops all in-memory polling, so a bubble hydrated from the DB at
  // PENDING/RUNNING would otherwise sit on a spinner forever: the run request
  // that owns the row is the only thing that can move it, and it belongs to a
  // page that no longer exists. Re-attaching a poller either sees it finish or
  // lets the (creation-time) deadline resolve it to a failure.
  useEffect(() => {
    for (const m of messages) {
      if (!m.mediaGenerationId) continue;
      if (m.mediaStatus !== "PENDING" && m.mediaStatus !== "RUNNING") continue;
      resumePolling(m.mediaGenerationId, m.mediaKind ?? "IMAGE", m.at);
    }
  }, [messages, resumePolling]);

  // ─── Voice call plumbing ──────────────────────────────────────
  // Hoisted here (rather than inside VoiceCallButton) for two reasons:
  //   1. When the call ends we need to refresh the transcript so the
  //      voice turns persisted by the agent worker (and the boundary
  //      marker persisted by EndCallUseCase) flow into the message list.
  //   2. The CallEndedMarker's "Speak again" button re-starts the same
  //      call, which is easiest to model as a signal counter that the
  //      button watches.
  const call = useVoiceCall();
  const [speakAgainSignal, setSpeakAgainSignal] = useState(0);
  const prevCallStateRef = useRef(call.state);
  useEffect(() => {
    const prev = prevCallStateRef.current;
    prevCallStateRef.current = call.state;
    // Final refresh on the falling edge into `ended` — catches the
    // last turn(s) plus the CallEndedMarker written by
    // `EndCallUseCase`. `error` skipped — nothing to render.
    // Small delay lets the LiveKit agent's final /voice-agent/turn
    // POST land before we re-fetch (the agent posts fire-and-forget).
    if (prev !== "ended" && call.state === "ended") {
      const t = setTimeout(() => {
        void refresh();
      }, 700);
      return () => clearTimeout(t);
    }
    // She just stopped talking — refresh now, this is what makes the
    // transcript feel live rather than the interval below.
    //
    // No delay, deliberately. The worker posts `/voice-agent/turn` when the
    // reply FINALIZES (`ConversationItemAdded`), and TTS then plays that text
    // for several seconds, so the write is long since done by the time the
    // audio stops. A delay would only add a window in which this effect
    // re-runs — which it does on every voice-activity flip — and cancels its
    // own pending timer the moment the user starts speaking again.
    if (prev === "character_speaking" && call.state === "listening") {
      void refresh();
    }
  }, [call.state, refresh]);

  // ─── Live transcript during a call ────────────────────────────
  // Backstop poll while a call is active, so a turn the edge-triggered
  // refresh above missed (dropped request, a reply that finalized during a
  // pause in speech) still lands within a couple of seconds. The
  // RecordVoiceTurnUseCase persists both messages atomically, so a poll
  // either sees both or neither — no half-written rows.
  //
  // Depends on a BOOLEAN, not on `call.state`. `call.state` is derived from
  // LiveKit's voice-activity events and changes several times a second while
  // anyone is talking; with it in the dependency array, every flip tore down
  // the interval and restarted the countdown from zero, so the timer only
  // ever completed during a silence long enough to be rare in an actual
  // conversation. The transcript looked frozen mid-call and caught up all at
  // once on hang-up.
  const callActive = CALL_ACTIVE_STATES.includes(call.state);
  const CALL_POLL_MS = 2000;
  useEffect(() => {
    if (!callActive) return;
    const interval = setInterval(() => {
      void refresh();
    }, CALL_POLL_MS);
    return () => clearInterval(interval);
  }, [callActive, refresh]);
  const handleSpeakAgain = () => {
    if (!conversationId) return;
    setSpeakAgainSignal((n) => n + 1);
  };

  // ─── Character-initiated opener ────────────────────────────────
  // When the chat view mounts (or the user switches to a fresh
  // conversation), the character speaks first if the user hasn't.
  // Two flavours:
  //
  //   Fresh thread (empty history)   → opener 2s after mount.
  //   Revisit with stale tail        → opener 2s after mount, only
  //                                    if the last assistant message
  //                                    is at least 5 minutes old.
  //
  // Suppressed when:
  //   - the composer already has a draft (user is typing)
  //   - a stream or reading beat is already in flight
  //   - we already fired one for this mount
  //   - the last message is from the user (they're expecting a reply
  //     from the previous send; auto-opener would ignore them)
  //
  // Idle threshold is intentionally short: Candy fires within about
  // 1-2s. Any longer and the empty chat feels awkward.
  const OPENER_IDLE_MS = 2000;
  const openerFiredRef = useRef(false);
  useEffect(() => {
    if (!conversationId) return;
    if (openerFiredRef.current) return;
    if (streaming || reading) return;

    // Snapshot the eligibility state at effect-run time so the
    // timeout reads the latest values without triggering re-runs on
    // every message. React's stale-closure isn't a bug here — it's
    // the intended semantics.
    //
    // Same rule the opener route enforces, applied here only to skip a
    // round trip we know would be refused. The server is the real gate:
    // this component remounts on navigation and reloads, and each mount
    // gets a fresh `openerFiredRef`.
    const decision = decideOpenerFromTurns(
      messages.map((m) => ({ role: m.role, content: m.text, at: m.at })),
      new Date(),
    );
    if (!decision.warranted) return;

    const timer = setTimeout(() => {
      // Re-check just before firing. `streaming`/`reading` are NOT usable
      // here — this closure captured them from a render where both were
      // false by definition, so they can't report a turn that started during
      // the idle window. `openerFiredRef` is a ref and does read live, and
      // `handleSendWithIntent` sets it the moment the user sends.
      if (openerFiredRef.current) return;
      if (draft.trim().length > 0) return;
      openerFiredRef.current = true;
      void initiateOpener();
    }, OPENER_IDLE_MS);

    return () => clearTimeout(timer);
    // messages.length is in the deps so the "was the thread empty?"
    // check re-runs once after initial hydration. `draft` is NOT in
    // deps — checking it inside the timeout is enough (adding it
    // would restart the timer on every keystroke, defeating the
    // "user is typing" cancellation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length, streaming, reading]);

  // Index of the tail failed-assistant bubble (if any). Only that
  // bubble gets an onRetry callback so older errors don't grow
  // duplicate buttons — a common bug when the transcript scrolls up.
  const tailFailedIndex = (() => {
    const last = messages[messages.length - 1];
    if (!last) return -1;
    if (last.role !== "assistant") return -1;
    if (!last.errorCode) return -1;
    return messages.length - 1;
  })();

  // Auto-scroll on new message, streaming delta, or when the reading
  // indicator flips on/off — anything that changes what's rendered at
  // the bottom of the feed.
  const tail = messages[messages.length - 1];
  const tailKey = `${messages.length}:${tail?.id ?? ""}:${tail?.text.length ?? 0}:${reading ? "r" : "-"}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tailKey]);

  useEffect(() => {
    if (tail && onLastMessageChange) onLastMessageChange(tail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void handleSendWithIntent(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setDraft("");
      void handleSendWithIntent(text);
    }
  };

  async function handleSendWithIntent(text: string) {
    // New turn — the sentinel arriving later is allowed to act again.
    mediaActionTakenRef.current = false;

    // The user spoke first, so the auto-opener must never fire for this mount.
    // Clearing the draft on send would otherwise let a pending opener timer
    // through its "is the user typing?" check, and the greeting would land on
    // top of a real question — the user asks something and gets "long time no
    // chat" back instead of an answer.
    openerFiredRef.current = true;

    // Explicit mode override. The user tapped the Image or Video pill, so the
    // textarea *is* the generation prompt — it opens the composer rather than
    // going to the LLM. The sheet is the confirmation step: it's where the
    // reference image, the model, and the per-model options are chosen, and
    // where the credit cost is shown before anything is spent. Falls back to
    // chat mode afterwards so the next message doesn't silently cost 10 credits.
    if (CHAT_MEDIA_ENABLED && conversationId && composerMode !== "chat") {
      const kind: "IMAGE" | "VIDEO" = composerMode === "video" ? "VIDEO" : "IMAGE";
      setComposerMode("chat");
      mediaActionTakenRef.current = true;
      await openComposer(text, kind, false, null, text);
      return;
    }

    // Classify first — it's a synchronous regex, so this costs nothing, and
    // the reply needs to know whether a photo is being generated alongside
    // it. Without that the model answers "send me a pic" on its own terms
    // and often declines outright, while the image lands directly below the
    // refusal.
    const intent =
      CHAT_MEDIA_ENABLED && conversationId
        ? classifyIntent(text)
        : null;
    const autoGenerating =
      intent !== null &&
      intent.intent !== "normal_chat" &&
      intent.intent !== "ambiguous_visual_request" &&
      intent.mediaType === "image" &&
      !needsCompose(intent);

    // Always send the text to the LLM.
    void send(text, { pendingMedia: autoGenerating ? "image" : null });

    if (intent === null || !conversationId) return;
    if (intent.intent === "normal_chat") return;

    if (intent.intent === "ambiguous_visual_request") {
      mediaActionTakenRef.current = true;
      setClarifyState({ question: intent.userFacingQuestion ?? "Want me to send a picture?", intent });
      return;
    }

    mediaActionTakenRef.current = true;

    // High-confidence auto-generate (image only, no edit).
    if (intent.mediaType === "image" && !needsCompose(intent)) {
      await handleAutoGenerate(intent.extractedScenePrompt, "IMAGE", conversationId);
      return;
    }

    // Everything else → composer.
    const kind: "IMAGE" | "VIDEO" = intent.mediaType === "video" ? "VIDEO" : "IMAGE";
    await openComposer(intent.extractedScenePrompt, kind, intent.editMode, null);
  }

  async function openComposer(
    scene: string,
    kind: "IMAGE" | "VIDEO",
    editMode: boolean,
    refId: string | null,
    // Text to record as the user's message on generate. Pass it when the
    // request never went through the chat stream (mode pill, Edit button);
    // leave null when the stream already logged what they said.
    userText: string | null = null,
  ) {
    setComposerKind(kind);
    setComposerEditMode(editMode);
    setComposerRefId(refId);
    setComposerUserText(userText);

    void listRecentMediaAction({ characterId: character.id }).then((res) => {
      if (res.ok) setRecentImages(res.items);
    });

    // Prefill with the prompt that will actually be sent rather than the phrase
    // the user typed. Resolving it needs the companion profile and the
    // reference image, both server-side, so it costs a round trip — worth it,
    // because the whole point of this sheet is to confirm before spending
    // credits, and confirming text that isn't what gets sent is theatre.
    let prefill = scene.trim();
    if (prefill && conversationId) {
      const preview = await previewMediaPromptAction({
        conversationId,
        scene: prefill,
        kind,
        referenceMediaId: refId,
      });
      if (preview.ok) prefill = preview.data.prompt;
    }

    setComposerScene(prefill);
    setComposerOpen(true);
  }

  async function handleComposerGenerate(payload: GeneratePayload): Promise<StartMediaResult | null> {
    if (!conversationId) return null;
    const result = await startMediaGenerationAction({
      conversationId,
      kind: payload.kind,
      prompt: payload.prompt,
      aspectRatio: payload.aspectRatio,
      style: payload.style,
      editMode: payload.editMode,
      referenceMediaId: payload.referenceMediaId,
      // The textarea was prefilled with the resolved prompt and the user had a
      // chance to edit it, so it ships exactly as it reads.
      promptIsFinal: true,
      userPromptText: composerUserText,
      modelFamilyId: payload.modelFamilyId,
      resolution: payload.resolution,
      duration: payload.duration,
    });
    if (!result.ok) return null;
    const { mediaId, messageId, userMessageId } = result.data;
    appendMediaMessage({
      messageId,
      mediaGenerationId: mediaId,
      kind: payload.kind,
      userMessage:
        userMessageId && composerUserText
          ? { id: userMessageId, text: composerUserText }
          : null,
    });
    startGeneration(mediaId, payload.kind);
    return result.data;
  }

  const disabled = !conversationId || streaming;

  // In an explicit media mode the textarea is a generation prompt, not a
  // message, so the placeholder and the footer hint both switch to describe
  // what Send will actually do (and what it will cost).
  const composerPlaceholder =
    composerMode === "image"
      ? `Describe a photo of ${character.name}...`
      : composerMode === "video"
        ? `Describe a video of ${character.name}...`
        : "Write a message...";

  const composerHelp = !conversationId
    ? "Loading conversation…"
    : reading
      ? `${character.name} is reading…`
      : streaming
        ? `${character.name} is typing…`
        : composerMode === "image"
          ? `Image · ${MEDIA_COSTS.IMAGE} credits · takes ~20s`
          : composerMode === "video"
            ? `Video · ${MEDIA_COSTS.VIDEO} credits · takes ~2 min`
            : `${MEDIA_COSTS.CHAT} credit per reply`;

  return (
    <section className="flex flex-1 flex-col min-w-0 bg-[#0a0a0f]">
      <ConversationHeader
        character={character}
        detailOpen={detailOpen}
        onToggleDetail={onToggleDetail}
        conversationId={conversationId}
        call={call}
        speakAgainSignal={speakAgainSignal}
      />

      {/* Compact in-flow call bar. Slides in beneath the header while a
          call is active (idle → connecting → … → ended → auto-hide).
          Rendering here keeps the transcript visible and scrollable
          during the call — no full-screen overlay, no scroll lock. */}
      <CallBarContainer
        characterName={character.name}
        characterImageUrl={character.imageUrl}
        state={call.state}
        error={call.error}
        durationSec={call.durationSec}
        muted={call.muted}
        onHangUp={() => void call.hangUp()}
        onToggleMute={call.toggleMute}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
      >
        {messages.length === 0 && conversationId ? (
          <EmptyThread character={character} />
        ) : (
          <>
            {messages.map((m, i) => {
              // Call-boundary marker rows render as a distinct pill
              // (phone-off + duration + Speak again) rather than a
              // MessageBubble. Only the tail marker gets the button —
              // older markers stay as passive receipts so the
              // transcript doesn't sprout dozens of "Speak again"
              // affordances.
              if (m.kind === "call_ended") {
                const isTailMarker = i === messages.length - 1;
                return (
                  <CallEndedMarker
                    key={m.id}
                    durationSec={m.durationSec ?? 0}
                    at={m.at}
                    onSpeakAgain={
                      isTailMarker && conversationId
                        ? handleSpeakAgain
                        : undefined
                    }
                  />
                );
              }

              // Media generation placeholder bubbles.
              if (m.mediaGenerationId) {
                // Prefer whichever source has actually finished. The live
                // poll state is usually ahead of the persisted row, but after
                // a refetch the row can be the fresher of the two — taking the
                // live value unconditionally would let a stale PENDING mask a
                // COMPLETED row and strand the spinner.
                const live = generations[m.mediaGenerationId];
                const settled = live?.status === "COMPLETED" || live?.status === "FAILED";
                const bubbleStatus = settled
                  ? live.status
                  : (m.mediaStatus ?? live?.status ?? "PENDING");
                const bubbleUrl = live?.storageUrl ?? m.mediaUrl ?? null;
                return (
                  <MediaBubble
                    key={m.id}
                    status={bubbleStatus}
                    storageUrl={bubbleUrl}
                    kind={m.mediaKind ?? "IMAGE"}
                    at={m.at}
                    characterImageUrl={character.imageUrl}
                    characterName={character.name}
                    onEdit={
                      bubbleStatus === "COMPLETED" && bubbleUrl
                        ? // Opens empty: this photo is the reference, so the
                          // prompt should describe the change to make to it.
                          // (It used to prefill the image URL, which is not a
                          // prompt at all.)
                          () => void openComposer("", "IMAGE", true, m.mediaGenerationId ?? null)
                        : undefined
                    }
                  />
                );
              }

              // Swap the empty streaming placeholder for a dedicated
              // "typing" pill. As soon as the first token arrives we
              // fall through to the normal bubble (which still shows a
              // subtle cursor via message.streaming), so the transition
              // is seamless.
              const isTailStreamingEmpty =
                i === messages.length - 1 &&
                m.role === "assistant" &&
                m.streaming === true &&
                m.text.length === 0;
              if (isTailStreamingEmpty) {
                return (
                  <TypingIndicator
                    key={m.id}
                    mode="typing"
                    characterName={character.name}
                    characterImageUrl={character.imageUrl}
                  />
                );
              }
              const isTailFailed = i === tailFailedIndex;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  characterName={character.name}
                  onRetry={isTailFailed ? () => void retry() : undefined}
                />
              );
            })}

            {/* Clarify bubble — intent < 0.6 */}
            {CHAT_MEDIA_ENABLED && clarifyState ? (
              <ClarifyBubble
                question={clarifyState.question}
                characterImageUrl={character.imageUrl}
                characterName={character.name}
                onYes={() => {
                  const { intent } = clarifyState;
                  setClarifyState(null);
                  const kind: "IMAGE" | "VIDEO" = intent.mediaType === "video" ? "VIDEO" : "IMAGE";
                  void openComposer(intent.extractedScenePrompt, kind, intent.editMode, null);
                }}
                onNo={() => setClarifyState(null)}
              />
            ) : null}

            {/* Offer bubble — companion-initiated */}
            {CHAT_MEDIA_ENABLED && offerState ? (
              <OfferBubble
                mediaType={offerState.mediaType}
                cost={offerState.cost}
                characterImageUrl={character.imageUrl}
                characterName={character.name}
                onYes={() => {
                  const { mediaType, scene } = offerState;
                  setOfferState(null);
                  if (!conversationId) return;
                  void handleAutoGenerate(scene, mediaType === "video" ? "VIDEO" : "IMAGE", conversationId);
                }}
                onNo={() => setOfferState(null)}
              />
            ) : null}

            {/*
              Reading beat — the hook holds the assistant bubble out of
              the message list during this phase, so we render a
              distinct pill here rather than swap on tail contents.
              Anchored to a stable key so React doesn't rebuild the
              subtree when other state (streaming, tail text) changes.
            */}
            {reading ? (
              <TypingIndicator
                key="reading-indicator"
                mode="reading"
                characterName={character.name}
                characterImageUrl={character.imageUrl}
              />
            ) : null}
          </>
        )}
      </div>

      {/* MediaComposer sheet — key forces remount on each open so state resets. */}
      {CHAT_MEDIA_ENABLED ? (
        <MediaComposer
          key={`${composerScene}-${composerKind}-${composerOpen}`}
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          initialPrompt={composerScene}
          kind={composerKind}
          editMode={composerEditMode}
          referenceMediaId={composerRefId}
          recentImages={recentImages}
          onGenerate={handleComposerGenerate}
          characterName={character.name}
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border-t border-[#1e1e26] bg-[#0d0d13]"
      >
        {/* Composer mode pills (above the textarea) */}
        {CHAT_MEDIA_ENABLED ? (
          <ComposerModePills
            activeMode={composerMode}
            onModeChange={setComposerMode}
            videoEnabled={CHAT_VIDEO_ENABLED}
          />
        ) : null}

        <div className="px-4 md:px-6 py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-[#2a2a34] bg-[#131318] px-3 py-2 focus-within:border-pink-500/60 focus-within:ring-1 focus-within:ring-pink-500/30 transition-colors">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={composerPlaceholder}
              disabled={disabled}
              className="flex-1 resize-none bg-transparent py-1.5 text-sm text-white placeholder:text-[#6b6b76] outline-none max-h-32 disabled:opacity-70"
            />
            <button
              type="submit"
              disabled={disabled || draft.trim().length === 0}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                disabled || draft.trim().length === 0
                  ? "bg-[#1a1a22] text-[#4a4a55] cursor-not-allowed"
                  : "bg-pink-500 text-white hover:bg-pink-600",
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {composerHelp ? (
            <p className="mt-2 px-1 text-[11px] text-[#6b6b76]">{composerHelp}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function EmptyThread({ character }: { character: CharacterSummaryDto }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-[#8a8a99]">
      <p className="text-sm">
        Start your conversation with{" "}
        <span className="text-white font-medium">{character.name}</span>.
      </p>
      {character.tagline ? (
        <p className="mt-1 max-w-sm text-xs text-[#6b6b76]">
          &ldquo;{character.tagline}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

function ConversationHeader({
  character,
  detailOpen,
  onToggleDetail,
  conversationId,
  call,
  speakAgainSignal,
}: {
  character: CharacterSummaryDto;
  detailOpen: boolean;
  onToggleDetail: () => void;
  conversationId: string | null;
  call: ReturnType<typeof useVoiceCall>;
  speakAgainSignal: number;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[#1e1e26] px-4 md:px-6 py-3">
      <HeaderAvatar name={character.name} imageUrl={character.imageUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">
            {character.name}
          </span>
          <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-medium text-pink-400">
            {character.relationshipLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </div>
      </div>
      <div className="flex items-center gap-1 text-[#c4c2d4]">
        <VoiceCallButton
          conversationId={conversationId}
          enabled={VOICE_CALLS_ENABLED}
          call={call}
          openSignal={speakAgainSignal}
        />
        <IconButton title="More options">
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={onToggleDetail}
          title={detailOpen ? "Hide profile" : "Show profile"}
          className={cn(
            "hidden lg:inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors",
            detailOpen
              ? "bg-[#1a1a22] text-white"
              : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white",
          )}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function HeaderAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#2a2a34]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-xs font-semibold text-white">
      {initial}
    </div>
  );
}

function IconButton({
  children,
  title,
  disabled,
}: {
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        disabled
          ? "text-[#4a4a55] cursor-not-allowed"
          : "text-[#c4c2d4] hover:bg-[#151519] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
