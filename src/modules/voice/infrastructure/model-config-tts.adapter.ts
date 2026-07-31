import "server-only";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type {
  TextToSpeechConfig,
  TextToSpeechPort,
} from "../application/ports/text-to-speech-port";

/**
 * ModelConfigTts — reads the VOICE_TTS row from `model_configs` and
 * enriches it with the runtime API key. See sibling STT adapter.
 */
export class ModelConfigTtsAdapter implements TextToSpeechPort {
  constructor(
    private readonly models: ModelConfigRepository,
    private readonly apiKey: string,
  ) {}

  async resolveConfig(): Promise<TextToSpeechConfig> {
    const model = await this.models.resolve("VOICE_TTS");
    if (model.provider !== "CARTESIA") {
      throw new Error(
        `VOICE_TTS provider is ${model.provider}, but only CARTESIA is wired.`,
      );
    }
    return {
      provider: "CARTESIA",
      modelId: model.modelId,
      endpoint: model.endpoint ?? "wss://api.cartesia.ai/tts/websocket",
      parameters: model.parameters,
      apiKey: this.apiKey,
    };
  }
}
