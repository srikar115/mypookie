"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanionFormData {
  name: string;
  companionType: string;
  genderPresentation: string;
  ageStyle: string;
  relationshipStyle: string;
  greetingStyle: string;
  personalityPreset: string;
  visualStyle: string;
  hairColor: string;
  hairstyle: string;
  eyeColor: string;
  buildStyle: string;
  fashionStyle: string;
  overallVibe: string;
  customAppearanceNotes: string;
  conversationTone: string;
  intimacyLevel: string;
  isPublic: boolean;
}

interface Props {
  initialData?: Partial<CompanionFormData>;
  companionId?: string;
  /** "create" submits POST /api/admin/companions, "edit" submits PATCH /api/admin/companions/[id] */
  mode: "create" | "edit";
  onSaved?: () => void;
}

const DEFAULTS: CompanionFormData = {
  name: "",
  companionType: "Romantic companion",
  genderPresentation: "Female",
  ageStyle: "Adult, mid 20s",
  relationshipStyle: "Caring partner",
  greetingStyle: "Warm",
  personalityPreset: "Sweet and caring",
  visualStyle: "Realistic",
  hairColor: "Brown",
  hairstyle: "Long wavy",
  eyeColor: "Brown",
  buildStyle: "Athletic",
  fashionStyle: "Casual",
  overallVibe: "Soft and warm",
  customAppearanceNotes: "",
  conversationTone: "Romantic but tasteful",
  intimacyLevel: "Romantic",
  isPublic: true,
};

// ─── Simple select helper ─────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#c4c2d4] mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#2a2a3d] bg-[#12121a] text-[#f1f0ff] text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#c4c2d4] mb-1.5">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function CompanionAdminForm({ initialData, companionId, mode, onSaved }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CompanionFormData>({ ...DEFAULTS, ...initialData });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generateAvatar, setGenerateAvatar] = useState(mode === "create");

  function set<K extends keyof CompanionFormData>(key: K, value: CompanionFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url =
      mode === "create" ? "/api/admin/companions" : `/api/admin/companions/${companionId}`;
    const method = mode === "create" ? "POST" : "PATCH";
    const body = mode === "create" ? { ...form, generateAvatar } : form;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      return;
    }

    onSaved?.();
    router.push("/admin/companions");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#c4b5fd] uppercase tracking-wide">Identity</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Name" value={form.name} onChange={(v) => set("name", v)} placeholder="Sophie" />
          <SelectField
            label="Companion Type"
            value={form.companionType}
            options={["Romantic companion", "Flirty friend", "Emotional support companion", "Fantasy companion", "Intellectual companion"]}
            onChange={(v) => set("companionType", v)}
          />
          <SelectField
            label="Gender Presentation"
            value={form.genderPresentation}
            options={["Female", "Male", "Non-binary", "Androgynous"]}
            onChange={(v) => set("genderPresentation", v)}
          />
          <SelectField
            label="Age Style"
            value={form.ageStyle}
            options={["Adult, early 20s", "Adult, mid 20s", "Adult, late 20s", "Adult, 30s", "Adult, 40s"]}
            onChange={(v) => set("ageStyle", v)}
          />
          <SelectField
            label="Relationship Style"
            value={form.relationshipStyle}
            options={["Caring partner", "Playful crush", "Sweet best friend", "Confident romantic companion", "Mysterious fantasy companion"]}
            onChange={(v) => set("relationshipStyle", v)}
          />
          <SelectField
            label="Greeting Style"
            value={form.greetingStyle}
            options={["Warm", "Playful", "Romantic", "Supportive", "Bold but respectful"]}
            onChange={(v) => set("greetingStyle", v)}
          />
        </div>
      </section>

      {/* Personality */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#c4b5fd] uppercase tracking-wide">Personality</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Personality Preset"
            value={form.personalityPreset}
            options={["Sweet and caring", "Playful and teasing", "Confident and bold", "Calm and emotionally supportive", "Mysterious and poetic"]}
            onChange={(v) => set("personalityPreset", v)}
          />
          <SelectField
            label="Conversation Tone"
            value={form.conversationTone}
            options={["Romantic but tasteful", "Short and natural", "Emotionally deep", "Detailed and expressive", "Playful"]}
            onChange={(v) => set("conversationTone", v)}
          />
          <SelectField
            label="Intimacy Level"
            value={form.intimacyLevel}
            options={["Friendly", "Lightly flirty", "Romantic", "Deeply intimate"]}
            onChange={(v) => set("intimacyLevel", v)}
          />
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#c4b5fd] uppercase tracking-wide">Appearance</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Visual Style"
            value={form.visualStyle}
            options={["Realistic", "Animated realistic", "Anime-inspired adult", "3D animated", "Digital art", "Cinematic illustration"]}
            onChange={(v) => set("visualStyle", v)}
          />
          <SelectField
            label="Hair Color"
            value={form.hairColor}
            options={["Black", "Brown", "Blonde", "Red", "Silver", "Pastel", "White", "Auburn"]}
            onChange={(v) => set("hairColor", v)}
          />
          <SelectField
            label="Hairstyle"
            value={form.hairstyle}
            options={["Long straight", "Long wavy", "Short bob", "Ponytail", "Braids", "Curly", "Pixie cut", "Bun"]}
            onChange={(v) => set("hairstyle", v)}
          />
          <SelectField
            label="Eye Color"
            value={form.eyeColor}
            options={["Brown", "Blue", "Green", "Hazel", "Grey", "Amber", "Violet"]}
            onChange={(v) => set("eyeColor", v)}
          />
          <SelectField
            label="Build Style"
            value={form.buildStyle}
            options={["Slim", "Athletic", "Curvy", "Petite adult", "Average", "Tall and lean", "Muscular"]}
            onChange={(v) => set("buildStyle", v)}
          />
          <SelectField
            label="Fashion Style"
            value={form.fashionStyle}
            options={["Casual", "Elegant", "Streetwear", "Fantasy", "Professional", "Futuristic", "Cozy", "Sporty"]}
            onChange={(v) => set("fashionStyle", v)}
          />
          <SelectField
            label="Overall Vibe"
            value={form.overallVibe}
            options={["Soft and warm", "Confident and stylish", "Elegant and mature", "Cute but clearly adult", "Fantasy-inspired", "Futuristic", "Dark and mysterious"]}
            onChange={(v) => set("overallVibe", v)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#c4c2d4] mb-1.5">
            Custom Appearance / Bio Notes
          </label>
          <Textarea
            value={form.customAppearanceNotes}
            onChange={(e) => set("customAppearanceNotes", e.target.value)}
            placeholder="Extra prompt details, a short bio, or appearance notes for image generation…"
            className="min-h-[80px]"
          />
        </div>
      </section>

      {/* Settings */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#c4b5fd] uppercase tracking-wide">Settings</h2>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => set("isPublic", e.target.checked)}
            className="w-4 h-4 accent-purple-500"
          />
          <span className="text-sm text-[#c4c2d4]">
            Show in public browse tab (visible to all users)
          </span>
        </label>
        {mode === "create" && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={generateAvatar}
              onChange={(e) => setGenerateAvatar(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-[#c4c2d4]">
              Generate avatar image immediately after saving
            </span>
          </label>
        )}
      </section>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "Create Companion" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/companions")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
