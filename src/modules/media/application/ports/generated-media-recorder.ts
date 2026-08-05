import "server-only";

/**
 * Tells the rest of the app that a photo was taken and what was in it.
 *
 * Without this, generated media is invisible outside its own table: the
 * assistant message carrying it has empty content, so a week later neither
 * chat nor a voice call can answer "remember that photo you sent me?". The
 * scene is known at generation time and costs nothing to keep.
 *
 * Implemented against the memory module. Declared here as a port so the run
 * use case stays free of that dependency and can be tested with a spy.
 */
export interface GeneratedMediaRecorder {
  record(input: {
    readonly userId: string;
    readonly characterId: string;
    readonly characterName: string;
    readonly conversationId: string;
    readonly mediaGenerationId: string;
    readonly kind: "IMAGE" | "VIDEO";
    /** The scene actually rendered, after grounding. */
    readonly scene: string;
    /**
     * The user's words when the request bypassed the chat stream (mode pill,
     * Edit button). Null when the stream already ingested the turn — passing
     * it anyway would extract the same facts twice and double the relationship
     * counters.
     */
    readonly offStreamRequest: string | null;
  }): Promise<void>;
}
