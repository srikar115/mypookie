import "server-only";
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from "livekit-server-sdk";
import type {
  VoiceTransportGrant,
  VoiceTransportPort,
} from "../application/ports/voice-transport-port";
import { VoiceTransportError } from "../domain/errors";

/**
 * LiveKit adapter for {@link VoiceTransportPort}. Wraps three SDK bits:
 *
 *   - AccessToken: mints join tokens for the browser client.
 *   - RoomServiceClient: server-side room control (currently just endRoom).
 *   - WebhookReceiver: verifies signed webhook callbacks from LiveKit
 *     (room_finished, participant_disconnected, etc.).
 *
 * Kept in one class so the composition root doesn't need to know about
 * three separate SDK primitives.
 */
export class LivekitTransportAdapter implements VoiceTransportPort {
  private readonly roomService: RoomServiceClient;
  private readonly webhookReceiver: WebhookReceiver;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {
    const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
  }

  async issueAccessToken(input: {
    roomName: string;
    identity: string;
    displayName: string;
    metadata?: Record<string, unknown>;
    ttlSeconds?: number;
  }): Promise<VoiceTransportGrant> {
    const ttl = input.ttlSeconds ?? 60 * 15;
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      name: input.displayName,
      ttl,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    });
    at.addGrant({
      roomJoin: true,
      room: input.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    let token: string;
    try {
      token = await at.toJwt();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new VoiceTransportError(`Failed to mint LiveKit token: ${msg}`);
    }

    return {
      url: this.url,
      roomName: input.roomName,
      token,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async verifyWebhook(input: {
    rawBody: string;
    authorizationHeader: string | null;
  }): Promise<unknown> {
    if (!input.authorizationHeader) {
      throw new VoiceTransportError("Missing Authorization header on webhook.");
    }
    try {
      return await this.webhookReceiver.receive(
        input.rawBody,
        input.authorizationHeader,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new VoiceTransportError(`Webhook signature invalid: ${msg}`);
    }
  }

  async endRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName);
    } catch (e) {
      // LiveKit throws when the room doesn't exist. That's fine — it means
      // the participant already hung up and the room auto-cleaned. Suppress
      // 404s but surface auth/network failures.
      const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
      if (msg.includes("not found") || msg.includes("does not exist")) return;
      throw new VoiceTransportError(`Failed to end room ${roomName}: ${msg}`);
    }
  }
}
