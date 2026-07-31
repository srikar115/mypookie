/**
 * VoiceTurnDto — one completed turn pair (user STT + assistant LLM reply)
 * as reported by the LiveKit agent worker to
 * `POST /api/webhooks/voice-agent/turn`.
 *
 * The route hands this to {@link RecordVoiceTurnUseCase} which persists
 * both messages (`source=VOICE`) and schedules memory ingestion.
 */
export interface VoiceTurnDto {
  readonly callSessionId: string;
  readonly conversationId: string;
  readonly userTranscript: string;
  readonly assistantContent: string;
  readonly userAudioR2Key?: string | null;
  readonly assistantAudioR2Key?: string | null;
  readonly ttsMarkupTags?: readonly string[];
  readonly latencyMs?: number | null;
  readonly modelId?: string | null;
}
