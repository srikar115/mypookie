import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getVideoJobStatus } from "@/lib/ai/providerRouter";
import { finalizeReservedCredits, refundReservedCredits } from "@/lib/billing/creditService";
import { GenerationStatus, MessageRole, MediaType } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const mediaGen = await prisma.mediaGeneration.findFirst({
    where: { id, userId },
  });
  if (!mediaGen) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // For completed/failed jobs return cached status
  if (mediaGen.status === GenerationStatus.COMPLETED || mediaGen.status === GenerationStatus.FAILED) {
    return NextResponse.json({
      id: mediaGen.id,
      status: mediaGen.status.toLowerCase(),
      resultUrl: mediaGen.storageUrl,
      creditsUsed: mediaGen.creditsUsed,
      completedAt: mediaGen.completedAt,
      errorMessage: mediaGen.errorMessage,
    });
  }

  // Poll provider for latest status
  if (mediaGen.providerJobId) {
    const meta = mediaGen.metadata as Record<string, string> | null;
    const providerSlug = meta?.provider ?? "fal";
    const overrideUrls = meta?.statusUrl
      ? { statusUrl: meta.statusUrl, responseUrl: meta.responseUrl }
      : undefined;
    try {
      const statusResult = await getVideoJobStatus(mediaGen.providerJobId, providerSlug, overrideUrls);

      if (statusResult.status === "completed" && statusResult.resultUrl) {
        // Finalize credits and update record
        if (mediaGen.reservationId) await finalizeReservedCredits(mediaGen.reservationId);

        const updated = await prisma.mediaGeneration.update({
          where: { id: mediaGen.id },
          data: {
            status: GenerationStatus.COMPLETED,
            storageUrl: statusResult.resultUrl,
            creditsUsed: mediaGen.creditsReserved,
            completedAt: new Date(),
          },
        });

        // Save assistant message if conversation exists
        if (mediaGen.conversationId) {
          const conv = await prisma.conversation.findFirst({ where: { id: mediaGen.conversationId, userId } });
          if (conv) {
            await prisma.message.create({
              data: {
                conversationId: mediaGen.conversationId,
                role: MessageRole.ASSISTANT,
                content: "Your video is ready! Here it is.",
                mediaUrl: statusResult.resultUrl,
                mediaType: "video",
                metadata: { mediaGenerationId: mediaGen.id },
              },
            });
            await prisma.conversation.update({
              where: { id: mediaGen.conversationId },
              data: { lastMessageAt: new Date() },
            });
          }
        }

        return NextResponse.json({
          id: updated.id,
          status: "completed",
          resultUrl: updated.storageUrl,
          creditsUsed: updated.creditsUsed,
          completedAt: updated.completedAt,
        });
      }

      if (statusResult.status === "failed") {
        if (mediaGen.reservationId) await refundReservedCredits(mediaGen.reservationId, "Video generation failed");
        const updated = await prisma.mediaGeneration.update({
          where: { id: mediaGen.id },
          data: { status: GenerationStatus.FAILED, errorMessage: "Provider reported failure" },
        });
        return NextResponse.json({
          id: updated.id,
          status: "failed",
          errorMessage: updated.errorMessage,
        });
      }
    } catch (err) {
      console.error("[media/jobs] polling error:", err);
    }
  }

  return NextResponse.json({
    id: mediaGen.id,
    status: mediaGen.status.toLowerCase(),
    resultUrl: mediaGen.storageUrl,
  });
}
