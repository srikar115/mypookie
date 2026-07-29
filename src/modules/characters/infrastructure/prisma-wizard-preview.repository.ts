import "server-only";
import type { PrismaClient } from "@prisma/client";
import type {
  WizardOptionType,
  WizardPreviewLookup,
  WizardPreviewRepository,
  WizardPreviewRow,
} from "../application/ports/wizard-preview-repository";
import type { BaseStyle, Gender } from "../domain/entities/character";

/**
 * Prisma-backed adapter for the wizard preview repository. Reads from the
 * `wizard_option_previews` table populated by the offline seed script
 * (Phase 3). Read-only by design — writes happen exclusively in the
 * seeder, never in a request path.
 */
export class PrismaWizardPreviewRepository implements WizardPreviewRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForContext(input: {
    readonly baseStyle: BaseStyle;
    readonly gender: Gender;
  }): Promise<WizardPreviewLookup> {
    const rows = await this.db.wizardOptionPreview.findMany({
      where: {
        baseStyle: input.baseStyle,
        gender: input.gender,
      },
      select: {
        optionType: true,
        optionValue: true,
        baseStyle: true,
        gender: true,
        imageUrl: true,
      },
    });

    const mapped: WizardPreviewRow[] = rows.map((r) => ({
      optionType: r.optionType as WizardOptionType,
      optionValue: r.optionValue,
      baseStyle: r.baseStyle as BaseStyle,
      gender: r.gender as Gender,
      imageUrl: r.imageUrl,
    }));

    return buildLookup(mapped);
  }

  async listAll(): Promise<readonly WizardPreviewRow[]> {
    const rows = await this.db.wizardOptionPreview.findMany({
      select: {
        optionType: true,
        optionValue: true,
        baseStyle: true,
        gender: true,
        imageUrl: true,
      },
    });
    return rows.map((r) => ({
      optionType: r.optionType as WizardOptionType,
      optionValue: r.optionValue,
      baseStyle: r.baseStyle as BaseStyle,
      gender: r.gender as Gender,
      imageUrl: r.imageUrl,
    }));
  }
}

/**
 * Builds an O(1) lookup keyed by `${optionType}::${optionValue}`. Keeping
 * the row list as well so admin views can iterate for coverage reports.
 */
function buildLookup(rows: readonly WizardPreviewRow[]): WizardPreviewLookup {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(keyFor(row.optionType, row.optionValue), row.imageUrl);
  }
  return {
    get(optionType, optionValue) {
      return index.get(keyFor(optionType, optionValue)) ?? null;
    },
    all() {
      return rows;
    },
  };
}

function keyFor(optionType: WizardOptionType, optionValue: string): string {
  return `${optionType}::${optionValue}`;
}
