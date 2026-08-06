/**
 * Starts a photo generation that the user asked for out loud.
 *
 * On a call there is no composer sheet and no Generate button — the only
 * signal is the STT transcript, and the only place the photo can land is the
 * chat thread the call shares. So the voice path needs a way to commit to a
 * generation before the character answers, which is what lets her say "yeah,
 * sending it now" instead of talking about a photo that was never started.
 *
 * Narrow on purpose: voice can only ever kick off the default image flow.
 * Aspect ratio, style, reference picking and model choice all belong to the
 * composer, which a caller cannot reach.
 */
export interface LaunchedVisualRequest {
  readonly mediaId: string;
}

export interface VisualRequestLauncher {
  /**
   * Creates the pending generation row and its chat placeholder.
   *
   * Deliberately does NOT run the generation — that takes up to 90 seconds
   * and the caller is holding up a live phone call. The caller runs it after
   * responding.
   *
   * Returns null when the generation could not be started (no credits, media
   * disabled, provider misconfigured). A failed photo must never take the
   * call down with it.
   */
  start(input: {
    actorUserId: string;
    conversationId: string;
    scene: string;
  }): Promise<LaunchedVisualRequest | null>;
}
