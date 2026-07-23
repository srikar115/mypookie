import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  readMediaSettings,
  writeMediaSettings,
} from "@/lib/chat/conversationMediaSettings";

const patchSchema = z.object({
  autoPics: z.enum(["off", "ask", "on"]).optional(),
  autoVideos: z.enum(["off", "ask", "on"]).optional(),
  defaultImageAspect: z.enum(["portrait", "square", "landscape"]).optional(),
  defaultImageStyle: z.string().max(80).optional(),
  defaultVideoAspect: z.enum(["portrait", "square", "landscape"]).optional(),
  defaultVideoDuration: z
    .union([z.literal(5), z.literal(8), z.literal(10), z.enum(["5", "8", "10"])])
    .transform((v) => (typeof v === "string" ? (Number(v) as 5 | 8 | 10) : v))
    .optional(),
  defaultVideoMode: z.enum(["from-last-photo", "text-only"]).optional(),
});

async function loadConversationForUser(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { companion: { select: { metadata: true } } },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId } = await params;
  const conv = await loadConversationForUser(conversationId, session.user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const settings = readMediaSettings(conv.metadata, conv.companion.metadata);
  return NextResponse.json({ settings });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.format() }, { status: 422 });
  }

  const conv = await loadConversationForUser(conversationId, session.user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const merged = writeMediaSettings(conv.metadata, parsed.data);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { metadata: merged as Prisma.InputJsonValue },
  });

  const settings = readMediaSettings(
    merged as Prisma.JsonValue,
    conv.companion.metadata
  );
  return NextResponse.json({ settings });
}
