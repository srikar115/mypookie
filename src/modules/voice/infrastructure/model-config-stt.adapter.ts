import "server-only";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type {
  SpeechToTextConfig,
  SpeechToTextPort,
} from "../application/ports/speech-to-text-port";

/**
 * ModelConfigStt — reads the VOICE_STT row from `model_configs` and
 * enriches it with the runtime API key. The adapter object is what the
 * livekit-agent worker receives (via `/agent/config`) to bootstrap the
 * Deepgram streaming SDK.
 */
export class ModelConfigSttAdapter implements SpeechToTextPort {
  constructor(
    private readonly models: ModelConfigRepository,
    private readonly apiKey: string,
  ) {}

  async resolveConfig(): Promise<SpeechToTextConfig> {
    const model = await this.models.resolve("VOICE_STT");
    if (model.provider !== "DEEPGRAM") {
      throw new Error(
        `VOICE_STT provider is ${model.provider}, but only DEEPGRAM is wired.`,
      );
    }
    return {
      provider: "DEEPGRAM",
      modelId: model.modelId,
      endpoint:
        model.endpoint ?? "wss://api.deepgram.com/v1/listen",
      parameters: model.parameters,
      apiKey: this.apiKey,
    };
  }
}
