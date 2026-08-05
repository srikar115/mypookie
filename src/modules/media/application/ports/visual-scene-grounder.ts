import "server-only";
import type { ConversationTurn } from "./recent-conversation-reader";

/**
 * Turns "share your pic" into a scene, using what the two of them were just
 * talking about.
 *
 * The chat model already does this well when it volunteers a photo — its
 * `<<VA{scene}>>` sentinel arrives fully specified because the model can see
 * the thread. The gap is the path that never consults it: a high-confidence
 * ask is routed straight to generation by the regex classifier, in parallel
 * with the reply, precisely so the user doesn't wait. That speed is the point,
 * so the fix is to ground the scene here rather than to start waiting on the
 * chat model.
 *
 * Returning `null` means "no better scene than the one you have" — a failed
 * or empty completion must never block a generation the user is paying for.
 */
export interface VisualSceneGrounder {
  ground(input: {
    /** What the user typed, after the classifier stripped the request phrasing. */
    readonly userRequest: string;
    readonly characterName: string;
    /** Oldest first. */
    readonly recentTurns: readonly ConversationTurn[];
    readonly kind: "IMAGE" | "VIDEO";
  }): Promise<string | null>;
}
