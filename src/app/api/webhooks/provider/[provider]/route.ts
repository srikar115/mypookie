import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { finalizeReservedCredits, refundReservedCredits } from "@/lib/billing/creditService";
import { GenerationStatus, MessageRole } from "@prisma/client";

interface ProviderWebhookPayload {
  job_id?: string;
  jobId?: string;
  status?: string;
  result_url?: string;
  resultUrl?: string;
  error?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  let payload: ProviderWebhookPayload;
  try {
    payload = await req.json() as ProviderWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = payload.job_id ?? payload.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "Missing job_id" }, { status: 400 });
  }

  // Verify webhook signature (provider-specific)
  const sigHeader = req.headers.get("x-webhook-signature") ?? req.headers.get("x-signature");
  const webhookSecret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
  if (webhookSecret && sigHeader) {
    // TODO: implement HMAC verification per provider
    // For now: log and continue
    console.log(`[webhook/${provider}] signature present but not yet verified`);
  }

  const mediaGen = await prisma.mediaGeneration.findFirst({
    where: { providerJobId: jobId },
  });
  if (!mediaGen) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const status = payload.status?.toLowerCase();
  const resultUrl = payload.result_url ?? payload.resultUrl;

  if (status === "completed" && resultUrl) {
    if (mediaGen.reservationId) await finalizeReservedCredits(mediaGen.reservationId);

    await prisma.mediaGeneration.update({
      where: { id: mediaGen.id },
      data: {
        status: GenerationStatus.COMPLETED,
        storageUrl: resultUrl,
        creditsUsed: mediaGen.creditsReserved,
        completedAt: new Date(),
      },
    });

    if (mediaGen.conversationId) {
      await prisma.message.create({
        data: {
          conversationId: mediaGen.conversationId,
          role: MessageRole.ASSISTANT,
          content: "Your video is ready!",
          mediaUrl: resultUrl,
          mediaType: "video",
          metadata: { mediaGenerationId: mediaGen.id },
        },
      }).catch(console.error);
    }

    return NextResponse.json({ received: true, action: "completed" });
  }

  if (status === "failed" || status === "error") {
    if (mediaGen.reservationId) await refundReservedCredits(mediaGen.reservationId, "Provider webhook reported failure");

    await prisma.mediaGeneration.update({
      where: { id: mediaGen.id },
      data: { status: GenerationStatus.FAILED, errorMessage: payload.error ?? "Provider reported failure" },
    });

    return NextResponse.json({ received: true, action: "failed_refunded" });
  }

  // Processing update
  await prisma.mediaGeneration.update({
    where: { id: mediaGen.id },
    data: { status: GenerationStatus.PROCESSING },
  });

  return NextResponse.json({ received: true, action: "status_updated" });
}
