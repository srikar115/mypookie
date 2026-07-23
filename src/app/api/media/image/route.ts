import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { moderateContent } from "@/lib/ai/moderationService";
import { generateImage, getCompanionSeed } from "@/lib/ai/providerRouter";
import { buildImagePrompt, buildImageEditPrompt } from "@/lib/ai/promptBuilder";
import { classifyIntent } from "@/lib/ai/intentRouter";
import { resolveImageReferences } from "@/lib/ai/imageReferenceResolver";
import { deductCredits, grantCredits } from "@/lib/billing/creditService";
import { getCreditCost } from "@/lib/billing/pricingService";
import { getDefaultModel } from "@/lib/ai/modelRegistry";
import { MediaType, GenerationStatus, MessageRole, ModelType, TransactionType, Prisma } from "@prisma/client";
import type { Companion } from "@prisma/client";
import {
  readSceneState,
  writeSceneState,
  extractSceneFromImageScene,
} from "@/lib/chat/sceneState";

const requestSchema = z.object({
  companionId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  userRequest: z.string().max(500).optional(),   // optional — derived from context when absent
  aspectRatio: z.enum(["portrait", "square", "landscape"]).default("portrait"),
  style: z.string().max(100).optional(),
  quickGenerate: z.boolean().optional(),          // skip modal, derive scene from conversation
  /**
   * Caller-supplied reference image. Used by the chat UI when the user
   * has explicitly chosen to "use my selfie" via the modal. When omitted,
   * the resolver still considers the latest companion photo when the user
   * scene reads like an edit.
   */
  referenceImageDataUrl: z.string().optional(),
  /** Used by quick-generate to skip looking up prior photos when caller wants a fresh shot. */
  forceFresh: z.boolean().optional(),
  /**
   * Opposite of forceFresh: caller (e.g. modal opened with explicit "edit
   * the last photo" mode) wants the resolver to ALWAYS pull the latest
   * companion image as a reference. Ignored if no prior photo exists.
   */
  forceEdit: z.boolean().optional(),
});

// ── Context-aware scene derivation ────────────────────────────────────────────

type MessageRow = { content: string | null; role: string };

/**
 * Legacy regex extraction — used as a fallback when the router LLM is
 * unavailable. Mines recent assistant text for outfit/pose/setting hints.
 */
function legacyDeriveScene(messages: MessageRow[]): string {
  // Collect recent assistant text in chronological order
  const assistantText = messages
    .filter((m) => m.role === "ASSISTANT" && m.content && !m.content.startsWith("📸") && !m.content.startsWith("🎬"))
    .map((m) => m.content as string)
    .reverse()
    .join(" ");

  // Try to extract an outfit/setting/activity description
  const patterns = [
    /\b(?:wearing|dressed in|in a|draped in|wrapped in|put on)\b(.{3,80})/i,
    /\b(?:just changed into|changed into|slipped into|thrown on)\b(.{3,80})/i,
    /\b(?:sitting|lying|standing|posing|lounging)\b(.{3,80})/i,
  ];

  for (const pattern of patterns) {
    const match = assistantText.match(pattern);
    if (match?.[1]) {
      const scene = match[1]
        .replace(/[,;.!?].*$/, "")
        .replace(/\b(right now|today|for you|at the moment)\b/gi, "")
        .trim();
      if (scene.length > 4) return scene;
    }
  }

  // Also check most recent user message for visual hints
  const lastUserMsg = messages.find((m) => m.role === "USER");
  if (lastUserMsg?.content) {
    const userHint = lastUserMsg.content
      .replace(/\b(show me|let me see|can i see|send me|i want to see)\b/gi, "")
      .replace(/\b(yourself|you|ur|a photo|an image|a pic|a selfie)\b/gi, "")
      .replace(/^[\s,?!.]+|[\s,?!.]+$/g, "")
      .trim();
    if (userHint.length > 4) return userHint;
  }

  return "candid portrait";
}

async function deriveSceneFromContext(
  conversationId: string,
  companion: Companion
): Promise<string> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { content: true, role: true },
  });

  // Try the router LLM first — it understands context across the whole
  // conversation, not just a single regex pattern. Falls back to regex on
  // any error / null result.
  try {
    const intent = await classifyIntent({
      userMessage: "[Generate a photo based on what we've been talking about]",
      recentMessages: messages
        .slice()
        .reverse()
        .map((m) => ({
          role: m.role as "USER" | "ASSISTANT",
          content: typeof m.content === "string" ? m.content : "",
        }))
        .filter((m) => m.content && !m.content.startsWith("📸") && !m.content.startsWith("🎬")),
      companionName: companion.name,
      companionAppearanceHint: companion.appearancePrompt ?? "",
    });
    if (intent?.sceneDescription && intent.sceneDescription.length >= 5) {
      return intent.sceneDescription;
    }
  } catch {
    // fall through to legacy regex
  }

  return legacyDeriveScene(messages);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });
  }
  const { companionId, conversationId, aspectRatio, style, quickGenerate, referenceImageDataUrl, forceFresh, forceEdit } = parsed.data;
  let { userRequest } = parsed.data;

  // Verify companion ownership (need it for the router context hint)
  const companion = await prisma.companion.findFirst({
    where: { id: companionId, userId, status: "ACTIVE" },
  });
  if (!companion) {
    return NextResponse.json({ error: "Companion not found" }, { status: 404 });
  }

  // Derive scene from conversation context when quickGenerate or no explicit request
  if (!userRequest || quickGenerate) {
    userRequest = conversationId
      ? await deriveSceneFromContext(conversationId, companion)
      : "candid portrait";
  }

  // Moderation check on user request
  const modResult = await moderateContent(userRequest, {
    userId,
    contentType: "image_prompt",
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });
  if (!modResult.allowed) {
    return NextResponse.json({ error: modResult.userMessage, code: "MODERATED" }, { status: 422 });
  }

  // ── 10s dedupe guard ────────────────────────────────────────────────────────
  // If an identical user request for the same conversation has completed
  // within the last 10 seconds, return that existing media instead of paying
  // for and generating a duplicate. Prevents accidental double-taps (modal
  // submit + media-suggestion accept, etc.) from creating two photos in the
  // chat. Skipped for forceFresh callers and when there is no conversation.
  if (conversationId && !forceFresh) {
    const recentCutoff = new Date(Date.now() - 10_000);
    const duplicate = await prisma.mediaGeneration.findFirst({
      where: {
        conversationId,
        userId,
        type: MediaType.IMAGE,
        status: GenerationStatus.COMPLETED,
        userRequest,
        completedAt: { gte: recentCutoff },
        storageUrl: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        storageUrl: true,
        modelSlug: true,
        creditsUsed: true,
        metadata: true,
      },
    });
    if (duplicate?.storageUrl) {
      const meta = (duplicate.metadata as Record<string, unknown> | null) ?? {};
      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      return NextResponse.json({
        id: duplicate.id,
        url: duplicate.storageUrl,
        width: (meta.width as number | undefined) ?? null,
        height: (meta.height as number | undefined) ?? null,
        modelSlug: duplicate.modelSlug,
        creditsUsed: 0,
        remainingCredits: wallet?.balance ?? 0,
        derivedScene: userRequest,
        referenceSource: (meta.referenceSource as string | undefined) ?? "none",
        deduped: true,
      });
    }
  }

  // Load default image model
  const imageModel = await getDefaultModel(ModelType.IMAGE);
  const modelSlug = imageModel?.slug ?? "mock-image-v1";

  // Credit cost
  const creditCost = await getCreditCost("image_generate", modelSlug);

  // Check balance
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < creditCost) {
    return NextResponse.json({ error: "Insufficient credits", required: creditCost, balance: wallet?.balance ?? 0, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }

  // Deduct credits
  const deduction = await deductCredits(userId, creditCost, `Image generation — ${companion.name}`, companionId);
  if (!deduction.success) {
    return NextResponse.json({ error: "Failed to deduct credits" }, { status: 402 });
  }

  // Resolve reference images (selfie from caller + last companion photo for edits).
  // forceFresh=true bypasses the resolver entirely so the user can demand a
  // brand-new shot. forceEdit=true short-circuits the regex hint check and
  // forces an edit lookup. When the caller hands us a referenceImageDataUrl
  // that ALONE counts as an explicit edit signal.
  const explicitEdit = Boolean(referenceImageDataUrl) || forceEdit === true;
  const refs = forceFresh
    ? { referenceImageUrls: [] as string[], source: "none" as const }
    : await resolveImageReferences({
        conversationId,
        companionId,
        currentAttachmentDataUrl: referenceImageDataUrl,
        intent: userRequest,
        // Only set explicit true to short-circuit. Otherwise leave undefined
        // so the resolver's regex fallback can fire for clear edit hints in
        // free-form user text ("now take off your jacket", "same but smile").
        routerEditHint: explicitEdit ? true : undefined,
      });

  const isEdit = refs.referenceImageUrls.length > 0;

  // Load conversation scene state (when applicable) so the prompt is coherent
  // with the ongoing scene. Reads from Conversation.metadata.sceneState.
  const conversationForScene = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { metadata: true },
      })
    : null;
  const sceneState = readSceneState(conversationForScene?.metadata);

  // Build prompt — edit endpoint wants an instruction delta, not a full
  // appearance restatement.
  const { prompt, negativePrompt } = isEdit
    ? buildImageEditPrompt({
        companion,
        userRequest,
        source: refs.source === "none" ? "last-companion-photo" : refs.source,
        style,
        sceneState,
      })
    : buildImagePrompt({ companion, userRequest, style, aspectRatio, modelSlug, sceneState });

  // Final moderation on built prompt
  const builtModResult = await moderateContent(prompt, { userId, contentType: "image_prompt" });
  if (!builtModResult.allowed) {
    await grantCredits(userId, creditCost, "Refund — moderation block on built prompt", TransactionType.CREDIT_REFUND);
    return NextResponse.json({ error: builtModResult.userMessage, code: "MODERATED" }, { status: 422 });
  }

  // Generate image (include deterministic seed for character consistency).
  // When references are present, provider router auto-switches to WAN edit.
  const seed = getCompanionSeed(companionId);
  let imageResult;
  try {
    imageResult = await generateImage({
      prompt,
      negativePrompt,
      aspectRatio,
      style,
      seed,
      ...(isEdit
        ? { referenceImageUrls: refs.referenceImageUrls }
        : { modelSlug }),
    });
  } catch (err) {
    await grantCredits(userId, creditCost, "Refund — image generation provider error", TransactionType.CREDIT_REFUND);
    console.error("[media/image] provider error:", err);
    return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
  }

  // Save media_generations record
  const mediaGen = await prisma.mediaGeneration.create({
    data: {
      userId,
      companionId,
      conversationId: conversationId ?? null,
      type: MediaType.IMAGE,
      status: GenerationStatus.COMPLETED,
      prompt,
      negativePrompt,
      userRequest,
      aspectRatio,
      style: style ?? null,
      modelSlug: isEdit ? "wan-2-7-image-edit" : modelSlug,
      storageUrl: imageResult.url,
      creditsUsed: creditCost,
      completedAt: new Date(),
      metadata: {
        width: imageResult.width,
        height: imageResult.height,
        referenceSource: refs.source,
      },
    },
  });

  // Save assistant message in conversation if provided
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: `📸 ${userRequest}`,
          mediaUrl: imageResult.url,
          mediaType: "image",
          metadata: {
            mediaGenerationId: mediaGen.id,
            width: imageResult.width,
            height: imageResult.height,
            referenceSource: refs.source,
          },
        },
      });

      // Persist scene state so the next turn's text + image stay coherent
      // with the photo we just sent.
      const sceneUpdate = {
        ...extractSceneFromImageScene(userRequest),
        lastImageUrl: imageResult.url,
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
          return prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() },
          });
        });
    }
  }

  return NextResponse.json({
    id: mediaGen.id,
    url: imageResult.url,
    width: imageResult.width,
    height: imageResult.height,
    modelSlug: isEdit ? "wan-2-7-image-edit" : modelSlug,
    creditsUsed: creditCost,
    remainingCredits: deduction.balance,
    derivedScene: userRequest,
    referenceSource: refs.source,
  });
}
