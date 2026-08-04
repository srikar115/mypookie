import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  CompanionVisualProfileReader,
  CompanionVisualProfile,
} from "../application/ports/companion-visual-profile-reader";
import { getFileUrl } from "@/shared/infrastructure/storage/r2";

export class PrismaCompanionVisualProfileReader
  implements CompanionVisualProfileReader
{
  constructor(private readonly db: PrismaClient) {}

  async read(characterId: string): Promise<CompanionVisualProfile | null> {
    const char = await this.db.character.findUnique({
      where: { id: characterId },
      select: {
        name: true,
        gender: true,
        ageYears: true,
        ethnicity: true,
        hairStyle: true,
        hairColor: true,
        eyeColor: true,
        bodyType: true,
        bustSize: true,
        hipSize: true,
        fashionStyle: true,
        appearancePrompt: true,
        appearanceProfiles: {
          where: { isActive: true },
          take: 1,
          select: { referenceImageR2Key: true },
        },
      },
    });
    if (!char) return null;

    const activeProfile = char.appearanceProfiles[0];
    const referenceImageUrl = activeProfile?.referenceImageR2Key
      ? await getFileUrl(activeProfile.referenceImageR2Key)
      : null;

    return {
      name: char.name,
      gender: char.gender,
      ageYears: char.ageYears,
      ethnicity: char.ethnicity,
      hairStyle: char.hairStyle,
      hairColor: char.hairColor,
      eyeColor: char.eyeColor,
      bodyType: char.bodyType,
      bustSize: char.bustSize ?? null,
      hipSize: char.hipSize ?? null,
      fashionStyle: char.fashionStyle ?? null,
      appearancePrompt: char.appearancePrompt,
      referenceImageUrl,
    };
  }
}
