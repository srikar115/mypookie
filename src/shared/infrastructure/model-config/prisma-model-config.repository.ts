import "server-only";
import type { ModelConfig, ModelPurpose, PrismaClient } from "@prisma/client";
import type { ModelConfigRepository } from "@/shared/application/model-config/model-config-repository";
import type { ResolvedModel } from "@/shared/application/model-config/model-config.dto";
import { ModelNotConfiguredError } from "@/shared/application/model-config/errors";

/**
 * TTL for the in-process cache. Chosen so admin edits propagate within a
 * minute without hitting Postgres on every LLM turn. When Redis + pub-sub
 * cache invalidation ships, this class stays but the value can drop to
 * effectively-forever (the pub-sub handler will .clear() this map).
 */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: ResolvedModel;
  expiresAt: number;
}

export class PrismaModelConfigRepository implements ModelConfigRepository {
  private readonly cache = new Map<ModelPurpose, CacheEntry>();

  constructor(private readonly db: PrismaClient) {}

  async resolve(purpose: ModelPurpose): Promise<ResolvedModel> {
    const now = Date.now();
    const cached = this.cache.get(purpose);
    if (cached && cached.expiresAt > now) return cached.value;

    const row = await this.db.modelConfig.findUnique({ where: { purpose } });
    if (!row || !row.isActive) {
      throw new ModelNotConfiguredError(purpose);
    }

    const resolved = toResolvedModel(row);
    this.cache.set(purpose, { value: resolved, expiresAt: now + CACHE_TTL_MS });
    return resolved;
  }
}

function toResolvedModel(row: ModelConfig): ResolvedModel {
  const params =
    row.parameters && typeof row.parameters === "object" && !Array.isArray(row.parameters)
      ? (row.parameters as Record<string, unknown>)
      : {};

  return {
    purpose: row.purpose,
    provider: row.provider,
    modelId: row.modelId,
    endpoint: row.endpoint,
    parameters: Object.freeze({ ...params }),
    label: row.label,
  };
}
