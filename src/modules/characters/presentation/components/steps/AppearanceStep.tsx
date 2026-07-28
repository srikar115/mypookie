"use client";

import { PickerTile } from "../PickerTile";
import { CollapsibleGrid } from "../CollapsibleGrid";
import type { WizardDraft } from "../wizard-state";
import type {
  BodyType,
  EyeColor,
  HairColor,
  HairStyle,
  SizeTier,
} from "../../../domain/entities/character";

interface Props {
  draft: WizardDraft;
  onPatch: (patch: Partial<WizardDraft>) => void;
}

const EYE_COLORS: Array<{ value: EyeColor; label: string; swatch: string }> = [
  { value: "BROWN", label: "Brown", swatch: "#6b4423" },
  { value: "BLUE", label: "Blue", swatch: "#3b82f6" },
  { value: "GREEN", label: "Green", swatch: "#22c55e" },
  { value: "HAZEL", label: "Hazel", swatch: "#a3703a" },
  { value: "AMBER", label: "Amber", swatch: "#f59e0b" },
  { value: "GRAY", label: "Gray", swatch: "#94a3b8" },
  { value: "VIOLET", label: "Violet", swatch: "#a855f7" },
  { value: "HETEROCHROMIA", label: "Heterochromia", swatch: "linear-gradient(90deg,#3b82f6,#22c55e)" },
];

const HAIR_STYLES: Array<{ value: HairStyle; label: string; icon: string }> = [
  { value: "STRAIGHT", label: "Straight", icon: "🎀" },
  { value: "WAVY", label: "Wavy", icon: "🌊" },
  { value: "CURLY", label: "Curly", icon: "🌀" },
  { value: "BANGS", label: "Bangs", icon: "✂️" },
  { value: "PONYTAIL", label: "Ponytail", icon: "🎠" },
  { value: "BOB", label: "Bob", icon: "💇" },
  { value: "PIXIE", label: "Pixie", icon: "🧚" },
  { value: "BRAIDS", label: "Braids", icon: "🎗️" },
  { value: "UPDO", label: "Updo", icon: "👸" },
];

const HAIR_COLORS: Array<{ value: HairColor; label: string; swatch: string }> = [
  { value: "BLACK", label: "Black", swatch: "#1a1a1a" },
  { value: "BROWN", label: "Brown", swatch: "#5a3a20" },
  { value: "BLONDE", label: "Blonde", swatch: "#e6c07a" },
  { value: "RED", label: "Red", swatch: "#c73832" },
  { value: "AUBURN", label: "Auburn", swatch: "#8a2b1a" },
  { value: "WHITE", label: "White", swatch: "#f5f5f5" },
  { value: "SILVER", label: "Silver", swatch: "#b8b8c0" },
  { value: "PINK", label: "Pink", swatch: "#ec4899" },
  { value: "PURPLE", label: "Purple", swatch: "#a855f7" },
  { value: "BLUE", label: "Blue", swatch: "#3b82f6" },
  { value: "FANTASY_OTHER", label: "Fantasy", swatch: "linear-gradient(135deg,#ec4899,#a855f7,#3b82f6)" },
];

const BODY_TYPES: Array<{ value: BodyType; label: string; icon: string }> = [
  { value: "SLIM", label: "Slim", icon: "🌿" },
  { value: "ATHLETIC", label: "Athletic", icon: "🏋️" },
  { value: "CURVY", label: "Curvy", icon: "🍑" },
  { value: "PETITE", label: "Petite", icon: "🐣" },
  { value: "VOLUPTUOUS", label: "Voluptuous", icon: "💃" },
  { value: "PLUS_SIZE", label: "Plus size", icon: "🎈" },
];

const SIZE_TIERS: SizeTier[] = ["XS", "S", "M", "L", "XL"];

export function AppearanceStep({ draft, onPatch }: Props) {
  const showSizes = draft.gender === "FEMALE";
  return (
    <div className="space-y-8">
      <Section title="Age">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={18}
            max={65}
            value={draft.ageYears}
            onChange={(e) => onPatch({ ageYears: Number(e.target.value) })}
            className="flex-1 accent-purple-500"
          />
          <div className="min-w-16 text-center rounded-lg bg-[#141420] border border-[#26263a] px-3 py-2 text-white font-medium">
            {draft.ageYears}
          </div>
        </div>
        <p className="text-xs text-[#8a8a99] mt-2">
          Every character must be 18 or older.
        </p>
      </Section>

      <Section title="Eye color">
        <CollapsibleGrid
          gridClassName="grid grid-cols-2 sm:grid-cols-4 gap-3"
          initialCount={8}
        >
          {EYE_COLORS.map((c) => (
            <PickerTile
              key={c.value}
              label={c.label}
              icon={<Swatch style={c.swatch} />}
              selected={draft.eyeColor === c.value}
              onSelect={() => onPatch({ eyeColor: c.value })}
              size="sm"
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Hair style">
        <CollapsibleGrid
          gridClassName="grid grid-cols-3 gap-3"
          initialCount={6}
        >
          {HAIR_STYLES.map((h) => (
            <PickerTile
              key={h.value}
              label={h.label}
              icon={<span>{h.icon}</span>}
              selected={draft.hairStyle === h.value}
              onSelect={() => onPatch({ hairStyle: h.value })}
              size="sm"
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Hair color">
        <CollapsibleGrid
          gridClassName="grid grid-cols-2 sm:grid-cols-4 gap-3"
          initialCount={8}
        >
          {HAIR_COLORS.map((c) => (
            <PickerTile
              key={c.value}
              label={c.label}
              icon={<Swatch style={c.swatch} />}
              selected={draft.hairColor === c.value}
              onSelect={() => onPatch({ hairColor: c.value })}
              size="sm"
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Body type">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BODY_TYPES.map((b) => (
            <PickerTile
              key={b.value}
              label={b.label}
              icon={<span>{b.icon}</span>}
              selected={draft.bodyType === b.value}
              onSelect={() => onPatch({ bodyType: b.value })}
            />
          ))}
        </div>
      </Section>

      {showSizes ? (
        <>
          <Section title="Bust (optional)">
            <SizeRow
              value={draft.bustSize}
              onChange={(v) => onPatch({ bustSize: v })}
            />
          </Section>
          <Section title="Hips (optional)">
            <SizeRow
              value={draft.hipSize}
              onChange={(v) => onPatch({ hipSize: v })}
            />
          </Section>
        </>
      ) : null}

      <Section title="Clothing (optional)">
        <input
          type="text"
          maxLength={200}
          placeholder="e.g. red silk cocktail dress, denim jacket, casual streetwear"
          value={draft.clothing}
          onChange={(e) => onPatch({ clothing: e.target.value })}
          className="w-full rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
        />
      </Section>
    </div>
  );
}

function SizeRow({
  value,
  onChange,
}: {
  value: SizeTier | null;
  onChange: (v: SizeTier | null) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {SIZE_TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          onClick={() => onChange(value === tier ? null : tier)}
          className={`min-w-12 h-11 px-4 rounded-xl border font-medium transition-all cursor-pointer ${
            value === tier
              ? "bg-purple-500/10 border-purple-400 text-white ring-2 ring-purple-400/40"
              : "bg-[#141420] border-[#26263a] text-[#c4c2d4] hover:border-[#3a3a54]"
          }`}
        >
          {tier}
        </button>
      ))}
    </div>
  );
}

function Swatch({ style }: { style: string }) {
  return (
    <div
      className="h-6 w-6 rounded-full border border-white/10"
      style={{ background: style }}
    />
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
