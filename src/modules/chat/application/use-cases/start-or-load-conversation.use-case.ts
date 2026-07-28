import "server-only";
import type { Clock } from "@/shared/application/clock";
import type { IdGenerator } from "@/shared/application/id-generator";
import type { ConversationRepository } from "../ports/conversation-repository";
import type { ChatCharacterProvider } from "../ports/chat-character-provider";
import type { ConversationDto } from "../dto/conversation.dto";
import { ChatCharacterUnavailableError } from "../../domain/errors";

/**
 * Gets the single conversation for (actor, character) or creates one on the
 * spot. Idempotent: relies on the DB's unique index on (userId, characterId)
 * so concurrent invocations settle on one row.
 */
export class StartOrLoadConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly characters: ChatCharacterProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    actorUserId: string;
    characterId: string;
  }): Promise<ConversationDto> {
    const character = await this.characters.getForActor(
      input.characterId,
      input.actorUserId,
    );
    if (!character) {
      throw new ChatCharacterUnavailableError(input.characterId);
    }

    return this.conversations.startOrLoad({
      id: this.ids.next(),
      userId: input.actorUserId,
      characterId: input.characterId,
      now: this.clock.now(),
    });
  }
}
