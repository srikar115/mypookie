/**
 * Image reference resolver.
 *
 * Decides which prior images (if any) should be passed to the WAN image-edit
 * model as references. Two sources are considered, in this priority:
 *
 *   1. The current user's attached photo (e.g. a selfie). When present, this
 *      is ALWAYS used — the user explicitly handed us a reference and the
 *      most natural reading is "use this in the scene".
 *
 *   2. The latest assistant-generated image in the conversation. Used only
 *      when the user's wording sounds like an EDIT — "now take off…",
 *      "change the dress", "same photo but…", "with X on", etc. — or when
 *      the intent router flagged `editsExistingImage = true`.
 *
 * fal.ai accepts both fetchable HTTPS URLs AND `data:` URIs for `image_url`/
 * `image_urls`, so we can pass data URLs from chat attachments through
 * unchanged without an extra storage round-trip.
 */

import prisma from "@/lib/db";
import { MediaType, GenerationStatus } from "@prisma/client";

// Lightweight signal that the user wants to modify a prior image rather than
// generate from scratch. The intent router is the PRIMARY signal — when it
// has spoken (routerEditHint === true or false), we trust it. This regex is
// only consulted when the router didn't run / returned null.
//
// Common short words ("but", "just") were intentionally REMOVED — they fire
// on natural disagreement ("but I asked you to be in a saree, that's not a
// saree") and end up routing the message to the edit endpoint when the user
// actually wanted a fresh photo redone correctly.
const EDIT_HINT_REGEX = new RegExp(
  [
    // Explicit "same/that/this/the previous/last" photo references
    /\b(same|that|this|the\s+previous|the\s+last)\s+(photo|pic|picture|image|shot|one)\b/.source,
    // Outfit / pose swaps
    /\b(change|edit|swap|replace|remove|delete|undo)\b.{0,25}\b(outfit|dress|top|shirt|jacket|color|background|pose|hair|setting|that)\b/.source,
    // Take off / put on / remove the X
    /\b(take\s+off|put\s+on|remove|take\s+away)\s+(the|her|your|that)\s+\w+/.source,
    // "Now in / now wearing / now without"
    /\bnow\s+(in|wearing|without|with|holding)\b/.source,
    // "Make it X" / "make her X"
    /\bmake\s+(it|her|him|them)\b/.source,
    // Pose / angle / framing tweaks (always edit territory)
    /\b(different|another|new)\s+(angle|pose|outfit|background|expression|look)\b/.source,
    /\b(closer|wider|zoom\s*(in|out)?|crop|reframe)\b/.source,
    // "Without the X" / "with X on instead"
    /\bwithout\s+(the|her|your|any)\s+\w+/.source,
    /\bwith\s+\w+\s+(on\s+)?instead\b/.source,
    // "Same but X" — the user explicitly references the previous photo
    /\bsame\s+but\b/.source,
  ].join("|"),
  "i"
);

export interface ResolveImageReferencesParams {
  conversationId: string | undefined;
  companionId: string | undefined;
  /** Base64 data URL from a current-turn chat attachment, if any. */
  currentAttachmentDataUrl?: string;
  /** Cleaned scene/instruction text from the regex or router. */
  intent: string | null;
  /**
   * Router edit verdict. When `true` or `false`, the resolver TRUSTS this
   * and skips the regex entirely. Pass `undefined` (default) to fall back
   * to the regex hint.
   */
  routerEditHint?: boolean;
}

export interface ResolvedImageReferences {
  referenceImageUrls: string[];
  /** Why these references were chosen — useful for UI badges and logging. */
  source: "user-attachment" | "last-companion-photo" | "user+companion" | "none";
}

export async function resolveImageReferences(
  params: ResolveImageReferencesParams
): Promise<ResolvedImageReferences> {
  const refs: string[] = [];
  let usedAttachment = false;
  let usedCompanionPhoto = false;

  if (params.currentAttachmentDataUrl) {
    refs.push(params.currentAttachmentDataUrl);
    usedAttachment = true;
  }

  // Look up the last companion photo when the user's wording or the router
  // says "edit". When the user attached a selfie we ALSO include the latest
  // companion photo so WAN can place both subjects in the same frame.
  //
  // Router-first policy: when the router has spoken (true OR false), we
  // trust it and skip the regex entirely. The regex is only a fallback for
  // when the router was unavailable (env not configured, network failure,
  // null result) — signalled by routerEditHint === undefined.
  const looksLikeEdit =
    params.routerEditHint === true
      ? true
      : params.routerEditHint === false
      ? false
      : params.intent
      ? EDIT_HINT_REGEX.test(params.intent)
      : false;

  if (
    params.conversationId &&
    params.companionId &&
    (looksLikeEdit || usedAttachment)
  ) {
    const last = await prisma.mediaGeneration.findFirst({
      where: {
        conversationId: params.conversationId,
        companionId: params.companionId,
        type: MediaType.IMAGE,
        status: GenerationStatus.COMPLETED,
        storageUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { storageUrl: true },
    });
    if (last?.storageUrl) {
      refs.push(last.storageUrl);
      usedCompanionPhoto = true;
    }
  }

  let source: ResolvedImageReferences["source"] = "none";
  if (usedAttachment && usedCompanionPhoto) source = "user+companion";
  else if (usedAttachment) source = "user-attachment";
  else if (usedCompanionPhoto) source = "last-companion-photo";

  // WAN edit endpoint accepts 1-4 references; we never send more than 4.
  return { referenceImageUrls: refs.slice(0, 4), source };
}
