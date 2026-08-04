import "server-only";
import {
  AccessToken,
  AgentDispatchClient,
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
  private readonly dispatchClient: AgentDispatchClient;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    /**
     * When set, explicit-dispatch is enabled: after a token is minted,
     * we call `AgentDispatchClient.createDispatch(roomName, agentName)`
     * so LiveKit routes the job to a worker registered under this same
     * name — instead of round-robining across all registered workers,
     * which fails when a stale registration lingers after a hard crash.
     *
     * The matching worker lives in `E:\mypookie-livekit\src\index.ts`;
     * its `AGENT_NAME` constant MUST equal this value or dispatches
     * silently drop.
     *
     * Falsy value = fall back to LiveKit's auto-dispatch mode. Left as
     * an escape hatch for platforms that pre-configure agents via the
     * dashboard.
     */
    private readonly agentName?: string,
  ) {
    const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
    this.dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
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

    // Explicit dispatch — request a specific named agent be attached to
    // this room. LiveKit accepts dispatches for rooms that don't exist
    // yet: it pre-registers the request and dispatches the job the
    // moment the browser creates the room by joining. If dispatch
    // fails (misconfigured name, provider outage) we log and continue
    // — the token itself is valid, so worst-case the call falls back
    // to whatever auto-dispatch behavior the project has configured.
    if (this.agentName) {
      try {
        await this.dispatchClient.createDispatch(
          input.roomName,
          this.agentName,
          input.metadata
            ? { metadata: JSON.stringify(input.metadata) }
            : undefined,
        );
      } catch (e) {
        console.warn(
          `[livekit.dispatch] createDispatch(room=${input.roomName}, agent=${this.agentName}) failed — falling back to auto-dispatch:`,
          e instanceof Error ? e.message : String(e),
        );
      }
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
