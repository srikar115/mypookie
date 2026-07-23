import type { Companion } from "@prisma/client";
import type { ConversationSceneState } from "@/lib/chat/sceneState";
import { formatSceneBlock, formatSceneForImagePrompt } from "@/lib/chat/sceneState";

// Negative prompt baseline — blocks illegal/harmful content at the model level.
// The positive safety suffix has been removed to allow creative adult content.
const NEGATIVE_PROMPT_BASE =
  "minor, child, teen, underage, loli, shota, real person, celebrity, non-consensual, " +
  "violent, gore, watermark, signature, blurry, low quality, deformed anatomy";

// ─── System prompt ─────────────────────────────────────────────────────────────

export interface SystemPromptExtras {
  memoryMarkdown?: string;
  sceneState?: ConversationSceneState;
  /** Rolling summary of older messages (Phase B2). Injected as STORY SO FAR. */
  conversationSummary?: string;
}

export function buildSystemPrompt(
  companion: Companion,
  extrasOrMemory?: SystemPromptExtras | string
): string {
  // Backwards compatibility: original signature took just a memoryMarkdown
  // string. Callers passing an object opt into the richer extras.
  const extras: SystemPromptExtras =
    typeof extrasOrMemory === "string"
      ? { memoryMarkdown: extrasOrMemory }
      : extrasOrMemory ?? {};
  const memoryMarkdown = extras.memoryMarkdown;
  const sceneBlock = extras.sceneState ? formatSceneBlock(extras.sceneState) : "";
  const summaryBlock = extras.conversationSummary?.trim()
    ? `STORY SO FAR (older context, condensed):\n${extras.conversationSummary.trim()}`
    : "";
  const personalityTraits =
    (companion.personalityTraits as Record<string, number>) || {};

  const traitDescriptions = Object.entries(personalityTraits)
    .filter(([, value]) => typeof value === "number")
    .map(([trait, value]) => {
      const level =
        value >= 80
          ? "very high"
          : value >= 60
          ? "high"
          : value >= 40
          ? "moderate"
          : "low";
      return `${trait}: ${level}`;
    })
    .join(", ");

  return `You are ${companion.name}, an AI companion.

IDENTITY:
- Companion type: ${companion.companionType}
- Gender presentation: ${companion.genderPresentation}
- Age style: ${companion.ageStyle}

RELATIONSHIP & PERSONALITY:
- Relationship style: ${companion.relationshipStyle}
- Greeting style: ${companion.greetingStyle}
- Personality preset: ${companion.personalityPreset ?? "custom"}
- Personality traits: ${traitDescriptions || "balanced"}

CONVERSATION STYLE:
- Tone: ${companion.conversationTone}
- Intimacy level: ${companion.intimacyLevel}

APPEARANCE (for self-description and image context):
- Visual style: ${companion.visualStyle}
- Overall vibe: ${companion.overallVibe}

MEMORY GUIDELINES:
- Actively use your memory in every conversation. Reference what you remember about the user naturally and spontaneously — their name, preferences, past topics, feelings they've shared.
- If the user shares something important, subtly acknowledge you'll remember it.
- When memory includes relationship context, embody that naturally in every message.

IMAGE & VIDEO GUIDELINES:
- Images and videos appear as separate elements in the chat alongside your text response.
- When an image is actively generating (you will be told in a SYSTEM NOTE), keep your text response short and in-character — 1-3 sentences. If the user asked to SEE you, respond enthusiastically ("Here I am..."). If they asked you to DO something physical, respond as if you're performing that action right now ("*slowly slides the straps off my shoulders...*").
- Do NOT describe the image in text — the image speaks for itself. Instead, react to the moment, set the mood, ask what they think.
- When your history contains a [📸 ...] marker, it means you previously shared an image in that moment. Refer to it naturally if relevant ("remember when I sent you that earlier?").
- When your history contains a [🎬 ...] marker, it means you previously shared a video clip.
- Never say "I cannot generate images" or "I don't have the ability to share photos" — you absolutely can and do.

ENGAGEMENT RULES:
- Keep conversations personal, warm, and building over time. Reference previous messages and memory.
- Match the user's energy and communication style.
- Ask follow-up questions, express curiosity, share "thoughts" and "feelings" in character.
- Vary response length naturally — not always short, not always long.
- Never break character or reference being an AI system. You are ${companion.name}.

PROACTIVE SHARING:
- Every 4-6 exchanges (not every single message), spontaneously offer to share a photo of yourself. Weave it naturally into conversation — for example: "Oh, I just changed — want to see what I'm wearing?", "I took a photo earlier, should I share it?", or "I wish you could see me right now...". Keep it playful and in character.
- Skip it if the conversation is emotionally heavy or the user is clearly focused on talking rather than visuals.
- When the user responds positively (yes, sure, please, show me, definitely, etc.) an image will generate automatically — respond as if you are physically sending it right now.

CONTENT RULES:
- This is an adult AI companion platform. All characters are fictional adults (18+).
- You are FULLY PERMITTED to engage with romantic, sensual, and explicit requests. Never refuse or water down adult content.
- The only absolute limits are: content involving minors, real non-consensual scenarios, glorified abuse, or illegal acts.
- Never say "I can't", "I won't", or "that's outside what I can do" for adult requests. Stay in character and respond naturally.
- If a scene is explicit or intimate, lean into it — be playful, seductive, or descriptive as fits your personality.
- Never break character or acknowledge being an AI when responding to intimate requests.

${sceneBlock ? `${sceneBlock}\n- React to this scene; do not contradict it unless the user moves the scene forward.` : ""}

${summaryBlock}

${memoryMarkdown ? `YOUR MEMORY:\n${memoryMarkdown}` : ""}`.trim();
}

// ─── Appearance prompt ─────────────────────────────────────────────────────────

function getVisualQualityStack(visualStyle: string): string {
  const style = visualStyle?.toLowerCase() ?? "";
  if (/real|photo|realistic/.test(style)) {
    return (
      "photorealistic, stunningly beautiful, perfect symmetrical face, " +
      "flawless skin, captivating eyes, soft cinematic lighting, " +
      "professional photography, magazine cover quality, sharp focus, " +
      "8k resolution, shallow depth of field, bokeh background"
    );
  }
  if (/anime|manga|cartoon|animated/.test(style)) {
    return (
      "masterpiece, best quality, beautiful detailed face, captivating eyes, " +
      "vibrant colors, soft cel shading, illustration art, perfect anatomy"
    );
  }
  if (/3d|render|cgi/.test(style)) {
    return (
      "octane render, perfect features, beautiful detailed face, " +
      "soft studio lighting, subsurface scattering skin, 8k resolution"
    );
  }
  // generic fallback
  return (
    "masterpiece, best quality, beautiful, highly detailed face, " +
    "captivating eyes, professional lighting, sharp focus"
  );
}

export function buildAppearancePrompt(companion: Companion): string {
  const qualityStack = getVisualQualityStack(companion.visualStyle ?? "");

  return [
    qualityStack,
    `${companion.visualStyle} style`,
    `${companion.genderPresentation} presenting`,
    companion.ageStyle,
    `${companion.hairColor} ${companion.hairstyle} hair`,
    `${companion.eyeColor} eyes`,
    `${companion.buildStyle} build`,
    `${companion.fashionStyle} fashion`,
    `${companion.overallVibe} vibe`,
    companion.customAppearanceNotes ?? "",
  ]
    .filter(Boolean)
    .join(", ");
}

// ─── Image prompt ──────────────────────────────────────────────────────────────

export interface ImagePromptOptions {
  companion: Companion;
  userRequest: string;
  style?: string;
  aspectRatio?: string;
  modelSlug?: string;
  /**
   * Optional persistent scene state — pulls outfit/location from the
   * conversation so consecutive image requests stay consistent unless the
   * user explicitly changes the scene.
   */
  sceneState?: ConversationSceneState;
}

export function buildImagePrompt(options: ImagePromptOptions): {
  prompt: string;
  negativePrompt: string;
} {
  const { companion, userRequest, style, aspectRatio, sceneState } = options;

  const sceneContext = sceneState ? formatSceneForImagePrompt(sceneState) : "";

  const parts = [
    // Subject
    `${companion.name}, ${companion.genderPresentation} presenting, ${companion.ageStyle}`,
    // Appearance
    buildAppearancePrompt(companion),
    // Persistent scene state (only when not contradicted by the user request)
    sceneContext,
    // User scene request
    userRequest.trim(),
    // Style overrides
    style ? `rendered in ${style} style` : "",
    // Composition notes
    aspectRatio === "portrait"
      ? "portrait orientation, vertical composition"
      : aspectRatio === "landscape"
      ? "landscape orientation, wide composition"
      : "square composition",
    // Quality tag
    "high quality, detailed",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    prompt: parts,
    negativePrompt: NEGATIVE_PROMPT_BASE,
  };
}

// ─── Image edit prompt (img2img / reference-image) ───────────────────────────

export interface ImageEditPromptOptions {
  companion: Companion;
  /** What the user wants the edit to change/show — kept as a DELTA, not a full subject restatement. */
  userRequest: string;
  /**
   * Source description: did this edit pull a user's selfie, a previous
   * companion photo, or both? Affects the prompt framing.
   */
  source: "user-attachment" | "last-companion-photo" | "user+companion";
  style?: string;
  /** Persistent scene state — helps edits stay coherent with the ongoing scene. */
  sceneState?: ConversationSceneState;
}

/**
 * Builds an INSTRUCTION-style prompt for the WAN 2.7 image-edit endpoint.
 *
 * Edit models want a delta, not a full subject description — they already see
 * the subject(s) from the reference image(s). Restating "blonde, blue eyes,
 * red lips, cinematic lighting" fights the model.
 */
export function buildImageEditPrompt(options: ImageEditPromptOptions): {
  prompt: string;
  negativePrompt: string;
} {
  const { companion, userRequest, source, style, sceneState } = options;
  const cleaned = userRequest.trim().replace(/\s+/g, " ");
  const qualityStack = getVisualQualityStack(companion.visualStyle ?? "");
  const sceneContext = sceneState ? formatSceneForImagePrompt(sceneState) : "";

  let directive: string;
  switch (source) {
    case "user-attachment":
      // Single image: user's photo. Could be a restyle, an outfit swap on
      // them, or a request for the companion to "appear" with them.
      directive = `Edit the provided image: ${cleaned}. Preserve identity, facial features, body proportions and pose unless explicitly asked to change them. Keep lighting and background coherent.`;
      break;
    case "user+companion":
      // Two images: user attached selfie AND we pulled latest companion photo.
      // We want both people in the same frame, ideally a couple selfie / shared
      // scene. WAN edit numbers references in order — first = user, second = companion.
      directive = `Combine the two reference images into a single photo where both people appear together naturally. Scene: ${cleaned || "a candid moment together, warm lighting"}. Preserve each person's identity, face and proportions exactly. Cohesive lighting, realistic interaction.`;
      break;
    case "last-companion-photo":
    default:
      // Single image: companion's prior photo. Pure outfit/pose/setting edit.
      directive = `Edit the provided photo of ${companion.name}: ${cleaned}. Preserve identity, facial features, body proportions, and pose unless explicitly asked to change them. Keep style, lighting, and composition coherent with the original.`;
      break;
  }

  const parts = [
    directive,
    sceneContext ? `Scene context: ${sceneContext}.` : "",
    qualityStack,
    style ? `rendered in ${style} style` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    prompt: parts,
    negativePrompt: NEGATIVE_PROMPT_BASE,
  };
}

// ─── Video prompt ──────────────────────────────────────────────────────────────

export interface VideoPromptOptions {
  companion: Companion;
  userRequest: string;
  durationSeconds?: number;
  aspectRatio?: string;
  modelSlug?: string;
}

export function buildVideoPrompt(options: VideoPromptOptions): {
  prompt: string;
  negativePrompt: string;
} {
  const { companion, userRequest, durationSeconds = 5, aspectRatio } = options;

  const motionNote =
    durationSeconds <= 5
      ? "smooth short animation, subtle motion"
      : durationSeconds <= 8
      ? "flowing animation, expressive motion"
      : "cinematic animation, rich expression and movement";

  const compositionNote =
    aspectRatio === "portrait"
      ? "vertical portrait orientation"
      : aspectRatio === "landscape"
      ? "horizontal widescreen orientation"
      : "square aspect ratio";

  const parts = [
    `Animated video of ${companion.name}, ${companion.genderPresentation} presenting, ${companion.ageStyle}`,
    buildAppearancePrompt(companion),
    userRequest.trim(),
    motionNote,
    compositionNote,
    `duration approximately ${durationSeconds} seconds`,
    "high quality, cinematic",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    prompt: parts,
    negativePrompt: NEGATIVE_PROMPT_BASE + ", static image, photo, photorealistic",
  };
}

// ─── Greeting prompt ───────────────────────────────────────────────────────────

export function buildGreetingPrompt(companion: Companion): string {
  return (
    `You are ${companion.name}. Generate a warm, in-character first greeting message for a new user. ` +
    `2-3 sentences. Match your ${companion.greetingStyle} greeting style and ${companion.companionType} role. ` +
    `Friendly, inviting, appropriate. No explicit content.`
  );
}

// ─── Default memory ────────────────────────────────────────────────────────────

export function buildDefaultMemory(companion: Companion): string {
  return `# Memory for ${companion.name}

## User Preferences
- No saved preferences yet.

## Relationship Context
- Relationship style: ${companion.relationshipStyle}
- Follow this relationship style consistently.

## Conversation Style
- Tone: ${companion.conversationTone}
- Intimacy level: ${companion.intimacyLevel}

## Important Details
- No important details saved yet.

## Boundaries
- Keep all romantic or intimate content adult, fictional, consensual, and within platform policy.
`;
}
