import "server-only";
import type { MediaGenerationRepository } from "../ports/media-generation-repository";
import type { MediaImageGenerator } from "../ports/media-image-generator";
import type { ReferenceImageResolver } from "../ports/reference-image-resolver";
import type { MediaModelResolver } from "../ports/media-model-resolver";
import type { CreditGateway } from "../ports/credit-gateway";
import type { CompanionVisualProfileReader } from "../ports/companion-visual-profile-reader";
import type { RecentConversationReader } from "../ports/recent-conversation-reader";
import type { VisualSceneGrounder } from "../ports/visual-scene-grounder";
import type { GeneratedMediaRecorder } from "../ports/generated-media-recorder";
import type { RunMediaInput } from "../dto/media-generation.dto";
import { MediaGenerationNotFoundError, MediaGenerationAccessDeniedError } from "../../domain/media-generation";
import { isVagueScene, SCENE_CONTEXT_TURNS } from "../../domain/scene";
import {
  resolveImageModelSlug,
  resolveModelFamilySlug,
  MEDIA_COSTS,
  DEFAULT_VIDEO_RESOLUTION,
  DEFAULT_VIDEO_DURATION,
} from "@/config/media";
import type { CompanionVisualProfile } from "../ports/companion-visual-profile-reader";

/**
 * RunMediaGenerationUseCase
 *
 * The full async pipeline:
 *   1. Load media generation row (PENDING)
 *   2. Transition to RUNNING
 *   3. Resolve model slug (user pref → admin default → fallback)
 *   4. Resolve reference image (composer pick → last chat image → avatar)
 *   5. Sibling-swap: edit model + no reference → text-to-image sibling
 *   6. Ground a contentless scene in the conversation ("share your pic")
 *   7. Build companion-consistent prompt
 *   8. Call fal.ai queue (submit → poll → fetch result)
 *   9. Upload result to R2
 *  10. Transition to COMPLETED + debit credits
 *  11. On failure: transition to FAILED + refund (reservation pattern)
 *
 * This use case is called by POST /api/media/run (fire-and-wait, keepalive).
 */
export class RunMediaGenerationUseCase {
  constructor(
    private readonly mediaRepo: MediaGenerationRepository,
    private readonly generator: MediaImageGenerator,
    private readonly refResolver: ReferenceImageResolver,
    private readonly modelResolver: MediaModelResolver,
    private readonly credits: CreditGateway,
    private readonly visualProfile: CompanionVisualProfileReader,
    private readonly promptBuilder: CompanionVisualPromptBuilder,
    private readonly conversation: RecentConversationReader,
    private readonly sceneGrounder: VisualSceneGrounder,
    private readonly recorder: GeneratedMediaRecorder,
  ) {}

  async execute(input: RunMediaInput): Promise<void> {
    const gen = await this.mediaRepo.findById(input.mediaId);
    if (!gen) throw new MediaGenerationNotFoundError(input.mediaId);
    if (gen.userId !== input.actorUserId) throw new MediaGenerationAccessDeniedError();
    if (gen.status !== "PENDING") {
      // Already running or done (duplicate call). Safe no-op.
      return;
    }

    // Transition to RUNNING.
    await this.mediaRepo.update({ id: gen.id, status: "RUNNING" });

    const meta = gen.metadata;
    const costCredits = gen.kind === "VIDEO" ? MEDIA_COSTS.VIDEO : MEDIA_COSTS.IMAGE;

    // Debit credits at start of run (reservation pattern — refund on failure).
    await this.credits.debit(
      gen.userId,
      costCredits,
      `${gen.kind.toLowerCase()} generation`,
    );

    try {
      // Resolve reference image first — the endpoint depends on it.
      const referenceUrl = await this.refResolver.resolve({
        referenceMediaId: meta.referenceMediaId ?? null,
        userId: gen.userId,
        characterId: gen.characterId,
        conversationId: gen.conversationId,
      });
      const hasReference = referenceUrl !== null;

      // An explicit choice from the composer wins. It names a family, not an
      // endpoint, so the edit/text-to-* decision still follows the reference —
      // picking "Wan 2.7" with no reference runs text-to-image, not a doomed
      // edit call. An unrecognised id falls through to the configured default
      // rather than being trusted as a slug.
      const chosenSlug = meta.modelFamilyId
        ? resolveModelFamilySlug(meta.modelFamilyId, gen.kind, hasReference)
        : null;

      const finalSlug =
        chosenSlug ??
        (await (async () => {
          const baseSlug = await this.modelResolver.resolve(gen.kind, gen.userId);
          return gen.kind === "IMAGE"
            ? resolveImageModelSlug(baseSlug, hasReference)
            : baseSlug;
        })());

      // Load companion visual profile for prompt enrichment.
      const profile = await this.visualProfile.read(gen.characterId);

      const scene = await this.resolveScene({
        requested: gen.prompt,
        promptIsFinal: meta.promptIsFinal ?? false,
        conversationId: gen.conversationId,
        characterName: profile?.name ?? "her",
        kind: gen.kind,
      });

      // Build final prompt. `promptIsFinal` requests are sent as written.
      const finalPrompt = this.promptBuilder.build({
        userScene: scene,
        profile,
        style: meta.style ?? null,
        hasReference,
        promptIsFinal: meta.promptIsFinal ?? false,
      });

      // Run generation.
      const result = await this.generator.generate({
        modelSlug: finalSlug,
        prompt: finalPrompt,
        kind: gen.kind,
        aspectRatio: meta.aspectRatio ?? (gen.kind === "VIDEO" ? "9:16" : "1:1"),
        style: meta.style ?? null,
        referenceImageUrl: referenceUrl,
        seed: meta.seed ?? null,
        ...(gen.kind === "VIDEO"
          ? {
              duration: meta.duration ?? DEFAULT_VIDEO_DURATION,
              resolution: meta.resolution ?? DEFAULT_VIDEO_RESOLUTION,
            }
          : {}),
      });

      // Complete.
      await this.mediaRepo.update({
        id: gen.id,
        status: "COMPLETED",
        finalPrompt,
        modelSlug: result.finalModelSlug,
        providerRequestId: result.providerRequestId,
        storageKey: result.storageKey,
        storageUrl: result.storageUrl,
        metadata: {
          ...meta,
          seed: result.seed ?? undefined,
          finalModelSlug: result.finalModelSlug,
        },
        completedAt: new Date(),
      });

      // Remember the photo. Deliberately after the row is COMPLETED and
      // deliberately swallowing its own errors: the asset exists, the user has
      // been charged, and the bubble is about to render. A memory write
      // failing is not a reason to fail the generation or refund it.
      try {
        await this.recorder.record({
          userId: gen.userId,
          characterId: gen.characterId,
          characterName: profile?.name ?? "She",
          conversationId: gen.conversationId,
          mediaGenerationId: gen.id,
          kind: gen.kind,
          scene,
          offStreamRequest: meta.offStreamRequest ?? null,
        });
      } catch (e) {
        console.warn("[media] recording generation to memory failed", e);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Transition to FAILED.
      await this.mediaRepo.update({
        id: gen.id,
        status: "FAILED",
        errorMessage,
      }).catch(() => {});

      // Refund credits.
      await this.credits.refund(
        gen.userId,
        costCredits,
        `refund: ${gen.kind.toLowerCase()} generation failed`,
      ).catch(() => {});

      throw e;
    }
  }

  /**
   * "share your pic" names nothing to photograph. Sent through as-is it
   * yields a generic portrait that ignores the conversation it came out of —
   * she says she's eating an apple, the user asks for a picture, and the
   * photo shows her posing against a wall.
   *
   * Only contentless requests are rewritten. A scene the user described, or
   * one the chat model already specified in its `<<VA>>` sentinel, is left
   * exactly as it is: those callers know more than this does. `promptIsFinal`
   * requests (mode pill, composer) are never touched at all — the user read
   * that text and pressed Generate on it.
   */
  private async resolveScene(input: {
    requested: string;
    promptIsFinal: boolean;
    conversationId: string;
    characterName: string;
    kind: "IMAGE" | "VIDEO";
  }): Promise<string> {
    if (input.promptIsFinal) return input.requested;
    if (!isVagueScene(input.requested)) return input.requested;

    const recentTurns = await this.conversation.listRecentTurns(
      input.conversationId,
      SCENE_CONTEXT_TURNS,
    );
    const grounded = await this.sceneGrounder.ground({
      userRequest: input.requested,
      characterName: input.characterName,
      recentTurns,
      kind: input.kind,
    });

    return grounded ?? input.requested;
  }
}

/**
 * Interface for the companion visual prompt builder (injected by composition).
 * Lives here as a co-located dependency interface — not a separate port file
 * because it is used only by this use case.
 */
export interface CompanionVisualPromptBuilder {
  build(input: {
    userScene: string;
    profile: CompanionVisualProfile | null;
    style: string | null;
    /** Whether a reference image was resolved — it carries her likeness. */
    hasReference: boolean;
    /**
     * The caller already settled the prompt (mode pill, or a composer preview
     * the user could read and edit), so nothing may be added to it.
     */
    promptIsFinal: boolean;
  }): string;
}
