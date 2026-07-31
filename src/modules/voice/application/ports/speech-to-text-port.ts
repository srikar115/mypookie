import "server-only";

/**
 * SpeechToTextPort — abstracts the streaming STT provider. Concrete
 * adapter (Deepgram Nova-3 today) lives inside the livekit-agent worker;
 * this port exists in the web app so the composition root can advertise
 * which provider we're currently using and hand credentials to the agent
 * without the agent needing to know how they were resolved.
 */
export interface SpeechToTextConfig {
  readonly provider: "DEEPGRAM";
  readonly modelId: string;
  readonly endpoint: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly apiKey: string;
}

export interface SpeechToTextPort {
  resolveConfig(): Promise<SpeechToTextConfig>;
}
