import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createCompanion, getCompanionsByUser, generateCompanionAvatar } from "@/lib/companions/companionService";
import { moderateContent } from "@/lib/ai/moderationService";

const companionSchema = z.object({
  companionType: z.string().min(1),
  genderPresentation: z.string().min(1),
  ageStyle: z.string().min(1),
  name: z.string().min(1).max(60),
  relationshipStyle: z.string().min(1),
  greetingStyle: z.string().min(1),
  personalityPreset: z.string().optional().default(""),
  personalityTraits: z.record(z.string(), z.number()).default({}),
  visualStyle: z.string().min(1),
  hairColor: z.string().min(1),
  hairstyle: z.string().min(1),
  eyeColor: z.string().min(1),
  buildStyle: z.string().min(1),
  fashionStyle: z.string().min(1),
  overallVibe: z.string().min(1),
  customAppearanceNotes: z.string().optional().default(""),
  conversationTone: z.string().min(1),
  intimacyLevel: z.string().min(1),
  memoryPreferences: z.array(z.string()).default([]),
  // Media defaults — written to Companion.metadata.defaultMediaSettings and
  // used to seed each new conversation's autoPics/aspect/source.
  defaultAutoPics: z.enum(["off", "ask", "on"]).default("ask"),
  defaultImageAspect: z.enum(["portrait", "square", "landscape"]).default("portrait"),
  defaultVideoMode: z.enum(["from-last-photo", "text-only"]).default("from-last-photo"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id as string;

  try {
    const body = await req.json();
    const parsed = companionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid companion data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Moderate all text fields
    const textToModerate = [
      data.name,
      data.companionType,
      data.ageStyle,
      data.customAppearanceNotes,
      data.buildStyle,
      data.overallVibe,
    ]
      .filter(Boolean)
      .join(" ");

    const modResult = await moderateContent(textToModerate, {
      userId: userId,
      contentType: "companion_creation",
    });

    if (!modResult.allowed) {
      return NextResponse.json(
        {
          error:
            "Your companion configuration contains prohibited content. Please review and modify your selections.",
        },
        { status: 422 }
      );
    }

    const { companion, conversation } = await createCompanion({
      userId,
      name: data.name,
      companionType: data.companionType,
      genderPresentation: data.genderPresentation,
      ageStyle: data.ageStyle,
      relationshipStyle: data.relationshipStyle,
      greetingStyle: data.greetingStyle,
      personalityPreset: data.personalityPreset ?? null,
      personalityTraits: data.personalityTraits as Record<string, number>,
      visualStyle: data.visualStyle,
      hairColor: data.hairColor,
      hairstyle: data.hairstyle,
      eyeColor: data.eyeColor,
      buildStyle: data.buildStyle,
      fashionStyle: data.fashionStyle,
      overallVibe: data.overallVibe,
      customAppearanceNotes: data.customAppearanceNotes ?? null,
      conversationTone: data.conversationTone,
      intimacyLevel: data.intimacyLevel,
      memoryPreferences: data.memoryPreferences,
      defaultMediaSettings: {
        autoPics: data.defaultAutoPics,
        defaultImageAspect: data.defaultImageAspect,
        defaultVideoMode: data.defaultVideoMode,
      },
    });

    // Generate avatar in background — don't block response
    generateCompanionAvatar(companion.id).catch(() => {});

    return NextResponse.json({ companion, conversation }, { status: 201 });
  } catch (error) {
    console.error("[COMPANIONS POST]", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const companions = await getCompanionsByUser(session.user.id as string);
    return NextResponse.json({ companions });
  } catch (error) {
    console.error("[COMPANIONS GET]", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
