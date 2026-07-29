"use client";

/**
 * wizard-steps.tsx — every step's body content lives here. The
 * orchestrator (`CharacterWizard.tsx`) picks which step to render and
 * wraps it in `WizardShell`. Splitting keeps each step small and
 * easy to review; splitting further into 11 files added zero clarity.
 *
 * Contract for every step: `{ draft, patch, previews, lookups? }` in,
 * body content out. No back/continue buttons, no progress bar — the
 * shell owns those.
 */

import { useState } from "react";
import { Plus, Shuffle, X } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { PhotoTile } from "./PhotoTile";
import type {
  AgeBucket,
  WizardDraft,
} from "./wizard-state";
import {
  AGE_BUCKET_ORDER,
  AGE_BUCKET_DEFAULT_YEARS,
  bodyMeasurementsAllowed,
} from "./wizard-state";
import type {
  BaseStyle,
  BodyType,
  Ethnicity,
  EyeColor,
  FashionStyle,
  Gender,
  HairColor,
  HairStyle,
  SizeTier,
} from "../../domain/entities/character";
import type {
  CharacterLookupsDto,
  RelationshipOptionDto,
  PersonalityOptionDto,
  VoiceOptionDto,
} from "../../application/dto/lookups.dto";
import type {
  WizardPreviewRow,
  WizardOptionType,
} from "../../application/ports/wizard-preview-repository";

// ─── Preview index ────────────────────────────────────────────────────────
// Serialised WizardPreviewRow[] arrives from the RSC page. We rebuild a
// lookup client-side so tiles get O(1) access to their thumbnail URL.
// The lookup is scoped to the current (baseStyle, gender) — we filter
// once at wizard boot and re-filter whenever those change (rare).

export interface PreviewIndex {
  get(type: WizardOptionType, value: string): string | null;
}

export function buildPreviewIndex(
  rows: readonly WizardPreviewRow[],
  baseStyle: BaseStyle | null,
  gender: Gender | null,
): PreviewIndex {
  // Fallback chain — each map is checked in order, first hit wins:
  //   A. Exact (baseStyle, gender) match.                   preferred
  //   B. Same baseStyle, canonical FEMALE gender.           style-locked fallback
  //   C. Canonical (REALISTIC, FEMALE).                     universal fallback
  //   D. Any row for this (optionType, optionValue).        best-effort
  //
  // This means the wizard renders sensible previews even when the seeder
  // has only covered the canonical demographic slice — users who pick
  // NONBINARY or TRANS_MAN don't see a wall of emoji fallbacks; they see
  // the FEMALE version instead until the full matrix is seeded.
  const A = new Map<string, string>();
  const B = new Map<string, string>();
  const C = new Map<string, string>();
  const D = new Map<string, string>();

  for (const r of rows) {
    const key = `${r.optionType}::${r.optionValue}`;
    D.set(key, r.imageUrl);
    if (r.baseStyle === "REALISTIC" && r.gender === "FEMALE") {
      C.set(key, r.imageUrl);
    }
    if (baseStyle && r.baseStyle === baseStyle && r.gender === "FEMALE") {
      B.set(key, r.imageUrl);
    }
    if (
      baseStyle &&
      gender &&
      r.baseStyle === baseStyle &&
      r.gender === gender
    ) {
      A.set(key, r.imageUrl);
    }
  }

  return {
    get(type, value) {
      const key = `${type}::${value}`;
      return (
        A.get(key) ?? B.get(key) ?? C.get(key) ?? D.get(key) ?? null
      );
    },
  };
}

// ─── Common patch typing ──────────────────────────────────────────────────

type Patch = (p: Partial<WizardDraft>) => void;

interface StepProps {
  draft: WizardDraft;
  patch: Patch;
  previews: PreviewIndex;
}

// ═════════════════════════════════════════════════════════════════════════
// Step 1 — Gender
// ═════════════════════════════════════════════════════════════════════════

const GENDER_OPTIONS: Array<{ value: Gender; label: string; symbol: string }> = [
  { value: "FEMALE", label: "Woman", symbol: "♀" },
  { value: "MALE", label: "Man", symbol: "♂" },
  { value: "TRANS_WOMAN", label: "Trans woman", symbol: "⚧" },
  { value: "TRANS_MAN", label: "Trans man", symbol: "⚧" },
  { value: "NONBINARY", label: "Nonbinary", symbol: "⚭" },
];

export function StepGender({ draft, patch }: StepProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
      {GENDER_OPTIONS.map((g) => {
        const active = draft.gender === g.value;
        return (
          <button
            key={g.value}
            type="button"
            onClick={() => patch({ gender: g.value })}
            aria-pressed={active}
            className={cn(
              "aspect-square rounded-2xl transition-all duration-200 cursor-pointer",
              "flex flex-col items-center justify-center gap-1.5",
              active
                ? "ring-3 ring-pink-500 bg-pink-500/10 shadow-lg shadow-pink-500/20"
                : "ring-1 ring-[#26263a] bg-[#141420] hover:ring-pink-400/60 hover:bg-[#181828]",
            )}
          >
            <div
              className={cn(
                "text-4xl",
                active ? "text-pink-400" : "text-[#8a8a99]",
              )}
            >
              {g.symbol}
            </div>
            <div
              className={cn(
                "text-sm font-medium",
                active ? "text-white" : "text-[#c4c2d4]",
              )}
            >
              {g.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 2 — Look (baseStyle)
// ═════════════════════════════════════════════════════════════════════════

const LOOK_OPTIONS: Array<{
  value: BaseStyle;
  label: string;
  hint: string;
  fallback: string;
}> = [
  {
    value: "REALISTIC",
    label: "Realistic",
    hint: "Photoreal portrait",
    fallback: "📸",
  },
  {
    value: "ANIME",
    label: "Animated",
    hint: "Anime illustration",
    fallback: "🎨",
  },
];

export function StepLook({ draft, patch, previews }: StepProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:gap-6">
      {LOOK_OPTIONS.map((o) => (
        <PhotoTile
          key={o.value}
          label={o.label}
          hint={o.hint}
          imageUrl={previews.get("LOOK", o.value)}
          fallback={o.fallback}
          selected={draft.baseStyle === o.value}
          onSelect={() => patch({ baseStyle: o.value })}
          aspect="portrait"
          size="lg"
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 3 — Bond (relationship archetype)
// ═════════════════════════════════════════════════════════════════════════

interface StepBondProps extends StepProps {
  relationships: readonly RelationshipOptionDto[];
}

export function StepBond({ draft, patch, previews, relationships }: StepBondProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {relationships.map((r) => (
        <PhotoTile
          key={r.slug}
          label={r.displayName}
          hint={r.description}
          imageUrl={previews.get("BOND", r.slug)}
          fallback={r.icon ?? "💞"}
          selected={draft.relationshipSlug === r.slug}
          onSelect={() => patch({ relationshipSlug: r.slug })}
          aspect="square"
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 4 — Personality (archetype)
// ═════════════════════════════════════════════════════════════════════════

interface StepPersonalityProps extends StepProps {
  personalities: readonly PersonalityOptionDto[];
}

export function StepPersonality({
  draft,
  patch,
  previews,
  personalities,
}: StepPersonalityProps) {
  const [expanded, setExpanded] = useState(false);
  const initialCount = 6;
  const visible = expanded
    ? personalities
    : personalities.slice(0, initialCount);
  const hidden = personalities.length - initialCount;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {visible.map((p) => (
          <PhotoTile
            key={p.slug}
            label={p.displayName}
            hint={p.description}
            imageUrl={previews.get("PERSONALITY", p.slug)}
            fallback={p.icon ?? "✨"}
            selected={draft.personalitySlug === p.slug}
            onSelect={() => patch({ personalitySlug: p.slug })}
            aspect="square"
          />
        ))}
      </div>
      {hidden > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 w-full rounded-xl border border-dashed border-[#26263a] py-3 text-sm font-medium text-[#c4c2d4] hover:border-pink-400/60 hover:text-white hover:bg-pink-500/5 transition-colors cursor-pointer"
        >
          Show {hidden} more
        </button>
      ) : null}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 5 — Age
// ═════════════════════════════════════════════════════════════════════════

export function StepAge({ draft, patch }: StepProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {AGE_BUCKET_ORDER.map((b: AgeBucket) => {
        const active = draft.ageBucket === b;
        return (
          <button
            key={b}
            type="button"
            onClick={() =>
              patch({
                ageBucket: b,
                ageYears: AGE_BUCKET_DEFAULT_YEARS[b],
              })
            }
            aria-pressed={active}
            className={cn(
              "rounded-2xl py-6 text-lg md:text-xl font-semibold transition-all cursor-pointer",
              active
                ? "bg-pink-500/10 ring-3 ring-pink-500 text-white shadow shadow-pink-500/20"
                : "bg-[#141420] ring-1 ring-[#26263a] text-[#c4c2d4] hover:ring-pink-400/60 hover:bg-[#181828]",
            )}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 6 — Heritage (ethnicity)
// ═════════════════════════════════════════════════════════════════════════

const HERITAGE_OPTIONS: Array<{ value: Ethnicity; label: string; fallback: string }> = [
  { value: "EAST_ASIAN", label: "East Asian", fallback: "🀄" },
  { value: "SOUTHEAST_ASIAN", label: "SE Asian", fallback: "🌺" },
  { value: "SOUTH_ASIAN", label: "South Asian", fallback: "🕉" },
  { value: "MIDDLE_EASTERN", label: "Middle Eastern", fallback: "☾" },
  { value: "NORTH_AFRICAN", label: "N. African", fallback: "🐫" },
  { value: "BLACK", label: "Black", fallback: "✨" },
  { value: "CARIBBEAN", label: "Caribbean", fallback: "🌴" },
  { value: "LATINA", label: "Latina", fallback: "🌶" },
  { value: "EUROPEAN", label: "European", fallback: "🏰" },
  { value: "MIXED", label: "Mixed", fallback: "🌈" },
];

export function StepHeritage({ draft, patch, previews }: StepProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
      {HERITAGE_OPTIONS.map((h) => (
        <PhotoTile
          key={h.value}
          label={h.label}
          imageUrl={previews.get("ETHNICITY", h.value)}
          fallback={h.fallback}
          selected={draft.ethnicity === h.value}
          onSelect={() => patch({ ethnicity: h.value })}
          aspect="portrait"
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 7 — Hair (color + style)
// ═════════════════════════════════════════════════════════════════════════

const HAIR_COLORS: Array<{ value: HairColor; label: string; fallback: string }> = [
  { value: "BLACK", label: "Black", fallback: "⚫" },
  { value: "BROWN", label: "Brown", fallback: "🟫" },
  { value: "BLONDE", label: "Blonde", fallback: "🟡" },
  { value: "AUBURN", label: "Auburn", fallback: "🟠" },
  { value: "RED", label: "Red", fallback: "🔴" },
  { value: "SILVER", label: "Silver", fallback: "⚪" },
  { value: "PINK", label: "Pink", fallback: "🌸" },
];

const HAIR_STYLES: Array<{ value: HairStyle; label: string; fallback: string }> = [
  { value: "STRAIGHT", label: "Long straight", fallback: "💇‍♀️" },
  { value: "WAVY", label: "Long wavy", fallback: "🌊" },
  { value: "BOB", label: "Bob", fallback: "💇" },
  { value: "PIXIE", label: "Pixie", fallback: "🧚" },
  { value: "CURLY", label: "Curly", fallback: "🌀" },
  { value: "BRAIDS", label: "Braids", fallback: "🎗" },
  { value: "PONYTAIL", label: "Ponytail", fallback: "🎠" },
];

export function StepHair({ draft, patch, previews }: StepProps) {
  return (
    <div className="space-y-8">
      <SubSection title="Hair color">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {HAIR_COLORS.map((c) => (
            <PhotoTile
              key={c.value}
              label={c.label}
              imageUrl={previews.get("HAIR_COLOR", c.value)}
              fallback={c.fallback}
              selected={draft.hairColor === c.value}
              onSelect={() => patch({ hairColor: c.value })}
              aspect="square"
              size="sm"
            />
          ))}
        </div>
      </SubSection>
      <SubSection title="Hair style">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {HAIR_STYLES.map((s) => (
            <PhotoTile
              key={s.value}
              label={s.label}
              imageUrl={previews.get("HAIR_STYLE", s.value)}
              fallback={s.fallback}
              selected={draft.hairStyle === s.value}
              onSelect={() => patch({ hairStyle: s.value })}
              aspect="square"
              size="sm"
            />
          ))}
        </div>
      </SubSection>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 8 — Eyes
// ═════════════════════════════════════════════════════════════════════════

const EYE_OPTIONS: Array<{ value: EyeColor; label: string; fallback: string }> = [
  { value: "BROWN", label: "Brown", fallback: "👁" },
  { value: "HAZEL", label: "Hazel", fallback: "👁" },
  { value: "GREEN", label: "Green", fallback: "👁" },
  { value: "BLUE", label: "Blue", fallback: "👁" },
  { value: "GRAY", label: "Gray", fallback: "👁" },
  { value: "VIOLET", label: "Violet", fallback: "👁" },
];

export function StepEyes({ draft, patch, previews }: StepProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
      {EYE_OPTIONS.map((e) => (
        <PhotoTile
          key={e.value}
          label={e.label}
          imageUrl={previews.get("EYE_COLOR", e.value)}
          fallback={e.fallback}
          selected={draft.eyeColor === e.value}
          onSelect={() => patch({ eyeColor: e.value })}
          aspect="landscape"
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 9 — Body
// ═════════════════════════════════════════════════════════════════════════

const BODY_OPTIONS: Array<{ value: BodyType; label: string; fallback: string }> = [
  { value: "SLIM", label: "Slim", fallback: "🌿" },
  { value: "ATHLETIC", label: "Athletic", fallback: "🏋️" },
  { value: "CURVY", label: "Curvy", fallback: "🍑" },
  { value: "PETITE", label: "Petite", fallback: "🐣" },
  { value: "VOLUPTUOUS", label: "Voluptuous", fallback: "💃" },
  { value: "PLUS_SIZE", label: "Plus size", fallback: "🎈" },
];

const SIZE_TIERS: SizeTier[] = ["XS", "S", "M", "L", "XL"];

export function StepBody({ draft, patch, previews }: StepProps) {
  const measurementsAllowed = bodyMeasurementsAllowed(draft.gender);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {BODY_OPTIONS.map((b) => (
          <PhotoTile
            key={b.value}
            label={b.label}
            imageUrl={previews.get("BODY_TYPE", b.value)}
            fallback={b.fallback}
            selected={draft.bodyType === b.value}
            onSelect={() => patch({ bodyType: b.value })}
            aspect="portrait"
          />
        ))}
      </div>

      {measurementsAllowed ? (
        <div className="space-y-4 pt-2">
          <SizeRow
            label="Bust (optional)"
            value={draft.bustSize}
            onChange={(v) => patch({ bustSize: v })}
          />
          <SizeRow
            label="Hips (optional)"
            value={draft.hipSize}
            onChange={(v) => patch({ hipSize: v })}
          />
        </div>
      ) : null}
    </div>
  );
}

function SizeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SizeTier | null;
  onChange: (v: SizeTier | null) => void;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-[#c4c2d4] mb-2">{label}</div>
      <div className="flex gap-2 flex-wrap">
        {SIZE_TIERS.map((tier) => {
          const active = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(active ? null : tier)}
              className={cn(
                "min-w-11 h-10 px-4 rounded-full text-sm font-semibold transition-all cursor-pointer",
                active
                  ? "bg-pink-500 text-white shadow shadow-pink-500/30"
                  : "bg-[#141420] ring-1 ring-[#26263a] text-[#c4c2d4] hover:ring-pink-400/60",
              )}
            >
              {tier}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 10 — Fashion
// ═════════════════════════════════════════════════════════════════════════

const FASHION_OPTIONS: Array<{ value: FashionStyle; label: string; fallback: string }> = [
  { value: "CASUAL_CHIC", label: "Casual chic", fallback: "👖" },
  { value: "ELEGANT", label: "Elegant", fallback: "👗" },
  { value: "STREETWEAR", label: "Streetwear", fallback: "🧢" },
  { value: "BOHEMIAN", label: "Bohemian", fallback: "🌻" },
  { value: "GOTH", label: "Goth", fallback: "🖤" },
  { value: "ANIME_FASHION", label: "Anime", fallback: "🎌" },
  { value: "SPORTY", label: "Sporty", fallback: "🏃" },
];

export function StepFashion({ draft, patch, previews }: StepProps) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {FASHION_OPTIONS.map((f) => (
          <PhotoTile
            key={f.value}
            label={f.label}
            imageUrl={previews.get("FASHION", f.value)}
            fallback={f.fallback}
            selected={draft.fashionStyle === f.value}
            onSelect={() => patch({ fashionStyle: f.value })}
            aspect="portrait"
          />
        ))}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-pink-400 hover:text-pink-300 select-none">
          More detail (optional)
        </summary>
        <div className="mt-3">
          <input
            type="text"
            maxLength={200}
            placeholder="e.g. red silk cocktail dress, denim jacket, streetwear"
            value={draft.clothing}
            onChange={(e) => patch({ clothing: e.target.value })}
            className="w-full rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/30"
          />
        </div>
      </details>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Step 11 — Details (name, occupation, voice, hobbies, backstory, NSFW)
// ═════════════════════════════════════════════════════════════════════════

interface StepDetailsProps {
  draft: WizardDraft;
  patch: Patch;
  lookups: CharacterLookupsDto;
  onSurpriseName?: () => void;
}

export function StepDetails({ draft, patch, lookups, onSurpriseName }: StepDetailsProps) {
  return (
    <div className="space-y-6">
      <Field label="Name" hint={`${draft.name.trim().length}/30`}>
        <div className="flex gap-2">
          <input
            type="text"
            maxLength={30}
            placeholder="What should we call them?"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="flex-1 rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/30"
          />
          {onSurpriseName ? (
            <button
              type="button"
              onClick={onSurpriseName}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#141420] ring-1 ring-[#26263a] px-4 text-sm font-medium text-[#c4c2d4] hover:ring-pink-400/60 hover:bg-[#181828] hover:text-white cursor-pointer"
            >
              <Shuffle className="h-4 w-4" />
              Surprise me
            </button>
          ) : null}
        </div>
      </Field>

      <Field label="Occupation">
        <SlugPicker
          options={lookups.occupations}
          value={draft.occupationSlug}
          onSelect={(slug) => patch({ occupationSlug: slug })}
        />
      </Field>

      <Field label="Voice">
        <SlugPicker
          options={lookups.voices.map((v: VoiceOptionDto) => ({
            slug: v.slug,
            displayName: v.displayName,
            description: v.tone,
            icon: null,
          }))}
          value={draft.voiceSlug}
          onSelect={(slug) => patch({ voiceSlug: slug })}
        />
      </Field>

      <Field label="Hobbies" hint={`${draft.hobbies.length}/3`}>
        <HobbyEditor
          hobbies={draft.hobbies}
          onChange={(h) => patch({ hobbies: h })}
        />
      </Field>

      <Field label="Backstory (optional)">
        <textarea
          rows={4}
          maxLength={2000}
          placeholder="Anything you want us to know?"
          value={draft.backstory}
          onChange={(e) => patch({ backstory: e.target.value })}
          className="w-full rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/30 resize-none"
        />
      </Field>
    </div>
  );
}

// ─── Details step helpers ────────────────────────────────────────────────

function SlugPicker({
  options,
  value,
  onSelect,
}: {
  options: readonly {
    slug: string;
    displayName: string;
    description: string | null;
    icon: string | null;
  }[];
  value: string | null;
  onSelect: (slug: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const initial = 6;
  const visible = expanded ? options : options.slice(0, initial);
  const hidden = options.length - initial;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {visible.map((o) => {
          const active = value === o.slug;
          return (
            <button
              key={o.slug}
              type="button"
              onClick={() => onSelect(o.slug)}
              className={cn(
                "text-left rounded-xl px-3 py-2.5 transition-all cursor-pointer",
                active
                  ? "bg-pink-500/10 ring-2 ring-pink-500 text-white"
                  : "bg-[#141420] ring-1 ring-[#26263a] hover:ring-pink-400/60 hover:bg-[#181828]",
              )}
            >
              <div className="flex items-center gap-2">
                {o.icon ? (
                  <span className="text-lg leading-none">{o.icon}</span>
                ) : null}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {o.displayName}
                  </div>
                  {o.description ? (
                    <div className="text-xs text-[#8a8a99] truncate">
                      {o.description}
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {hidden > 0 && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-[#26263a] py-2.5 text-sm font-medium text-[#c4c2d4] hover:border-pink-400/60 hover:text-white hover:bg-pink-500/5 transition-colors cursor-pointer"
        >
          Show {hidden} more
        </button>
      ) : null}
    </div>
  );
}

function HobbyEditor({
  hobbies,
  onChange,
}: {
  hobbies: string[];
  onChange: (h: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (hobbies.length >= 3) return;
    if (hobbies.some((h) => h.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...hobbies, trimmed].slice(0, 3));
    setValue("");
  };
  const remove = (h: string) => onChange(hobbies.filter((x) => x !== h));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hobbies.map((h) => (
          <span
            key={h}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/15 border border-pink-500/30 px-3 py-1 text-sm text-pink-300"
          >
            {h}
            <button
              type="button"
              onClick={() => remove(h)}
              className="text-pink-400 hover:text-pink-200 cursor-pointer"
              aria-label={`Remove ${h}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={
            hobbies.length >= 3 ? "Limit reached" : "Add a hobby and press Enter"
          }
          disabled={hobbies.length >= 3}
          maxLength={40}
          className="flex-1 rounded-xl bg-[#141420] border border-[#26263a] px-4 py-2.5 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/30 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={hobbies.length >= 3 || value.trim().length === 0}
          className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white px-4 py-2.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow shadow-pink-500/30"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Add</span>
        </button>
      </div>
    </div>
  );
}

// ─── Shared visual helpers ───────────────────────────────────────────────

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#c4c2d4] mb-3">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint ? <div className="text-xs text-[#8a8a99]">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}
