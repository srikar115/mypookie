import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { moderateContent } from "@/lib/ai/moderationService";
import { generateVideo, getCompanionSeed } from "@/lib/ai/providerRouter";
import { buildVideoPrompt } from "@/lib/ai/promptBuilder";
import { reserveCredits, refundReservedCredits } from "@/lib/billing/creditService";
import { getVideoCreditCost } from "@/lib/billing/pricingService";
import { getDefaultModel } from "@/lib/ai/modelRegistry";
import { MediaType, GenerationStatus, ModelType } from "@prisma/client";

const requestSchema = z.object({
  companionId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  userRequest: z.string().min(1).max(500),
  durationSeconds: z.enum(["5", "8", "10"]).transform(Number).default(5),
  aspectRatio: z.enum(["portrait", "square", "landscape"]).default("square"),
  /**
   * "from-last-photo" (default): animate the most recent companion photo
   *   when one exists in this conversation; falls back to text-to-video.
   * "text-only": skip the photo lookup and always generate a clip from text.
   */
  mode: z.enum(["from-last-photo", "text-only"]).default("from-last-photo"),
  /** Optional explicit first-frame URL — bypasses the conversation lookup. */
  inputImageUrl: z.string().url().optional(),
});

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
  const { companionId, conversationId, userRequest, durationSeconds, aspectRatio, mode, inputImageUrl: explicitInputImageUrl } = parsed.data;

  // Verify companion ownership
  const companion = await prisma.companion.findFirst({
    where: { id: companionId, userId, status: "ACTIVE" },
  });
  if (!companion) {
    return NextResponse.json({ error: "Companion not found" }, { status: 404 });
  }

  // Decide whether this is an image-to-video clip. Caller can supply an
  // explicit input image, or we pull the most recent companion photo from
  // the conversation when mode === "from-last-photo".
  let inputImageUrl: string | undefined = explicitInputImageUrl;
  if (!inputImageUrl && mode === "from-last-photo" && conversationId) {
    const lastPhoto = await prisma.mediaGeneration.findFirst({
      where: {
        conversationId,
        companionId,
        type: MediaType.IMAGE,
        status: GenerationStatus.COMPLETED,
        storageUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { storageUrl: true },
    });
    if (lastPhoto?.storageUrl) inputImageUrl = lastPhoto.storageUrl;
  }
  const useI2V = Boolean(inputImageUrl);

  // Moderation
  const modResult = await moderateContent(userRequest, {
    userId,
    contentType: "video_prompt",
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });
  if (!modResult.allowed) {
    return NextResponse.json({ error: modResult.userMessage, code: "MODERATED" }, { status: 422 });
  }

  // Pick model. When i2v, let the provider router select the model with
  // capabilities.requiresInputImage; otherwise use the configured default.
  const videoModel = useI2V ? null : await getDefaultModel(ModelType.VIDEO);
  const modelSlug = useI2V ? "wan-2-7-image-to-video" : (videoModel?.slug ?? "mock-video-v1");

  // Credit cost
  const creditCost = await getVideoCreditCost(durationSeconds, modelSlug);

  // Check balance
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < creditCost) {
    return NextResponse.json({ error: "Insufficient credits", required: creditCost, balance: wallet?.balance ?? 0, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }

  // Reserve credits
  const reservation = await reserveCredits(userId, creditCost, "video_generation", companionId);
  if (!reservation.success) {
    return NextResponse.json({ error: "Failed to reserve credits" }, { status: 402 });
  }
  const reservationId = reservation.reservationId!;

  // Build prompt
  const { prompt, negativePrompt } = buildVideoPrompt({ companion, userRequest, durationSeconds, aspectRatio, modelSlug });

  // Create queued media generation row
  const mediaGen = await prisma.mediaGeneration.create({
    data: {
      userId,
      companionId,
      conversationId: conversationId ?? null,
      type: MediaType.VIDEO,
      status: GenerationStatus.QUEUED,
      prompt,
      negativePrompt,
      userRequest,
      durationSeconds,
      aspectRatio,
      modelSlug,
      creditsUsed: 0,
      creditsReserved: creditCost,
      reservationId,
      metadata: useI2V
        ? { sourceImageUrl: inputImageUrl, mode: "image-to-video" }
        : { mode: "text-to-video" },
    },
  });

  // Submit video job (include deterministic seed for character consistency).
  // When i2v, pass inputImageUrl and let the router pick the i2v model.
  const seed = getCompanionSeed(companionId);
  let jobResult;
  try {
    jobResult = await generateVideo({
      prompt,
      negativePrompt,
      durationSeconds,
      aspectRatio,
      seed,
      ...(useI2V ? { inputImageUrl } : { modelSlug }),
    });
  } catch (err) {
    // Refund reservation on failure
    await refundReservedCredits(reservationId, "Video provider submission failed");
    await prisma.mediaGeneration.update({
      where: { id: mediaGen.id },
      data: { status: GenerationStatus.FAILED, errorMessage: "Provider submission failed" },
    });
    console.error("[media/video] provider error:", err);
    return NextResponse.json({ error: "Video generation failed to start. Credits have been refunded." }, { status: 500 });
  }

  // Update with job info
  await prisma.mediaGeneration.update({
    where: { id: mediaGen.id },
    data: {
      status: GenerationStatus.PROCESSING,
      providerJobId: jobResult.jobId,
      modelSlug: jobResult.modelSlug,
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

  return NextResponse.json({
    id: mediaGen.id,
    jobId: jobResult.jobId,
    status: "processing",
    modelSlug: jobResult.modelSlug,
    mode: useI2V ? "image-to-video" : "text-to-video",
    creditsReserved: creditCost,
    remainingCredits: reservation.balance,
  });
}
