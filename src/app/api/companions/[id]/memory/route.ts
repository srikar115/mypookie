import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompanionById } from "@/lib/companions/companionService";
import { getMemory, updateMemory } from "@/lib/memory/memoryService";
import { moderateContent } from "@/lib/ai/moderationService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const companion = await getCompanionById(id, session.user.id as string);
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memory = await getMemory(id, session.user.id as string);
  return NextResponse.json({ memory });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id as string;
  const { id } = await params;

  const companion = await getCompanionById(id, userId);
  if (!companion) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { memoryMarkdown, changeReason } = await req.json();

  if (!memoryMarkdown || typeof memoryMarkdown !== "string") {
    return NextResponse.json({ error: "Invalid memory content" }, { status: 400 });
  }

  const modResult = await moderateContent(memoryMarkdown, {
    userId,
    contentType: "memory_edit",
  });

  if (!modResult.allowed) {
    return NextResponse.json(
      { error: "Memory content contains prohibited terms." },
      { status: 422 }
    );
  }

  const updated = await updateMemory(id, userId, memoryMarkdown, changeReason);
  return NextResponse.json({ memory: updated });
}
