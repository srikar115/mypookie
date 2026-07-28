import "server-only";
import type { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/config/env";
import { Character } from "../domain/entities/character";
import { CharacterName } from "../domain/value-objects/character-name";
import { AgeYears } from "../domain/value-objects/age-years";
import { Hobbies } from "../domain/value-objects/hobbies";
import type {
  AppearanceProfileSnapshot,
  CharacterRepository,
} from "../application/ports/character-repository";
import type { CharacterDto } from "../application/dto/character.dto";
import type { CharacterLookupsDto } from "../application/dto/lookups.dto";
import type { CharacterSummaryDto } from "../application/dto/character-summary.dto";

/**
 * Prisma implementation of the CharacterRepository port. The ONLY class that
 * knows both the domain Character entity and the Prisma-generated model.
 */
export class PrismaCharacterRepository implements CharacterRepository {
  constructor(private readonly db: PrismaClient) {}

  async createDraft(character: Character): Promise<void> {
    const p = character.props_;
    await this.db.character.create({
      data: {
        id: p.id,
        ownerUserId: p.ownerUserId,
        name: p.name.value,
        birthdate: p.appearance.age.toBirthdate(p.createdAt.getUTCFullYear()),
        baseStyle: p.appearance.baseStyle,
        ethnicity: p.appearance.ethnicity,
        gender: p.appearance.gender,
        ageYears: p.appearance.age.value,
        eyeColor: p.appearance.eyeColor,
        hairStyle: p.appearance.hairStyle,
        hairColor: p.appearance.hairColor,
        bodyType: p.appearance.bodyType,
        bustSize: p.appearance.bustSize ?? undefined,
        hipSize: p.appearance.hipSize ?? undefined,
        clothing: p.appearance.clothing ?? undefined,
        personalityArchetypeId: p.personality.personalityArchetypeId,
        relationshipArchetypeId: p.personality.relationshipArchetypeId,
        occupationId: p.personality.occupationId,
        voicePresetId: p.personality.voicePresetId,
        flirtation: p.personality.flirtation,
        patience: p.personality.patience,
        moodVolatility: p.personality.moodVolatility,
        dominance: p.personality.dominance,
        language: p.language,
        hobbies: p.hobbies.toArray(),
        tags: [...p.tags],
        nsfwOptIn: p.nsfwOptIn,
        tagline: p.tagline ?? undefined,
        backstory: p.backstory ?? undefined,
        systemPrompt: p.prompts.systemPrompt,
        appearancePrompt: p.prompts.appearancePrompt,
        bio: p.prompts.bio ?? undefined,
        promptCompiledAt: p.prompts.compiledAt,
        status: p.status,
        regenerationCount: p.regenerationCount,
        visibility: p.visibility,
        moderationStatus: p.moderationStatus,
        createdAt: p.createdAt,
      },
    });
  }

  async update(character: Character): Promise<void> {
    const p = character.props_;
    await this.db.character.update({
      where: { id: p.id },
      data: {
        status: p.status,
        regenerationCount: p.regenerationCount,
        committedAt: p.committedAt,
        visibility: p.visibility,
        moderationStatus: p.moderationStatus,
      },
    });
  }

  async findById(id: string): Promise<Character | null> {
    const row = await this.db.character.findUnique({ where: { id } });
    if (!row) return null;
    return Character.rehydrate({
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: CharacterName.create(row.name),
      appearance: {
        baseStyle: row.baseStyle,
        ethnicity: row.ethnicity,
        gender: row.gender,
        age: AgeYears.create(row.ageYears),
        eyeColor: row.eyeColor,
        hairStyle: row.hairStyle,
        hairColor: row.hairColor,
        bodyType: row.bodyType,
        bustSize: row.bustSize,
        hipSize: row.hipSize,
        clothing: row.clothing,
      },
      personality: {
        personalityArchetypeId: row.personalityArchetypeId,
        relationshipArchetypeId: row.relationshipArchetypeId,
        occupationId: row.occupationId,
        voicePresetId: row.voicePresetId,
        flirtation: row.flirtation,
        patience: row.patience,
        moodVolatility: row.moodVolatility,
        dominance: row.dominance,
      },
      hobbies: Hobbies.create(row.hobbies),
      language: row.language,
      tags: row.tags,
      nsfwOptIn: row.nsfwOptIn,
      tagline: row.tagline,
      backstory: row.backstory,
      prompts: {
        systemPrompt: row.systemPrompt,
        appearancePrompt: row.appearancePrompt,
        bio: row.bio,
        compiledAt: row.promptCompiledAt,
      },
      status: row.status,
      regenerationCount: row.regenerationCount,
      committedAt: row.committedAt,
      visibility: row.visibility,
      moderationStatus: row.moderationStatus,
      createdAt: row.createdAt,
    });
  }

  async findDtoById(id: string): Promise<CharacterDto | null> {
    const row = await this.db.character.findUnique({
      where: { id },
      include: {
        personalityArchetype: { select: { displayName: true } },
        relationshipArchetype: { select: { displayName: true } },
        occupation: { select: { displayName: true } },
        voicePreset: { select: { displayName: true } },
        appearanceProfiles: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
          select: { version: true, referenceImageR2Key: true },
        },
      },
    });
    if (!row) return null;

    const activeProfile = row.appearanceProfiles[0];
    const imageUrl = activeProfile?.referenceImageR2Key
      ? buildPublicUrl(activeProfile.referenceImageR2Key)
      : null;

    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      appearance: {
        baseStyle: row.baseStyle,
        ethnicity: row.ethnicity,
        gender: row.gender,
        ageYears: row.ageYears,
        eyeColor: row.eyeColor,
        hairStyle: row.hairStyle,
        hairColor: row.hairColor,
        bodyType: row.bodyType,
        bustSize: row.bustSize,
        hipSize: row.hipSize,
        clothing: row.clothing,
      },
      personality: {
        personalityArchetypeId: row.personalityArchetypeId,
        personalityLabel: row.personalityArchetype.displayName,
        relationshipArchetypeId: row.relationshipArchetypeId,
        relationshipLabel: row.relationshipArchetype.displayName,
        occupationId: row.occupationId,
        occupationLabel: row.occupation.displayName,
        voicePresetId: row.voicePresetId,
        voiceLabel: row.voicePreset.displayName,
        flirtation: row.flirtation,
        patience: row.patience,
        moodVolatility: row.moodVolatility,
        dominance: row.dominance,
      },
      hobbies: row.hobbies,
      tags: row.tags,
      language: row.language,
      nsfwOptIn: row.nsfwOptIn,
      tagline: row.tagline,
      backstory: row.backstory,
      bio: row.bio,
      status: row.status,
      regenerationCount: row.regenerationCount,
      regenerationsRemaining: Math.max(0, 2 - row.regenerationCount),
      imageUrl,
      imageVersion: activeProfile?.version ?? null,
      visibility: row.visibility,
      moderationStatus: row.moderationStatus,
      createdAt: row.createdAt.toISOString(),
      committedAt: row.committedAt?.toISOString() ?? null,
    };
  }

  async findActiveAppearance(
    characterId: string,
  ): Promise<AppearanceProfileSnapshot | null> {
    const row = await this.db.characterAppearanceProfile.findFirst({
      where: { characterId, isActive: true },
      orderBy: { version: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      appearancePrompt: row.appearancePrompt,
      referenceImageR2Key: row.referenceImageR2Key,
      imageUrl: row.referenceImageR2Key
        ? buildPublicUrl(row.referenceImageR2Key)
        : null,
    };
  }

  async appendAppearanceProfile(input: {
    characterId: string;
    appearancePrompt: string;
    imageR2Key: string;
    imageUrl: string;
    faceKeypoints: unknown | null;
  }): Promise<AppearanceProfileSnapshot> {
    return this.db.$transaction(async (tx) => {
      const latest = await tx.characterAppearanceProfile.findFirst({
        where: { characterId: input.characterId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.characterAppearanceProfile.updateMany({
        where: { characterId: input.characterId, isActive: true },
        data: { isActive: false },
      });

      const created = await tx.characterAppearanceProfile.create({
        data: {
          characterId: input.characterId,
          version: nextVersion,
          appearancePrompt: input.appearancePrompt,
          referenceImageR2Key: input.imageR2Key,
          faceKeypoints:
            input.faceKeypoints === null
              ? undefined
              : (input.faceKeypoints as Prisma.InputJsonValue),
          isActive: true,
        },
      });

      return {
        id: created.id,
        version: created.version,
        appearancePrompt: created.appearancePrompt,
        referenceImageR2Key: created.referenceImageR2Key,
        imageUrl: input.imageUrl,
      };
    });
  }

  async listByOwner(ownerUserId: string): Promise<CharacterSummaryDto[]> {
    const rows = await this.db.character.findMany({
      where: {
        ownerUserId,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        personalityArchetype: { select: { displayName: true } },
        relationshipArchetype: { select: { displayName: true } },
        occupation: { select: { displayName: true } },
        appearanceProfiles: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
          select: { referenceImageR2Key: true, version: true },
        },
      },
    });

    return rows.map((row) => {
      const activeProfile = row.appearanceProfiles[0];
      const imageUrl = activeProfile?.referenceImageR2Key
        ? buildPublicUrl(activeProfile.referenceImageR2Key)
        : null;
      return {
        id: row.id,
        name: row.name,
        imageUrl,
        imageVersion: activeProfile?.version ?? null,
        ageYears: row.ageYears,
        relationshipLabel: row.relationshipArchetype.displayName,
        occupationLabel: row.occupation.displayName,
        personalityLabel: row.personalityArchetype.displayName,
        tagline: row.tagline,
        bio: row.bio,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listLookups(nsfwAllowed: boolean): Promise<CharacterLookupsDto> {
    const [personalities, relationships, occupations, voices] = await Promise.all([
      this.db.personalityArchetype.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.db.relationshipArchetype.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.db.characterOccupation.findMany({
        where: nsfwAllowed
          ? { isActive: true }
          : { isActive: true, isNsfwOnly: false },
        orderBy: { sortOrder: "asc" },
      }),
      this.db.voicePreset.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    return {
      personalities: personalities.map((p) => ({
        id: p.id,
        slug: p.slug,
        displayName: p.displayName,
        description: p.description,
        icon: p.icon,
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        description: r.description,
        icon: r.icon,
      })),
      occupations: occupations.map((o) => ({
        id: o.id,
        slug: o.slug,
        displayName: o.displayName,
        description: o.description,
        icon: o.icon,
        isNsfwOnly: o.isNsfwOnly,
      })),
      voices: voices.map((v) => ({
        id: v.id,
        slug: v.slug,
        displayName: v.displayName,
        tone: v.tone,
        sampleUrl: v.sampleR2Key ? buildPublicUrl(v.sampleR2Key) : null,
      })),
    };
  }
}

function buildPublicUrl(r2Key: string): string {
  if (env.STORAGE_PROVIDER === "r2" && env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL}/${r2Key}`;
  }
  return `/api/storage/${r2Key}`;
}
