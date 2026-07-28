"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { PickerTile } from "../PickerTile";
import { CollapsibleGrid } from "../CollapsibleGrid";
import type { WizardDraft } from "../wizard-state";
import type {
  CharacterLookupsDto,
} from "../../../application/dto/lookups.dto";

interface Props {
  draft: WizardDraft;
  onPatch: (patch: Partial<WizardDraft>) => void;
  lookups: CharacterLookupsDto;
}

export function CharacterStep({ draft, onPatch, lookups }: Props) {
  return (
    <div className="space-y-8">
      <Section title="Name" hint={`${draft.name.trim().length}/30`}>
        <input
          type="text"
          maxLength={30}
          placeholder="What should we call her?"
          value={draft.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="w-full rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30"
        />
      </Section>

      <Section title="Personality">
        <CollapsibleGrid
          initialCount={6}
          moreLabel={(n) => `Show ${n} more personalities`}
        >
          {lookups.personalities.map((p) => (
            <PickerTile
              key={p.slug}
              label={p.displayName}
              description={p.description}
              icon={p.icon ? <span>{p.icon}</span> : null}
              selected={draft.personalitySlug === p.slug}
              onSelect={() => onPatch({ personalitySlug: p.slug })}
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Relationship">
        <CollapsibleGrid
          initialCount={6}
          moreLabel={(n) => `Show ${n} more relationships`}
        >
          {lookups.relationships.map((r) => (
            <PickerTile
              key={r.slug}
              label={r.displayName}
              description={r.description}
              icon={r.icon ? <span>{r.icon}</span> : null}
              selected={draft.relationshipSlug === r.slug}
              onSelect={() => onPatch({ relationshipSlug: r.slug })}
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Occupation">
        <CollapsibleGrid
          initialCount={6}
          moreLabel={(n) => `Show ${n} more occupations`}
        >
          {lookups.occupations.map((o) => (
            <PickerTile
              key={o.slug}
              label={o.displayName}
              description={o.description}
              icon={o.icon ? <span>{o.icon}</span> : null}
              selected={draft.occupationSlug === o.slug}
              onSelect={() => onPatch({ occupationSlug: o.slug })}
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Hobbies" hint={`${draft.hobbies.length}/3`}>
        <HobbyEditor
          hobbies={draft.hobbies}
          onChange={(hobbies) => onPatch({ hobbies })}
        />
      </Section>

      <Section title="Voice">
        <CollapsibleGrid
          initialCount={6}
          moreLabel={(n) => `Show ${n} more voices`}
        >
          {lookups.voices.map((v) => (
            <PickerTile
              key={v.slug}
              label={v.displayName}
              description={v.tone}
              selected={draft.voiceSlug === v.slug}
              onSelect={() => onPatch({ voiceSlug: v.slug })}
              size="sm"
            />
          ))}
        </CollapsibleGrid>
      </Section>

      <Section title="Backstory (optional)">
        <textarea
          rows={4}
          maxLength={2000}
          placeholder="Anything you want to know about her? Add it here."
          value={draft.backstory}
          onChange={(e) => onPatch({ backstory: e.target.value })}
          className="w-full rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30 resize-none"
        />
      </Section>

      <Section title="Explicit conversation">
        <label className="flex items-center gap-3 rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 cursor-pointer hover:border-[#3a3a54]">
          <input
            type="checkbox"
            checked={draft.nsfwOptIn}
            onChange={(e) => onPatch({ nsfwOptIn: e.target.checked })}
            className="h-4 w-4 accent-purple-500"
          />
          <div className="flex-1">
            <div className="text-sm text-white font-medium">
              Allow explicit / NSFW replies
            </div>
            <div className="text-xs text-[#8a8a99]">
              You can always change this later from the character&apos;s settings.
            </div>
          </div>
        </label>
      </Section>
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
            className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-400/40 px-3 py-1 text-sm text-purple-100"
          >
            {h}
            <button
              type="button"
              onClick={() => remove(h)}
              className="text-purple-300 hover:text-white cursor-pointer"
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
          className="flex-1 rounded-xl bg-[#141420] border border-[#26263a] px-4 py-3 text-white placeholder:text-[#5a5a66] focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/30 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={hobbies.length >= 3 || value.trim().length === 0}
          className="rounded-xl bg-purple-500 hover:bg-purple-400 text-white px-4 py-3 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Add</span>
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {hint ? <span className="text-xs text-[#8a8a99]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
