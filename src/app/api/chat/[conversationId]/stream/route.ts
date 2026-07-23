import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { streamChat, resolveDefaultChatModel, generateImage, generateVideo, getCompanionSeed, ChatMessage } from "@/lib/ai/providerRouter";
import { deductCredits, grantCredits, getBalance, reserveCredits, refundReservedCredits } from "@/lib/billing/creditService";
import { getCreditCost, getVideoCreditCost } from "@/lib/billing/pricingService";
import { moderateContent } from "@/lib/ai/moderationService";
import { buildSystemPrompt, buildImagePrompt, buildImageEditPrompt, buildVideoPrompt } from "@/lib/ai/promptBuilder";
import { getMemory } from "@/lib/memory/memoryService";
import { getDefaultModel } from "@/lib/ai/modelRegistry";
import { classifyIntent, IntentRouterMessage } from "@/lib/ai/intentRouter";
import { resolveImageReferences } from "@/lib/ai/imageReferenceResolver";
import { rewriteNegation } from "@/lib/ai/sceneCleanup";
import { maybeUpdateConversationSummary } from "@/lib/ai/conversationSummarizer";
import { maybeUpdateCompanionMemory } from "@/lib/memory/memoryExtractor";
import { readMediaSettings } from "@/lib/chat/conversationMediaSettings";
import {
  readSceneState,
  writeSceneState,
  extractSceneFromAssistantText,
  extractSceneFromImageScene,
} from "@/lib/chat/sceneState";
import { TransactionType, MessageRole, MediaType, GenerationStatus, ModelType, Prisma } from "@prisma/client";

// ── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// ── Content policy error detection ────────────────────────────────────────────

function isContentPolicyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("content_policy") ||
    msg.includes("policy violation") ||
    msg.includes("moderat") ||
    msg.includes("safety") ||
    msg.includes("stream error 400") ||
    msg.includes("stream error 422") ||
    msg.includes("inappropriate")
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTEXT_MESSAGES = 50;
const MAX_ATTACHMENT_BYTES = 5_500_000;

// ── Intent detection ──────────────────────────────────────────────────────────

/**
 * Returns a cleaned scene description extracted from an image request, or null
 * if the message isn't an image request.
 *
 * Three tiers, checked in priority order:
 *  1. INTIMATE_ACTION  — NSFW physical actions, returns full text as scene
 *  2. VISUAL_REQUEST   — natural language "show me yourself in X", "wear X for me", etc.
 *  3. EXPLICIT_MEDIA   — explicit media keywords "send me a photo", "take a selfie", etc.
 */
function detectImageIntent(text: string): string | null {
  const t = text.trim();

  // ── Tier 1: NSFW physical action phrases ──────────────────────────────────
  const INTIMATE_ACTION =
    /\b(take off|remove|undress|strip|unzip|lift up|flash|reveal|get naked|get undressed)\b.{0,60}\b(you|yourself|your\s+(dress|shirt|top|clothes|bra|panties|underwear|skirt|pants|jeans|shorts|outfit|body|chest|ass|tits|boobs|lingerie|bikini))\b|\b(you\s+(strip|undress|remove|take off|get naked))\b|\b(show\s+(me\s+)?(your\s+)?(body|chest|tits|boobs|ass|pussy|cock|dick|naked|nude))\b/i;

  if (INTIMATE_ACTION.test(t)) {
    return t.replace(/^[\s,?!.]+|[\s,?!.]+$/g, "").trim() || "intimate portrait";
  }

  // ── Tier 2: Natural visual-request phrases (no media keyword needed) ───────
  const VISUAL_REQUEST =
    // "show me yourself in a saree" / "show me yourself" / "show me you"
    /(\bshow me\b|\blet me see\b|\bcan i see\b|\bi (want|wanna|would love) to see\b|\bi('d| would) like to see\b).{0,60}\b(you|yourself|ur|u)\b/i;
  const WEAR_REQUEST =
    // "wear that for me" / "put on a dress for me" / "dress in red for me"
    /\b(wear|put on|dressed? in|drape(d| yourself)? in|model)\b.{0,50}\bfor me\b/i;
  const LOOK_REQUEST =
    // "what do you look like" / "how do you look" / "let me see what you look like"
    /\b(what do you look like|how do you look|show me what you('re| are) wearing|what are you wearing)\b/i;
  const POSE_REQUEST =
    // "pose for me" / "can you model that" / "strike a pose"
    /\b(pose for (me|us)|can you model|strike a pose|take a photo for me)\b/i;
  const SHOW_YOUR_REQUEST =
    // "show me your outfit" / "show me your look today"
    /\bshow me your\b.{0,40}/i;
  const WANNA_SEE_REQUEST =
    // "I wanna see you in that" / "want to see you in the dress"
    /\b(wanna|want to|dying to|love to|gotta) see (you|yourself|ur)\b/i;

  if (
    VISUAL_REQUEST.test(t) ||
    WEAR_REQUEST.test(t) ||
    LOOK_REQUEST.test(t) ||
    POSE_REQUEST.test(t) ||
    SHOW_YOUR_REQUEST.test(t) ||
    WANNA_SEE_REQUEST.test(t)
  ) {
    // Strip common request scaffolding, keep the descriptive remainder as the scene
    const cleaned = t
      .replace(/\b(can you |please |could you |would you |i want to |i wanna |let me |show me |show yourself )\b/gi, "")
      .replace(/\b(see|look|look like|wearing|wear|for me|in that|in it)\b/gi, " ")
      .replace(/\b(what do you|how do you|what are you)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,?!.]+|[\s,?!.]+$/g, "")
      .trim();
    return cleaned.length > 3 ? cleaned : "candid portrait";
  }

  // ── Tier 3: Explicit media-keyword phrases ────────────────────────────────
  const EXPLICIT_MEDIA =
    /\b(show|send|give|take|snap|post|share|make|create|generate|get)\b.{0,50}\b(image|photo|picture|pic|selfie|shot|snap|photo?)\b|\b(your|a|an)\b.{0,25}\b(photo|picture|image|pic|selfie)\b/i;

  if (!EXPLICIT_MEDIA.test(t)) return null;

  const cleaned = t
    .replace(/\b(can you |please |could you |would you )?(show|send|give|make|create|generate|snap|take|post|share)\b.{0,15}\b(me\b)?/gi, "")
    .replace(/\b(a |an )?\b(image|photo|picture|pic|selfie|shot|snap)\b(\s+of\b)?/gi, "")
    .replace(/^[\s,?!.]+|[\s,?!.]+$/g, "")
    .trim();

  return cleaned.length > 3 ? cleaned : "candid portrait";
}

function detectVideoIntent(text: string): string | null {
  const t = text.trim();

  // Broad VIDEO_INTENT covering natural language: action + video-keyword, or
  // indirect phrasing like "say hi in a video", "record yourself", "do a video for me"
  const VIDEO_INTENT = /\b(show|send|give|make|create|generate|record|do|post|share|film|shoot)\b.{0,50}\b(video|clip|reel|recording|motion|moving|animate)\b|\b(show me|let me see|can i see|i want to see|wanna see)\b.{0,40}\b(video|clip|reel|moving|animated|a video)\b|\b(say|wave|wink|dance|smile|introduce yourself)\b.{0,30}\b(in a video|on video|as a video|via video|in clip)\b|\b(record yourself|record a video|make a video|do a video|film yourself)\b/i;

  if (!VIDEO_INTENT.test(t)) return null;

  const cleaned = t
    .replace(/\b(can you |please |could you )?(show|send|give|make|create|generate|record|do|film|shoot)\b.{0,15}\b(me\b)?/gi, "")
    .replace(/\b(say|wave|wink|dance|smile|blow a kiss|introduce yourself)\b.{0,10}/gi, "")
    .replace(/\b(a |an )?\b(video|clip|reel|recording|motion)\b(\s+(of|for|to|in|on)\b)?/gi, "")
    .replace(/\b(show me|let me see|can i see|in a|on|as a|via)\b/gi, "")
    .replace(/^[\s,?!.]+|[\s,?!.]+$/g, "")
    .trim();

  return cleaned.length > 3 ? cleaned : "short greeting clip of you";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response(sseEvent({ type: "error", error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const userId = session.user.id as string;
  const { conversationId } = await params;

  // ── 1. Parse request body ─────────────────────────────────────────────────
  let content = "";
  let attachmentDataUrl: string | undefined;
  let attachmentType: "image" | "video" | undefined;
  let attachmentName: string | undefined;

  try {
    const body = await req.json() as Record<string, unknown>;
    content = String(body.content ?? "").trim();

    if (body.attachmentType === "image" || body.attachmentType === "video") {
      attachmentType = body.attachmentType as "image" | "video";
      if (typeof body.attachmentName === "string") attachmentName = body.attachmentName;
      if (
        attachmentType === "image" &&
        typeof body.attachmentDataUrl === "string" &&
        body.attachmentDataUrl.length <= MAX_ATTACHMENT_BYTES
      ) {
        attachmentDataUrl = body.attachmentDataUrl;
      }
    }
  } catch {
    return new Response(sseEvent({ type: "error", error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (!content && !attachmentType) {
    return new Response(
      sseEvent({ type: "error", error: "Message content or attachment is required" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  if (content.length > 2000) {
    return new Response(
      sseEvent({ type: "error", error: "Message too long (max 2000 characters)" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // ── 2. Verify conversation ownership ──────────────────────────────────────
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { companion: true },
  });

  if (!conversation) {
    return new Response(sseEvent({ type: "error", error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  // ── 3. Content moderation ─────────────────────────────────────────────────
  const textToModerate = content || `[${attachmentType} attachment]`;
  const modResult = await moderateContent(textToModerate, {
    userId,
    contentType: "chat_message",
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined,
  });

  if (!modResult.allowed) {
    return new Response(
      sseEvent({
        type: "moderated",
        error: "Your message was blocked by content moderation. Please revise and try again.",
      }),
      { status: 422, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // ── 4. Intent detection ───────────────────────────────────────────────────
  //
  // Two layers run in parallel:
  //  - Regex (0ms, fast-path) for obvious explicit requests
  //  - Router LLM (~300ms, in parallel with credit lookups) for natural
  //    language + richer scene extraction using conversation context
  //
  // The router result wins ONLY when it has confidence >= 0.6. The richer
  // sceneDescription is always preferred when available because the router
  // can reach back into the conversation for context the user didn't restate.
  const regexImageScene = content ? detectImageIntent(content) : null;
  const regexVideoScene = content && !regexImageScene ? detectVideoIntent(content) : null;

  // Fetch a small slice of recent context for the router (separate from the
  // larger history fetch later — we want this to be fast and small).
  const routerHistoryPromise: Promise<IntentRouterMessage[]> = content
    ? prisma.message
        .findMany({
          where: {
            conversationId,
            role: { in: ["USER", "ASSISTANT"] },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { role: true, content: true },
        })
        .then((rows) =>
          rows
            .reverse()
            .map((r) => ({
              role: r.role as "USER" | "ASSISTANT",
              content: typeof r.content === "string" ? r.content : "",
            }))
            .filter((m) => m.content)
        )
        .catch(() => [])
    : Promise.resolve([]);

  const routerResult = content
    ? await routerHistoryPromise.then((history) =>
        classifyIntent({
          userMessage: content,
          recentMessages: history,
          companionName: conversation.companion.name,
          companionAppearanceHint: conversation.companion.appearancePrompt ?? "",
        })
      )
    : null;

  const ROUTER_CONFIDENCE = 0.6;
  const routerWantsImage =
    !!routerResult && routerResult.wantsImage && routerResult.confidence >= ROUTER_CONFIDENCE;
  const routerWantsVideo =
    !!routerResult && routerResult.wantsVideo && routerResult.confidence >= ROUTER_CONFIDENCE;

  // Image: pick router scene when available (richer), else regex scene
  const rawImageScene: string | null = routerWantsImage
    ? routerResult!.sceneDescription || regexImageScene || content
    : regexImageScene;

  // Video: same pattern
  const rawVideoScene: string | null = routerWantsVideo
    ? routerResult!.sceneDescription || regexVideoScene || content
    : !routerWantsImage && !rawImageScene
    ? regexVideoScene
    : null;

  // ── 4b. Apply per-conversation autoPics / autoVideos preferences ──────────
  //
  // autoPics:
  //   - "off"  → never auto-generate; treat as if no intent fired
  //   - "ask"  → don't auto-generate; emit a media_suggestion SSE so the UI
  //              shows an inline "Send pic?" card the user can tap
  //   - "on"   → auto-generate (current behaviour, used by power users)
  //
  // The default is "ask" so users don't get a surprise credit hit until they
  // explicitly opt in to auto-on.
  const mediaSettings = readMediaSettings(
    conversation.metadata,
    conversation.companion.metadata
  );
  const imageScene: string | null =
    mediaSettings.autoPics === "off" ? null : rawImageScene;
  const videoScene: string | null =
    mediaSettings.autoVideos === "off" ? null : rawVideoScene;

  const isImageAsk = mediaSettings.autoPics === "ask" && Boolean(rawImageScene);
  const isVideoAsk = mediaSettings.autoVideos === "ask" && Boolean(rawVideoScene);

  // When ask-mode fires, we still want to PREVIEW the scene + cost to the
  // client but NOT spend credits. The scene flows into the SSE only.
  const askImageScene = isImageAsk ? rawImageScene : null;
  const askVideoScene = isVideoAsk ? rawVideoScene : null;

  // For the actual generation gate below: only spend / generate when
  // autoPics === "on" (or routerWantsImage but autoPics === "on").
  const willAutoGenerateImage =
    mediaSettings.autoPics === "on" && Boolean(rawImageScene);
  const willAutoGenerateVideo =
    mediaSettings.autoVideos === "on" && Boolean(rawVideoScene);

  // ── 5. Credit checks ──────────────────────────────────────────────────────
  const chatCreditCost = await getCreditCost("chat_message");
  // Cost is computed for ANY detected intent (auto or ask) so the UI can
  // preview cost on the "Send pic?" card even when we're not spending yet.
  const imageCreditCost = (imageScene || askImageScene) ? await getCreditCost("image_generate") : 0;
  const videoCreditCost = (videoScene || askVideoScene) ? await getVideoCreditCost(5) : 0;
  const balance = await getBalance(userId);

  if (balance < chatCreditCost) {
    return new Response(
      sseEvent({
        type: "insufficient_credits",
        error: "Insufficient credits.",
        creditsRequired: chatCreditCost,
        creditsRemaining: balance,
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // Whether we have enough on top of chat credits to generate media. Only
  // gated by autoPics === "on" — "ask" mode never deducts up front.
  const canGenerateMedia = willAutoGenerateImage && balance >= chatCreditCost + imageCreditCost;
  const canGenerateVideo = willAutoGenerateVideo && balance >= chatCreditCost + videoCreditCost;
  const wantsMediaButCantAfford =
    (willAutoGenerateImage && !canGenerateMedia) || (willAutoGenerateVideo && !canGenerateVideo);

  const deduction = await deductCredits(
    userId,
    chatCreditCost,
    `Chat message — ${conversation.companion.name}`,
    conversationId
  );

  if (!deduction.success) {
    return new Response(
      sseEvent({ type: "insufficient_credits", error: "Insufficient credits.", creditsRemaining: deduction.balance }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // Deduct image credits now if we're going to generate
  let imageDeduction: { success: boolean; balance: number } | null = null;
  if (canGenerateMedia && imageCreditCost > 0) {
    imageDeduction = await deductCredits(
      userId,
      imageCreditCost,
      `Auto image — ${conversation.companion.name}`,
      conversationId
    );
  }

  // Reserve video credits now if we're going to generate a video
  let videoReservation: {
    success: boolean;
    reservationId?: string;
    balance?: number;
    error?: string;
  } | null = null;
  if (canGenerateVideo && videoCreditCost > 0) {
    videoReservation = await reserveCredits(
      userId,
      videoCreditCost,
      "video_generation",
      conversationId
    );
  }

  // ── 6. Save user message ──────────────────────────────────────────────────
  const displayContent =
    content ||
    (attachmentType === "image" ? "📷 Shared an image" : "🎥 Shared a video");

  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: "USER",
      content: displayContent,
      creditsUsed: chatCreditCost,
      ...(attachmentType === "image" && attachmentDataUrl
        ? { mediaUrl: attachmentDataUrl, mediaType: "image" }
        : {}),
    },
  });

  // ── 7. Load context, model info, memory ───────────────────────────────────
  const [rawHistory, memory, chatModel] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId,
        id: { not: userMessage.id },
        role: { in: ["USER", "ASSISTANT"] },
      },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_MESSAGES,
    }),
    getMemory(conversation.companionId, userId),
    resolveDefaultChatModel(),
  ]);

  const { slug: modelSlug, supportsVision } = chatModel;

  // Build an injection note for the AI about media generation status
  // We detect whether this was an explicit request ("send me a pic") or an
  // implicit action phrase ("remove your dress") by checking for media keywords.
  const hasExplicitMediaKeyword = /\b(image|photo|picture|pic|selfie|shot|snap|video|clip)\b/i.test(content ?? "");

  let mediaContextNote = "";
  if (canGenerateMedia && imageDeduction?.success && imageScene) {
    if (hasExplicitMediaKeyword) {
      mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: A photo is being generated right now and will appear in the chat in a moment based on what they asked for: "${imageScene}". Respond enthusiastically in character — e.g. "Here I am!" or "Let me show you..." — and set the mood. Keep it to 1-3 sentences. Do NOT describe the image in words.]`;
    } else {
      // ACTION_INTENT: user described something physical they want done
      mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: The user just asked you to physically do something. An image of you doing exactly that is generating right now and will appear as a separate photo. Respond in the first person as if you are PHYSICALLY PERFORMING the action described: "${imageScene}" — use action-style prose (e.g. "*slowly slides off my dress*... is this what you wanted?"). Keep it to 1-3 sentences. Do NOT say you are generating an image.]`;
    }
  } else if (canGenerateVideo && videoReservation?.success && videoScene) {
    mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: A short video clip of you is being submitted for generation right now based on: "${videoScene}". It will appear in the chat shortly. Respond as if you're recording yourself — e.g. "I'm filming this just for you..." or "Here's a little clip!". Keep it to 1-2 sentences.]`;
  } else if (wantsMediaButCantAfford) {
    const wantedType = willAutoGenerateImage && !canGenerateMedia ? "photo" : "video";
    mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: The user just asked you to share a ${wantedType}, but they're out of credits. Acknowledge it warmly and in-character — let them know you'd love to share one but they'll need to top up their credits first. Be playful and not preachy. Do not blame them. Keep it short (1-2 sentences) then continue the conversation naturally. A "Top Up" button will appear in the UI automatically.]`;
  } else if (askImageScene || askVideoScene) {
    const wantedType = askImageScene ? "photo" : "video";
    mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: The user hinted they'd like a ${wantedType}. A small "Send ${wantedType}?" button will appear under your reply so they can confirm. Reply naturally — you can tease the moment ("oh you wanna see?") but DO NOT pretend you've already sent it. Keep it 1-2 sentences.]`;
  } else if (videoScene) {
    mediaContextNote = `\n\n[SYSTEM NOTE — NOT VISIBLE TO USER: The user asked for a video. They can tap the Video button below the chat input to request one. Let them know warmly and stay in character.]`;
  }

  const sceneState = readSceneState(conversation.metadata);
  const systemPrompt =
    buildSystemPrompt(conversation.companion, {
      memoryMarkdown: memory?.memoryMarkdown,
      sceneState,
      conversationSummary: conversation.summary ?? undefined,
    }) + mediaContextNote;

  // Cap how many ASSISTANT images get inlined as pixel data. Vision context
  // is expensive — we keep only the most recent N so the chat LLM "remembers"
  // what she's been wearing/doing without ballooning token cost.
  const MAX_INLINE_ASSISTANT_IMAGES = 4;
  const assistantImageIdsToInline = new Set<string>();
  if (supportsVision) {
    // rawHistory is currently in DESC order (newest first). Walk it and
    // collect the first N assistant messages with an image URL.
    let found = 0;
    for (const m of rawHistory) {
      if (found >= MAX_INLINE_ASSISTANT_IMAGES) break;
      if (m.role === "ASSISTANT" && m.mediaUrl && m.mediaType === "image") {
        assistantImageIdsToInline.add(m.id);
        found++;
      }
    }
  }

  const historyMessages: ChatMessage[] = rawHistory.reverse().map((m) => {
    const role = m.role.toLowerCase() as "user" | "assistant";

    // Assistant message that IS a generated image (has mediaUrl). Branch on
    // vision capability so pixel-aware chat LLMs literally see prior photos —
    // makes "remember when you wore that red dress?" actually work.
    if (role === "assistant" && m.mediaUrl) {
      const label = m.mediaType === "video" ? "🎬" : "📸";
      const scene = m.content && !m.content.trim().startsWith("📸") && !m.content.trim().startsWith("🎬")
        ? m.content.trim()
        : (m.content?.replace(/^[📸🎬]\s*/, "").trim() || `shared a ${m.mediaType ?? "image"}`);

      if (
        supportsVision &&
        m.mediaType === "image" &&
        assistantImageIdsToInline.has(m.id)
      ) {
        return {
          role,
          content: [
            { type: "text" as const, text: `[I sent this photo: "${scene}"]` },
            { type: "image_url" as const, image_url: { url: m.mediaUrl } },
          ],
        };
      }
      return {
        role,
        content: `[${label} I sent: "${scene}"]`,
      };
    }

    // User message that ALSO contains an attached image — vision pixels for
    // models that support it.
    if (supportsVision && m.mediaUrl && m.mediaType === "image") {
      return {
        role,
        content: [
          ...(m.content && !["📷 Shared an image"].includes(m.content)
            ? [{ type: "text" as const, text: m.content }]
            : []),
          { type: "image_url" as const, image_url: { url: m.mediaUrl } },
        ],
      };
    }

    return {
      role,
      content: m.content || " ",
    };
  });

  let aiUserText = content;
  if (attachmentType === "video") {
    const note = attachmentName ? `[User shared a video: "${attachmentName}"]` : "[User shared a video]";
    aiUserText = content ? `${note}\n${content}` : note;
  } else if (attachmentType === "image" && !supportsVision) {
    const note = attachmentName ? `[User shared an image: "${attachmentName}"]` : "[User shared an image]";
    aiUserText = content ? `${note}\n${content}` : note;
  }

  const currentMessage: ChatMessage = {
    role: "user",
    content: aiUserText || " ",
  };

  const allMessages: ChatMessage[] = [...historyMessages, currentMessage];

  // ── 8a. Kick off image generation in background (before streaming text) ────
  let imageGenPromise: Promise<{
    url: string;
    width: number;
    height: number;
    referenceSource: "user-attachment" | "last-companion-photo" | "user+companion" | "none";
  } | null> | null = null;

  if (canGenerateMedia && imageDeduction?.success && imageScene) {
    // Resolve any reference images (user's current selfie + prior companion
    // photo when this looks like an edit). When present, generateImage will
    // route to the WAN image-edit model automatically.
    const refs = await resolveImageReferences({
      conversationId,
      companionId: conversation.companionId,
      currentAttachmentDataUrl:
        attachmentType === "image" ? attachmentDataUrl : undefined,
      intent: imageScene,
      routerEditHint: routerResult?.editsExistingImage,
    });

    const isEdit = refs.referenceImageUrls.length > 0;
    const { prompt } = isEdit
      ? buildImageEditPrompt({
          companion: conversation.companion,
          userRequest: imageScene,
          source: refs.source === "none" ? "last-companion-photo" : refs.source,
          sceneState,
        })
      : buildImagePrompt({
          companion: conversation.companion,
          userRequest: imageScene,
          aspectRatio: "portrait",
          sceneState,
        });

    const seed = getCompanionSeed(conversation.companionId);
    const referenceSource = refs.source;
    imageGenPromise = generateImage({
      prompt,
      aspectRatio: "portrait",
      seed,
      ...(isEdit ? { referenceImageUrls: refs.referenceImageUrls } : {}),
    })
      .then((r) => ({
        url: r.url,
        width: r.width,
        height: r.height,
        referenceSource,
      }))
      .catch((err) => {
        console.error("[stream/image intent]", err);
        return null;
      });
  }

  // ── 8b. Submit video job in background ────────────────────────────────────
  // Video is async on fal.ai — we submit the job here and emit a video_queued
  // event so the client can show a placeholder and poll for completion.
  let videoJobPromise: Promise<{ mediaGenerationId: string; jobId: string } | null> | null = null;

  if (canGenerateVideo && videoReservation?.success && videoScene) {
    // Look up the most recent companion photo. When one exists, prefer
    // image-to-video so the clip starts from a face we know — provider
    // router auto-routes to wan-2-7-image-to-video when inputImageUrl is set.
    const lastPhoto = await prisma.mediaGeneration.findFirst({
      where: {
        conversationId,
        companionId: conversation.companionId,
        type: MediaType.IMAGE,
        status: GenerationStatus.COMPLETED,
        storageUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { storageUrl: true },
    });
    const inputImageUrl = lastPhoto?.storageUrl ?? undefined;
    const useI2V = Boolean(inputImageUrl);

    const videoModel = useI2V
      ? null // let the router pick wan-2-7-image-to-video by capability
      : await getDefaultModel(ModelType.VIDEO);
    const videoModelSlug = useI2V
      ? "wan-2-7-image-to-video"
      : (videoModel?.slug ?? "mock-video-v1");

    const { prompt: videoPrompt, negativePrompt: videoNegPrompt } = buildVideoPrompt({
      companion: conversation.companion,
      userRequest: videoScene,
      durationSeconds: 5,
      aspectRatio: "portrait",
    });
    const seed = getCompanionSeed(conversation.companionId);

    videoJobPromise = (async () => {
      try {
        const mediaGen = await prisma.mediaGeneration.create({
          data: {
            userId,
            companionId: conversation.companionId,
            conversationId,
            type: MediaType.VIDEO,
            status: GenerationStatus.QUEUED,
            prompt: videoPrompt,
            negativePrompt: videoNegPrompt,
            userRequest: videoScene,
            durationSeconds: 5,
            aspectRatio: "portrait",
            modelSlug: videoModelSlug,
            creditsUsed: 0,
            creditsReserved: videoCreditCost,
            reservationId: videoReservation!.reservationId!,
            metadata: useI2V
              ? { sourceImageUrl: inputImageUrl, mode: "image-to-video" }
              : { mode: "text-to-video" },
          },
        });

        const jobResult = await generateVideo({
          prompt: videoPrompt,
          negativePrompt: videoNegPrompt,
          durationSeconds: 5,
          aspectRatio: "portrait",
          seed,
          ...(useI2V ? { inputImageUrl } : { modelSlug: videoModelSlug }),
        });

        await prisma.mediaGeneration.update({
          where: { id: mediaGen.id },
          data: {
            status: GenerationStatus.PROCESSING,
            providerJobId: jobResult.jobId,
            modelSlug: jobResult.modelSlug, // resolved actual model (may differ from videoModelSlug for i2v)
            metadata: {
              jobId: jobResult.jobId,
              provider: "fal",
              modelSlug: jobResult.modelSlug,
              mode: useI2V ? "image-to-video" : "text-to-video",
              ...(useI2V && inputImageUrl ? { sourceImageUrl: inputImageUrl } : {}),
              ...(jobResult.statusUrl ? { statusUrl: jobResult.statusUrl } : {}),
              ...(jobResult.responseUrl ? { responseUrl: jobResult.responseUrl } : {}),
            },
          },
        });

        return { mediaGenerationId: mediaGen.id, jobId: jobResult.jobId };
      } catch (err) {
        console.error("[stream/video intent]", err);
        if (videoReservation?.reservationId) {
          await refundReservedCredits(videoReservation.reservationId, "Video submission failed").catch(() => {});
        }
        return null;
      }
    })();
  }

  // ── 9. Stream text response + settle image ────────────────────────────────
  const encoder = new TextEncoder();
  let assistantContent = "";

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(data)));

      try {
        enqueue({ type: "user_saved", messageId: userMessage.id });

        // If the user wants media but can't afford it, surface that to the UI
        // BEFORE the assistant text streams in. The chat LLM also gets a system
        // note (above) so the companion mentions it warmly in-character.
        if (wantsMediaButCantAfford) {
          const mediaType: "image" | "video" = willAutoGenerateImage && !canGenerateMedia ? "image" : "video";
          const required = mediaType === "image" ? imageCreditCost : videoCreditCost;
          enqueue({
            type: "media_unaffordable",
            mediaType,
            creditsRequired: required,
            creditsRemaining: balance,
          });
        }

        // Ask-mode: emit a suggestion the client can render as an inline
        // "Send pic?" card. No credits spent yet — the user taps to confirm.
        if (askImageScene) {
          enqueue({
            type: "media_suggestion",
            mediaType: "image",
            scene: askImageScene,
            creditsRequired: imageCreditCost,
            creditsRemaining: balance,
          });
        } else if (askVideoScene) {
          enqueue({
            type: "media_suggestion",
            mediaType: "video",
            scene: askVideoScene,
            creditsRequired: videoCreditCost,
            creditsRemaining: balance,
          });
        }

        for await (const token of streamChat({
          messages: allMessages,
          systemPrompt,
          stream: true,
          ...(attachmentType === "image" && attachmentDataUrl && supportsVision
            ? { attachmentDataUrl }
            : {}),
        })) {
          assistantContent += token;
          enqueue({ type: "token", content: token });
        }

        const assistantMessage = await prisma.message.create({
          data: {
            conversationId,
            role: "ASSISTANT",
            content: assistantContent,
            modelSlug,
            creditsUsed: 0,
          },
        });

        // Mine the assistant reply for outfit / location / mood mentions so
        // future system prompts (and image prompts) stay in lock-step with the
        // scene the companion just described.
        const assistantSceneFields = extractSceneFromAssistantText(assistantContent);
        if (Object.keys(assistantSceneFields).length > 0) {
          await prisma.conversation
            .update({
              where: { id: conversationId },
              data: {
                lastMessageAt: new Date(),
                metadata: writeSceneState(
                  conversation.metadata,
                  assistantSceneFields
                ) as unknown as Prisma.InputJsonValue,
              },
            })
            .catch(() => {
              return prisma.conversation.update({
                where: { id: conversationId },
                data: { lastMessageAt: new Date() },
              });
            });
        } else {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() },
          });
        }

        // mediaWillFollow tells the client whether to show a "generating" indicator.
        // This is the authoritative signal — the client must NOT use its own regex.
        const mediaWillFollow =
          (canGenerateMedia && imageDeduction?.success && !!imageScene) ||
          (canGenerateVideo && videoReservation?.success && !!videoScene);

        enqueue({
          type: "done",
          assistantMessageId: assistantMessage.id,
          userMessageId: userMessage.id,
          creditsRemaining: deduction.balance,
          modelSlug,
          mediaWillFollow,
        });

        // ── Background memory + summary maintenance ────────────────────────
        // Both run fire-and-forget so the user-visible reply is never blocked.
        // Each function decides internally whether the cadence is right and
        // is responsible for catching its own errors.
        void maybeUpdateConversationSummary(conversationId);
        void maybeUpdateCompanionMemory({
          conversationId,
          companionId: conversation.companionId,
          userId,
        });

        // Emit video_queued as soon as the job is submitted (before or in parallel with text)
        if (videoJobPromise) {
          const videoResult = await videoJobPromise;
          if (videoResult) {
            await prisma.message.create({
              data: {
                conversationId,
                role: MessageRole.ASSISTANT,
                content: "🎬 video generating",
                mediaType: "video",
                metadata: { mediaGenerationId: videoResult.mediaGenerationId },
              },
            });
            enqueue({
              type: "video_queued",
              mediaGenerationId: videoResult.mediaGenerationId,
              jobId: videoResult.jobId,
              creditsReserved: videoCreditCost,
            });
          } else {
            enqueue({ type: "media_error", error: "Video generation failed to start." });
          }
        }

        // Now wait for and emit image result (after text finishes)
        if (imageGenPromise) {
          const imgResult = await imageGenPromise;

          if (imgResult) {
            // Save image as an assistant message
            const mediaGen = await prisma.mediaGeneration.create({
              data: {
                userId,
                companionId: conversation.companionId,
                conversationId,
                type: MediaType.IMAGE,
                status: GenerationStatus.COMPLETED,
                prompt: buildImagePrompt({ companion: conversation.companion, userRequest: imageScene!, aspectRatio: "portrait" }).prompt,
                userRequest: imageScene!,
                aspectRatio: "portrait",
                modelSlug: imgResult.referenceSource !== "none" ? "wan-2-7-image-edit" : "wan-2-7-text-to-image",
                storageUrl: imgResult.url,
                creditsUsed: imageCreditCost,
                completedAt: new Date(),
                metadata: {
                  width: imgResult.width,
                  height: imgResult.height,
                  autoGenerated: true,
                  referenceSource: imgResult.referenceSource,
                },
              },
            });

            const imgMessage = await prisma.message.create({
              data: {
                conversationId,
                role: MessageRole.ASSISTANT,
                // Store the scene so future history reads show "📸 shared: <scene>"
                content: imageScene ? `📸 ${imageScene}` : "📸 shared a photo",
                mediaUrl: imgResult.url,
                mediaType: "image",
                metadata: {
                  mediaGenerationId: mediaGen.id,
                  referenceSource: imgResult.referenceSource,
                },
              },
            });

            // Update scene state to reflect the newly-shared photo so the next
            // text reply and the next image stay coherent with this scene.
            const sceneUpdate = {
              ...extractSceneFromImageScene(imageScene ?? ""),
              lastImageUrl: imgResult.url,
            };
            await prisma.conversation
              .update({
                where: { id: conversationId },
                data: {
                  lastMessageAt: new Date(),
                  metadata: writeSceneState(
                    conversation.metadata,
                    sceneUpdate
                  ) as unknown as Prisma.InputJsonValue,
                },
              })
              .catch(() => {
                // Best-effort — fall back to just lastMessageAt update
                return prisma.conversation.update({
                  where: { id: conversationId },
                  data: { lastMessageAt: new Date() },
                });
              });

            enqueue({
              type: "media_result",
              mediaType: "image",
              url: imgResult.url,
              width: imgResult.width,
              height: imgResult.height,
              messageId: imgMessage.id,
              creditsUsed: imageCreditCost,
              referenceSource: imgResult.referenceSource,
            });
          } else {
            // Image generation failed — refund
            if (imageCreditCost > 0) {
              await grantCredits(
                userId,
                imageCreditCost,
                `Refund — auto image generation failed`,
                TransactionType.CREDIT_REFUND
              ).catch(() => {});
            }
            enqueue({ type: "media_error", error: "Image generation failed. Credits refunded." });
          }
        }
      } catch (err) {
        console.error("[STREAM ERROR]", err);

        if (isContentPolicyError(err)) {
          // LLM refused due to content policy — refund chat credit first.
          try {
            await grantCredits(
              userId,
              chatCreditCost,
              `Refund — content policy bypass for message ${userMessage.id}`,
              TransactionType.CREDIT_REFUND,
              userMessage.id
            ).catch(() => {});
          } catch {
            /* ignore cleanup errors */
          }

          // ── Salvage: race the in-flight WAN image against a short timeout.
          // The chat LLM refused but WAN is uncensored — most of the time the
          // image is already on its way. If it arrives in time, persist it as
          // a normal media_result and SKIP opening the modal entirely. This
          // removes the "two images" duplicate scenario where the user would
          // see the modal pop up, fire a second generation, and get an edit.
          let salvagedImage: {
            url: string;
            width: number;
            height: number;
            referenceSource:
              | "user-attachment"
              | "last-companion-photo"
              | "user+companion"
              | "none";
          } | null = null;

          if (imageGenPromise && imageDeduction?.success) {
            try {
              salvagedImage = await Promise.race([
                imageGenPromise,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
              ]);
            } catch {
              salvagedImage = null;
            }
          }

          if (salvagedImage) {
            // We have a real image. Persist as a normal assistant message,
            // emit media_result, and tell the user message is intact.
            try {
              const mediaGen = await prisma.mediaGeneration.create({
                data: {
                  userId,
                  companionId: conversation.companionId,
                  conversationId,
                  type: MediaType.IMAGE,
                  status: GenerationStatus.COMPLETED,
                  prompt: buildImagePrompt({
                    companion: conversation.companion,
                    userRequest: imageScene ?? rawImageScene ?? "candid portrait",
                    aspectRatio: "portrait",
                  }).prompt,
                  userRequest: imageScene ?? rawImageScene ?? "candid portrait",
                  aspectRatio: "portrait",
                  modelSlug:
                    salvagedImage.referenceSource !== "none"
                      ? "wan-2-7-image-edit"
                      : "wan-2-7-text-to-image",
                  storageUrl: salvagedImage.url,
                  creditsUsed: imageCreditCost,
                  completedAt: new Date(),
                  metadata: {
                    width: salvagedImage.width,
                    height: salvagedImage.height,
                    autoGenerated: true,
                    salvaged: true,
                    referenceSource: salvagedImage.referenceSource,
                  },
                },
              });

              const imgMessage = await prisma.message.create({
                data: {
                  conversationId,
                  role: MessageRole.ASSISTANT,
                  content: imageScene
                    ? `📸 ${imageScene}`
                    : "📸 shared a photo",
                  mediaUrl: salvagedImage.url,
                  mediaType: "image",
                  metadata: {
                    mediaGenerationId: mediaGen.id,
                    referenceSource: salvagedImage.referenceSource,
                  },
                },
              });

              const salvagedSceneUpdate = {
                ...extractSceneFromImageScene(imageScene ?? rawImageScene ?? ""),
                lastImageUrl: salvagedImage.url,
              };
              await prisma.conversation
                .update({
                  where: { id: conversationId },
                  data: {
                    lastMessageAt: new Date(),
                    metadata: writeSceneState(
                      conversation.metadata,
                      salvagedSceneUpdate
                    ) as unknown as Prisma.InputJsonValue,
                  },
                })
                .catch(() => {
                  return prisma.conversation.update({
                    where: { id: conversationId },
                    data: { lastMessageAt: new Date() },
                  });
                });

              enqueue({
                type: "media_result",
                mediaType: "image",
                url: salvagedImage.url,
                width: salvagedImage.width,
                height: salvagedImage.height,
                messageId: imgMessage.id,
                creditsUsed: imageCreditCost,
                referenceSource: salvagedImage.referenceSource,
              });
            } catch (persistErr) {
              console.error("[STREAM SALVAGE PERSIST]", persistErr);
              // Fall through to the modal flow below.
              salvagedImage = null;
            }
          }

          if (!salvagedImage) {
            // No salvageable image — refund image credit (if any) and open the
            // modal so the user can describe what they want.
            if (imageCreditCost > 0 && imageDeduction?.success) {
              await grantCredits(
                userId,
                imageCreditCost,
                "Refund — content policy (image)",
                TransactionType.CREDIT_REFUND
              ).catch(() => {});
            }
            // Delete the saved user message so the conversation stays clean;
            // when the user generates via the modal it is re-sent through
            // /api/media/image.
            await prisma.message
              .delete({ where: { id: userMessage.id } })
              .catch(() => {});

            // Tell the frontend to open the image generation modal pre-filled
            // with the BEST CLEAN scene we have. Priority: router scene (rich,
            // negation-rewritten) → regex-cleaned imageScene → cleaned raw text.
            // forceMode keeps the resolver from accidentally routing the
            // complaint text to the edit endpoint.
            const cleanedSceneForModal =
              rewriteNegation(routerResult?.sceneDescription) ||
              imageScene ||
              rawImageScene ||
              rewriteNegation(content) ||
              "candid portrait";

            enqueue({
              type: "image_suggestion",
              prompt: cleanedSceneForModal,
              forceMode: routerResult?.editsExistingImage ? "edit" : "fresh",
            });
          }
        } else {
          // Real provider failure — refund and show error
          try {
            await grantCredits(
              userId,
              chatCreditCost,
              `Refund — AI error for message ${userMessage.id}`,
              TransactionType.CREDIT_REFUND,
              userMessage.id
            );
            if (imageCreditCost > 0 && imageDeduction?.success) {
              await grantCredits(userId, imageCreditCost, "Refund — AI error (image)", TransactionType.CREDIT_REFUND);
            }
            await prisma.message.delete({ where: { id: userMessage.id } });
          } catch (refundErr) {
            console.error("[REFUND ERROR]", refundErr);
          }

          enqueue({
            type: "error",
            error: "AI provider encountered an error. Your credits have been refunded.",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
