"use client";

import { PickerTile } from "../PickerTile";
import { CollapsibleGrid } from "../CollapsibleGrid";
import type { WizardDraft } from "../wizard-state";
import type { Ethnicity } from "../../../domain/entities/character";

/**
 * Wizard screen 1 — ethnicity picker.
 *
 * `baseStyle` and `gender` are derived from the top-nav category
 * (Girls / Anime / Guys) — see `deriveDraftFromCategory` in the wizard —
 * so we don't ask the user to pick them again here. This keeps the wizard
 * from repeating information the user already implicitly chose by clicking
 * "Create Character" from a specific category tab.
 */

interface Props {
  draft: WizardDraft;
  onPatch: (patch: Partial<WizardDraft>) => void;
}

const ETHNICITIES: Array<{ value: Ethnicity; label: string; icon: string }> = [
  { value: "CAUCASIAN", label: "Caucasian", icon: "🌍" },
  { value: "LATINA", label: "Latina", icon: "🌶️" },
  { value: "ASIAN", label: "Asian", icon: "🎋" },
  { value: "ARAB", label: "Arab", icon: "🐫" },
  { value: "EBONY", label: "Ebony", icon: "✨" },
  { value: "MIXED", label: "Mixed", icon: "🌈" },
  { value: "OTHER", label: "Other", icon: "❓" },
];

export function StyleStep({ draft, onPatch }: Props) {
  return (
    <div className="space-y-8">
      <Section title="Ethnicity">
        <CollapsibleGrid initialCount={6}>
          {ETHNICITIES.map((e) => (
            <PickerTile
              key={e.value}
              label={e.label}
              icon={<span>{e.icon}</span>}
              selected={draft.ethnicity === e.value}
              onSelect={() => onPatch({ ethnicity: e.value })}
            />
          ))}
        </CollapsibleGrid>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}
