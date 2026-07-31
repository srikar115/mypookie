import "server-only";

/**
 * TextToSpeechPort — abstracts the streaming TTS provider. See sibling
 * {@link SpeechToTextPort} for rationale.
 */
export interface TextToSpeechConfig {
  readonly provider: "CARTESIA";
  readonly modelId: string;
  readonly endpoint: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly apiKey: string;
}

export interface TextToSpeechPort {
  resolveConfig(): Promise<TextToSpeechConfig>;
}
