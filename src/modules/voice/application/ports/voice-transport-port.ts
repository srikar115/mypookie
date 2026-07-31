import "server-only";

/**
 * Credentials the browser client uses to join a LiveKit room. Response of
 * {@link VoiceTransportPort.issueAccessToken}.
 */
export interface VoiceTransportGrant {
  readonly url: string;
  readonly roomName: string;
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * VoiceTransportPort — abstracts the WebRTC-transport provider (LiveKit
 * today; Daily/Twilio/self-hosted tomorrow). Both the token endpoint and
 * the webhook signature check land here so we can swap providers with one
 * PR by pointing the composition root at a different adapter.
 */
export interface VoiceTransportPort {
  issueAccessToken(input: {
    roomName: string;
    identity: string;
    displayName: string;
    metadata?: Record<string, unknown>;
    ttlSeconds?: number;
  }): Promise<VoiceTransportGrant>;

  /**
   * Verifies a webhook payload against the shared signing secret. Returns
   * the parsed body on success; throws on signature mismatch so route
   * handlers get a single boolean-ish branch to reason about.
   */
  verifyWebhook(input: {
    rawBody: string;
    authorizationHeader: string | null;
  }): Promise<unknown>;

  /**
   * Force-closes a room (used to hang up server-side when the credit
   * ticker exhausts the user's balance, or when the daily cap trips).
   * No-op if the room has already ended.
   */
  endRoom(roomName: string): Promise<void>;
}
