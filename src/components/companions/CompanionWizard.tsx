"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WizardProgressBar, OptionCard, SliderField } from "./WizardStep";
import {
  ChevronLeft, ChevronRight, Sparkles, User, Palette, Heart, MessageCircle,
  Brain, Eye, Check, AlertTriangle, Camera, RefreshCw, ArrowRight,
} from "lucide-react";

// ─── Step data ────────────────────────────────────────────────────────────────

const COMPANION_TYPES = [
  { label: "Romantic Companion", emoji: "💕", value: "Romantic companion" },
  { label: "Flirty Friend", emoji: "😏", value: "Flirty friend" },
  { label: "Emotional Support", emoji: "🤗", value: "Emotional support companion" },
  { label: "Fantasy Companion", emoji: "✨", value: "Fantasy companion" },
  { label: "Custom", emoji: "🎨", value: "Custom" },
];

const GENDER_OPTIONS = [
  { label: "Female", emoji: "👩", value: "Female" },
  { label: "Male", emoji: "👨", value: "Male" },
  { label: "Non-binary", emoji: "🧑", value: "Non-binary" },
  { label: "Custom", emoji: "✨", value: "Custom" },
];

const AGE_STYLES = [
  { label: "Adult, mid 20s", emoji: "🌸", value: "Adult, mid 20s" },
  { label: "Adult, late 20s", emoji: "🌻", value: "Adult, late 20s" },
  { label: "Adult, 30s", emoji: "🌺", value: "Adult, 30s" },
  { label: "Adult, mature", emoji: "🍷", value: "Adult, mature" },
];

const RELATIONSHIP_STYLES = [
  { label: "Caring Partner", emoji: "💝", value: "Caring partner" },
  { label: "Playful Crush", emoji: "🦋", value: "Playful crush" },
  { label: "Confident Romantic", emoji: "🔥", value: "Confident romantic companion" },
  { label: "Sweet Best Friend", emoji: "🌈", value: "Sweet best friend" },
  { label: "Mysterious Fantasy", emoji: "🌙", value: "Mysterious fantasy companion" },
  { label: "Custom", emoji: "✨", value: "Custom" },
];

const GREETING_STYLES = [
  { label: "Warm", emoji: "☀️", value: "Warm" },
  { label: "Playful", emoji: "🎉", value: "Playful" },
  { label: "Romantic", emoji: "🌹", value: "Romantic" },
  { label: "Supportive", emoji: "🤝", value: "Supportive" },
  { label: "Bold but Respectful", emoji: "⚡", value: "Bold but respectful" },
];

const PERSONALITY_PRESETS = [
  { label: "Sweet and Caring", emoji: "🍬", value: "Sweet and caring" },
  { label: "Playful and Teasing", emoji: "😜", value: "Playful and teasing" },
  { label: "Confident and Bold", emoji: "💪", value: "Confident and bold" },
  { label: "Calm and Supportive", emoji: "🌿", value: "Calm and emotionally supportive" },
  { label: "Mysterious and Poetic", emoji: "🌙", value: "Mysterious and poetic" },
  { label: "Custom Blend", emoji: "🎨", value: "Custom blend" },
];

const PERSONALITY_TRAITS = [
  "Warmth", "Humor", "Confidence", "Emotional Depth", "Flirtiness", "Loyalty", "Playfulness",
];

const VISUAL_STYLES = [
  { label: "Realistic", emoji: "📸", value: "Realistic" },
  { label: "Animated Realistic", emoji: "🎭", value: "Animated realistic" },
  { label: "Anime-Inspired Adult", emoji: "🌸", value: "Anime-inspired adult" },
  { label: "3D Animated", emoji: "💎", value: "3D animated" },
  { label: "Digital Art", emoji: "🎨", value: "Digital art" },
  { label: "Cinematic Illustration", emoji: "🎬", value: "Cinematic illustration" },
];

const HAIR_COLORS = [
  { label: "Black", emoji: "🖤", value: "Black" },
  { label: "Brown", emoji: "🤎", value: "Brown" },
  { label: "Blonde", emoji: "💛", value: "Blonde" },
  { label: "Red", emoji: "❤️", value: "Red" },
  { label: "Silver", emoji: "🩶", value: "Silver" },
  { label: "Pastel", emoji: "🌸", value: "Pastel" },
  { label: "Custom", emoji: "🎨", value: "Custom" },
];

const HAIRSTYLES = [
  { label: "Long Straight", emoji: "💆", value: "Long straight" },
  { label: "Long Wavy", emoji: "🌊", value: "Long wavy" },
  { label: "Short Bob", emoji: "✂️", value: "Short bob" },
  { label: "Curly", emoji: "🌀", value: "Curly" },
  { label: "Ponytail", emoji: "🎀", value: "Ponytail" },
  { label: "Braided", emoji: "🌿", value: "Braided" },
  { label: "Custom", emoji: "🎨", value: "Custom" },
];

const EYE_COLORS = [
  { label: "Brown", emoji: "🤎", value: "Brown" },
  { label: "Blue", emoji: "💙", value: "Blue" },
  { label: "Green", emoji: "💚", value: "Green" },
  { label: "Hazel", emoji: "🍂", value: "Hazel" },
  { label: "Grey", emoji: "🩶", value: "Grey" },
  { label: "Custom", emoji: "✨", value: "Custom" },
];

const BUILD_STYLES = [
  { label: "Slim", value: "Slim" },
  { label: "Athletic", value: "Athletic" },
  { label: "Curvy", value: "Curvy" },
  { label: "Average", value: "Average" },
  { label: "Tall", value: "Tall" },
  { label: "Petite Adult", value: "Petite adult" },
  { label: "Custom", value: "Custom" },
];

const FASHION_STYLES = [
  { label: "Casual", emoji: "👕", value: "Casual" },
  { label: "Elegant", emoji: "👗", value: "Elegant" },
  { label: "Cozy", emoji: "🧸", value: "Cozy" },
  { label: "Futuristic", emoji: "🚀", value: "Futuristic" },
  { label: "Fantasy", emoji: "🧝", value: "Fantasy" },
  { label: "Streetwear", emoji: "🧢", value: "Streetwear" },
  { label: "Professional", emoji: "👔", value: "Professional" },
  { label: "Custom", emoji: "🎨", value: "Custom" },
];

const OVERALL_VIBES = [
  { label: "Soft and Warm", value: "Soft and warm" },
  { label: "Confident and Stylish", value: "Confident and stylish" },
  { label: "Cute but Clearly Adult", value: "Cute but clearly adult" },
  { label: "Elegant and Mature", value: "Elegant and mature" },
  { label: "Fantasy-Inspired", value: "Fantasy-inspired" },
  { label: "Futuristic", value: "Futuristic" },
];

const CONVERSATION_TONES = [
  { label: "Short and Natural", emoji: "💬", value: "Short and natural" },
  { label: "Detailed and Expressive", emoji: "📝", value: "Detailed and expressive" },
  { label: "Playful", emoji: "😄", value: "Playful" },
  { label: "Emotionally Deep", emoji: "💭", value: "Emotionally deep" },
  { label: "Romantic but Tasteful", emoji: "🌹", value: "Romantic but tasteful" },
];

const INTIMACY_LEVELS = [
  { label: "Friendly", emoji: "🤝", value: "Friendly", description: "Warm and platonic" },
  { label: "Lightly Flirty", emoji: "😊", value: "Lightly flirty", description: "Playful with gentle flirtiness" },
  { label: "Romantic", emoji: "💕", value: "Romantic", description: "Romantic emotional connection" },
  { label: "Intimate Adult", emoji: "🔥", value: "Intimate adult conversation within platform policy", description: "Adult conversation within policy" },
];

const MEMORY_PREFERENCES = [
  "Remember my preferences",
  "Remember our relationship style",
  "Remember important details",
  "Remember likes and dislikes",
  "Let me edit memory manually",
];

// ─── Wizard state ──────────────────────────────────────────────────────────────

interface WizardState {
  companionType: string;
  genderPresentation: string;
  ageStyle: string;
  name: string;
  relationshipStyle: string;
  greetingStyle: string;
  personalityPreset: string;
  personalityTraits: Record<string, number>;
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
  memoryPreferences: string[];
  // Media defaults — seeded into every new conversation's metadata.
  defaultAutoPics: "off" | "ask" | "on";
  defaultImageAspect: "portrait" | "square" | "landscape";
  defaultVideoMode: "from-last-photo" | "text-only";
}

const DEFAULT_STATE: WizardState = {
  companionType: "",
  genderPresentation: "",
  ageStyle: "",
  name: "",
  relationshipStyle: "",
  greetingStyle: "",
  personalityPreset: "",
  personalityTraits: Object.fromEntries(PERSONALITY_TRAITS.map((t) => [t, 60])),
  visualStyle: "",
  hairColor: "",
  hairstyle: "",
  eyeColor: "",
  buildStyle: "",
  fashionStyle: "",
  overallVibe: "",
  customAppearanceNotes: "",
  conversationTone: "",
  intimacyLevel: "",
  memoryPreferences: ["Remember my preferences", "Remember our relationship style"],
  defaultAutoPics: "ask",
  defaultImageAspect: "portrait",
  defaultVideoMode: "from-last-photo",
};

// ─── Step definitions ──────────────────────────────────────────────────────────

const STEP_CONFIGS = [
  { title: "What kind?",    icon: Heart,        description: "Choose your companion type",       requiredFields: ["companionType"] },
  { title: "Gender",        icon: User,         description: "Gender presentation",              requiredFields: ["genderPresentation"] },
  { title: "Age",           icon: User,         description: "Age style",                        requiredFields: ["ageStyle"] },
  { title: "Name",          icon: Heart,        description: "Give them a name",                 requiredFields: ["name"] },
  { title: "Relationship",  icon: Heart,        description: "How they relate to you",           requiredFields: ["relationshipStyle"] },
  { title: "Greeting",      icon: MessageCircle,description: "How they first say hello",        requiredFields: ["greetingStyle"] },
  { title: "Personality",   icon: Brain,        description: "Choose a personality preset",      requiredFields: [] },
  { title: "Traits",        icon: Brain,        description: "Fine-tune personality traits",     requiredFields: [] },
  { title: "Visual Style",  icon: Palette,      description: "Overall artistic style",           requiredFields: ["visualStyle"] },
  { title: "Hair & Eyes",   icon: Eye,          description: "Hair color, style, and eye color", requiredFields: ["hairColor", "hairstyle", "eyeColor"] },
  { title: "Body & Fashion",icon: Palette,      description: "Build, fashion, and vibe",         requiredFields: ["buildStyle", "fashionStyle", "overallVibe"] },
  { title: "Chat Style",    icon: MessageCircle,description: "Tone and intimacy level",          requiredFields: ["conversationTone", "intimacyLevel"] },
  { title: "Memory",        icon: Brain,        description: "What they remember",               requiredFields: [] },
  { title: "Photos",        icon: Camera,       description: "How they share pics and videos",   requiredFields: [] },
  { title: "Review",        icon: Sparkles,     description: "Review and generate your look",    requiredFields: [] },
] as const;

const TOTAL_STEPS = STEP_CONFIGS.length;

// ─── Individual step content ───────────────────────────────────────────────────

type UpdateFn = (field: keyof WizardState, value: unknown) => void;

function StepCompanionType({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {COMPANION_TYPES.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.companionType === opt.value} onClick={() => update("companionType", opt.value)} />
      ))}
    </div>
  );
}

function StepGender({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {GENDER_OPTIONS.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.genderPresentation === opt.value} onClick={() => update("genderPresentation", opt.value)} />
      ))}
    </div>
  );
}

function StepAge({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {AGE_STYLES.map((opt) => (
          <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
            selected={state.ageStyle === opt.value} onClick={() => update("ageStyle", opt.value)} />
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#1a1a26] border border-[#2a2a3d] px-3 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[#6b7280]">
          Only adult age options are available. Minor, teen, or ambiguous age descriptors are not allowed.
        </p>
      </div>
    </>
  );
}

function StepName({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="max-w-sm">
      <Input
        label="Companion Name"
        placeholder="Give your companion a name..."
        value={state.name}
        onChange={(e) => update("name", e.target.value)}
        hint="This is how your companion will refer to themselves"
      />
    </div>
  );
}

function StepRelationship({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {RELATIONSHIP_STYLES.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.relationshipStyle === opt.value} onClick={() => update("relationshipStyle", opt.value)} />
      ))}
    </div>
  );
}

function StepGreeting({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {GREETING_STYLES.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.greetingStyle === opt.value} onClick={() => update("greetingStyle", opt.value)} />
      ))}
    </div>
  );
}

function StepPersonalityPreset({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PERSONALITY_PRESETS.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.personalityPreset === opt.value} onClick={() => update("personalityPreset", opt.value)} />
      ))}
    </div>
  );
}

function StepTraits({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="space-y-4">
      {PERSONALITY_TRAITS.map((trait) => (
        <SliderField
          key={trait}
          label={trait}
          value={state.personalityTraits[trait] ?? 60}
          onChange={(v) => update("personalityTraits", { ...state.personalityTraits, [trait]: v })}
        />
      ))}
    </div>
  );
}

function StepVisualStyle({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {VISUAL_STYLES.map((opt) => (
        <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
          selected={state.visualStyle === opt.value} onClick={() => update("visualStyle", opt.value)} />
      ))}
    </div>
  );
}

function StepHairEyes({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Hair Color</p>
        <div className="grid grid-cols-3 gap-2">
          {HAIR_COLORS.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
              selected={state.hairColor === opt.value} onClick={() => update("hairColor", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Hairstyle</p>
        <div className="grid grid-cols-3 gap-2">
          {HAIRSTYLES.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
              selected={state.hairstyle === opt.value} onClick={() => update("hairstyle", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Eye Color</p>
        <div className="grid grid-cols-3 gap-2">
          {EYE_COLORS.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
              selected={state.eyeColor === opt.value} onClick={() => update("eyeColor", opt.value)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StepBodyFashion({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Body Type</p>
        <div className="grid grid-cols-3 gap-2">
          {BUILD_STYLES.map((opt) => (
            <OptionCard key={opt.value} label={opt.label}
              selected={state.buildStyle === opt.value} onClick={() => update("buildStyle", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Fashion Style</p>
        <div className="grid grid-cols-3 gap-2">
          {FASHION_STYLES.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
              selected={state.fashionStyle === opt.value} onClick={() => update("fashionStyle", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Overall Vibe</p>
        <div className="grid grid-cols-2 gap-2">
          {OVERALL_VIBES.map((opt) => (
            <OptionCard key={opt.value} label={opt.label}
              selected={state.overallVibe === opt.value} onClick={() => update("overallVibe", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-2">Custom Notes <span className="font-normal text-[#4b5563]">(optional)</span></p>
        <textarea
          value={state.customAppearanceNotes}
          onChange={(e) => update("customAppearanceNotes", e.target.value)}
          placeholder="Any extra appearance details..."
          rows={2}
          className="w-full resize-none rounded-xl border border-[#2a2a3d] bg-[#12121a] px-4 py-3 text-sm text-[#f1f0ff] placeholder:text-[#4b5563] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
        />
      </div>
    </div>
  );
}

function StepChatStyle({ state, update }: { state: WizardState; update: UpdateFn }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Conversation Tone</p>
        <div className="grid grid-cols-2 gap-3">
          {CONVERSATION_TONES.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji}
              selected={state.conversationTone === opt.value} onClick={() => update("conversationTone", opt.value)} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#c4c2d4] mb-3">Intimacy Level</p>
        <div className="space-y-3">
          {INTIMACY_LEVELS.map((opt) => (
            <OptionCard key={opt.value} label={opt.label} emoji={opt.emoji} description={opt.description}
              selected={state.intimacyLevel === opt.value} onClick={() => update("intimacyLevel", opt.value)} />
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#1a1a26] border border-[#2a2a3d] px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-[#6b7280]">
            All conversations are moderated for platform policy compliance regardless of intimacy level selected.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepMemory({ state, update }: { state: WizardState; update: UpdateFn }) {
  const toggle = (pref: string) => {
    const updated = state.memoryPreferences.includes(pref)
      ? state.memoryPreferences.filter((p) => p !== pref)
      : [...state.memoryPreferences, pref];
    update("memoryPreferences", updated);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#6b7280]">Choose what your companion remembers across conversations.</p>
      {MEMORY_PREFERENCES.map((pref) => {
        const active = state.memoryPreferences.includes(pref);
        return (
          <button key={pref} type="button" onClick={() => toggle(pref)}
            className={`flex w-full items-center justify-between rounded-xl border p-4 transition-all duration-150 text-left ${
              active ? "border-purple-500/50 bg-purple-500/10" : "border-[#2a2a3d] bg-[#12121a] hover:border-[#3a3a50]"
            }`}
          >
            <span className={`text-sm font-medium ${active ? "text-purple-200" : "text-[#c4c2d4]"}`}>{pref}</span>
            <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
              active ? "border-purple-500 bg-purple-500" : "border-[#3a3a50]"
            }`}>
              {active && <Check className="h-3 w-3 text-white" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StepMediaDefaults({
  state,
  update,
}: {
  state: WizardState;
  update: UpdateFn;
}) {
  const autoOptions: {
    value: "off" | "ask" | "on";
    label: string;
    desc: string;
    emoji: string;
  }[] = [
    { value: "off", label: "Off", desc: "Only when you tap the Image pill", emoji: "🔕" },
    { value: "ask", label: "Ask first", desc: "Show a one-tap card under her reply (recommended)", emoji: "💬" },
    { value: "on",  label: "Send right away", desc: "Auto-generate the second she catches a hint", emoji: "⚡" },
  ];

  const aspectOptions: {
    value: "portrait" | "square" | "landscape";
    label: string;
    ratio: string;
  }[] = [
    { value: "portrait", label: "Portrait", ratio: "9:16 · phone style" },
    { value: "square", label: "Square", ratio: "1:1 · social-feed" },
    { value: "landscape", label: "Landscape", ratio: "16:9 · cinematic" },
  ];

  const videoModeOptions: {
    value: "from-last-photo" | "text-only";
    label: string;
    desc: string;
  }[] = [
    { value: "from-last-photo", label: "Animate her last photo", desc: "Best for visual continuity" },
    { value: "text-only", label: "Fresh from text", desc: "Whatever the moment calls for" },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#6b7280]">
        Set the defaults for how she shares photos and videos. You can tweak any
        of this later inside the chat using the ⋯ menu.
      </p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b8fae] mb-2">
          When you ask for a pic
        </p>
        <div className="space-y-2">
          {autoOptions.map((opt) => {
            const active = state.defaultAutoPics === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("defaultAutoPics", opt.value)}
                className={`flex w-full items-center justify-between rounded-xl border p-3.5 transition-all text-left ${
                  active
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-[#2e2818] bg-[#12100a] hover:border-[#3a3220]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.emoji}</span>
                  <div>
                    <p className={`text-sm font-medium ${active ? "text-amber-200" : "text-[#fff8ee]"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-[#8b8fae] mt-0.5">{opt.desc}</p>
                  </div>
                </div>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                  active ? "border-amber-500 bg-amber-500" : "border-[#3a3220]"
                }`}>
                  {active && <Check className="h-3 w-3 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b8fae] mb-2">
          Photo aspect ratio
        </p>
        <div className="grid grid-cols-3 gap-2">
          {aspectOptions.map((opt) => {
            const active = state.defaultImageAspect === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("defaultImageAspect", opt.value)}
                className={`rounded-xl border p-3 transition-all text-left ${
                  active
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-[#2e2818] bg-[#12100a] hover:border-[#3a3220]"
                }`}
              >
                <p className={`text-sm font-medium ${active ? "text-amber-200" : "text-[#fff8ee]"}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-[#8b8fae] mt-0.5">{opt.ratio}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b8fae] mb-2">
          When you ask for a video
        </p>
        <div className="grid grid-cols-2 gap-2">
          {videoModeOptions.map((opt) => {
            const active = state.defaultVideoMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update("defaultVideoMode", opt.value)}
                className={`rounded-xl border p-3.5 transition-all text-left ${
                  active
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-[#2e2818] bg-[#12100a] hover:border-[#3a3220]"
                }`}
              >
                <p className={`text-sm font-medium ${active ? "text-amber-200" : "text-[#fff8ee]"}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-[#8b8fae] mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const traitHighlights = Object.entries(state.personalityTraits)
    .filter(([, v]) => v >= 60)
    .map(([k]) => k)
    .slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#2a2a3d] bg-[#0c0c14] p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 text-2xl shadow-xl">
            ✨
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#f1f0ff]">{state.name || "Unnamed"}</h3>
            <p className="text-sm text-[#9ca3af]">
              {state.companionType} · {state.genderPresentation} · {state.ageStyle}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: "Relationship", value: state.relationshipStyle },
            { label: "Personality", value: state.personalityPreset },
            { label: "Visual Style", value: state.visualStyle },
            { label: "Vibe", value: state.overallVibe },
            { label: "Tone", value: state.conversationTone },
            { label: "Intimacy", value: state.intimacyLevel },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs text-[#6b7280]">{item.label}</p>
              <p className="text-[#c4c2d4] font-medium text-xs">{item.value || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {traitHighlights.length > 0 && (
        <div className="rounded-xl border border-[#2a2a3d] bg-[#0c0c14] p-4">
          <p className="text-xs font-semibold text-[#c4c2d4] mb-2">Top Traits</p>
          <div className="flex flex-wrap gap-2">
            {traitHighlights.map((trait) => (
              <span key={trait} className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-full px-3 py-1">
                {trait}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
        <Camera className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-300">
          After creation, a portrait image of {state.name || "your companion"} will be automatically generated based on your appearance choices and set as their profile picture.
        </p>
      </div>
    </div>
  );
}

// ─── Creation Complete Screen ─────────────────────────────────────────────────

interface CreatedCompanion {
  companionId: string;
  conversationId: string;
  name: string;
}

// Phrases that cycle while the portrait is generating
const REVEAL_PHRASES = [
  (name: string) => `Bringing ${name} to life…`,
  (_name: string) => "Choosing the perfect outfit…",
  (name: string) => `Painting ${name}'s eyes…`,
  (_name: string) => "Adjusting the lighting…",
  (name: string) => `Almost done — ${name} looks stunning…`,
  (_name: string) => "Final touches…",
];

function RevealLoadingState({ name }: { name: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % REVEAL_PHRASES.length), 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#1a1610] to-[#0a0a0f] px-6">
      {/* Shimmer bar at the top */}
      <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden rounded-t-3xl">
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-rose-400 to-amber-500 rounded-full"
          style={{ animation: "shimmer 2s ease-in-out infinite", width: "60%" }}
        />
      </div>

      {/* Central glow orb */}
      <div className="relative h-20 w-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/40 to-rose-400/40 animate-pulse" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/20 to-rose-400/20 animate-ping" />
        <span className="relative text-3xl select-none">✨</span>
      </div>

      {/* Rotating phrase */}
      <p className="text-sm text-[#e5d5b8] text-center leading-relaxed px-2 transition-all duration-500">
        {REVEAL_PHRASES[idx](name)}
      </p>

      {/* Pulsing dots */}
      <div className="flex gap-1.5">
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

interface CreationCompleteProps {
  created: CreatedCompanion;
  wizardState: {
    companionType: string;
    overallVibe: string;
    conversationTone: string;
    visualStyle: string;
  };
}

function CreationCompleteScreen({ created, wizardState }: CreationCompleteProps) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [justRevealed, setJustRevealed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    pollCountRef.current = 0;

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      try {
        const res = await fetch(`/api/companions/${created.companionId}/regenerate-avatar`);
        if (res.ok) {
          const data = await res.json();
          if (data.avatarUrl) {
            setAvatarUrl(data.avatarUrl);
            setIsPolling(false);
            setJustRevealed(true);
            setTimeout(() => setJustRevealed(false), 1500);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* ignore */ }

      if (pollCountRef.current > 30) {
        setIsPolling(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  }, [created.companionId]);

  useEffect(() => {
    startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [startPolling]);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setAvatarUrl(null);
    setJustRevealed(false);
    try {
      await fetch(`/api/companions/${created.companionId}/regenerate-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPrompt: customPrompt.trim() || undefined }),
      });
      startPolling();
    } catch { /* ignore */ } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-6 py-4 animate-fade-in">
      {/* Ambient glow behind everything */}
      <div className="pointer-events-none absolute -inset-8 -z-10 bg-gradient-to-br from-amber-500/15 via-rose-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-0 right-1/4 -z-10 h-64 w-64 rounded-full bg-rose-500/15 blur-3xl animate-pulse" />

      {/* Intro label */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-300 mb-3">
          <Sparkles className="h-3 w-3" />
          Your companion is ready
        </div>
        <h2 className="text-3xl font-bold text-gradient">Meet {created.name}!</h2>
      </div>

      {/* Big 9:16 portrait poster */}
      <div
        className={`relative w-[300px] aspect-[9/16] rounded-3xl overflow-hidden border shadow-2xl transition-all duration-700 ${
          avatarUrl
            ? "border-amber-500/40 shadow-amber-500/20"
            : "border-[#2e2818] shadow-black/50"
        }`}
      >
        {/* Sparkle ring on reveal */}
        {justRevealed && (
          <div className="absolute inset-0 z-10 pointer-events-none">
            <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-amber-400/60 animate-ping" />
            <div className="absolute top-4 right-8 h-3 w-3 rounded-full bg-rose-400/60 animate-ping [animation-delay:150ms]" />
            <div className="absolute top-1 right-16 h-4 w-4 rounded-full bg-amber-300/50 animate-ping [animation-delay:300ms]" />
          </div>
        )}

        {avatarUrl ? (
          <>
            <Image
              src={avatarUrl}
              alt={created.name}
              fill
              className="object-cover animate-fade-in"
              unoptimized
              priority
            />
            {/* Subtle bottom nameplate gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
          </>
        ) : (
          <RevealLoadingState name={created.name} />
        )}
      </div>

      {/* Nameplate + trait pills */}
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold text-[#fff8ee]">{created.name}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {wizardState.companionType && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300">
              {wizardState.companionType}
            </span>
          )}
          {wizardState.visualStyle && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-[#2e2818] bg-[#1a1610] text-[#e5d5b8]">
              {wizardState.visualStyle}
            </span>
          )}
          {wizardState.overallVibe && (
            <span className="px-2.5 py-1 rounded-full text-xs border border-[#2e2818] bg-[#1a1610] text-[#e5d5b8]">
              {wizardState.overallVibe}
            </span>
          )}
        </div>
      </div>

      {/* Primary actions */}
      <div className="w-full max-w-[300px] grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          size="lg"
          onClick={() => router.push(`/app/chat/${created.companionId}`)}
        >
          <ArrowRight className="h-4 w-4" />
          Chat Now
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={handleRegenerate}
          disabled={isRegenerating || isPolling}
        >
          {isRegenerating || isPolling ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {isRegenerating ? "Regenerating…" : isPolling ? "Generating…" : "New Look"}
        </Button>
      </div>

      {/* Collapsible "Adjust the look" */}
      <div className="w-full max-w-[300px]">
        <button
          type="button"
          onClick={() => setShowAdjust((v) => !v)}
          className="w-full flex items-center justify-between text-xs text-[#e5d5b8] hover:text-[#fff8ee] transition-colors py-1"
        >
          <span>Adjust the look…</span>
          <span className={`transition-transform duration-200 ${showAdjust ? "rotate-90" : ""}`}>›</span>
        </button>
        {showAdjust && (
          <div className="mt-2 space-y-2 animate-fade-in">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. wearing a silk dress, rooftop setting, sunset glow…"
              rows={2}
              className="w-full resize-none rounded-xl border border-[#2e2818] bg-[#12100a] px-4 py-3 text-sm text-[#fff8ee] placeholder:text-[#4b5563] focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            />
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleRegenerate}
              disabled={isRegenerating || isPolling || !customPrompt.trim()}
            >
              {isRegenerating || isPolling ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Apply &amp; Regenerate
            </Button>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-[#4b5563]">
        You can regenerate the look anytime from {created.name}&apos;s profile.
      </p>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function CompanionWizard() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedCompanion | null>(null);

  const update = (field: keyof WizardState, value: unknown) =>
    setState((prev) => ({ ...prev, [field]: value }));

  const currentConfig = STEP_CONFIGS[step - 1];

  const isStepValid = (): boolean => {
    const fields = currentConfig.requiredFields as readonly (keyof WizardState)[];
    if (!fields.length) return true;
    return fields.every((f) => {
      const val = state[f];
      return typeof val === "string" ? val.trim().length > 0 : Boolean(val);
    });
  };

  const handleNext = () => {
    if (!isStepValid()) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCreate = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/companions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create companion. Please try again.");
        return;
      }
      // Show completion screen instead of navigating away
      setCreated({
        companionId: data.companion.id,
        conversationId: data.conversation.id,
        name: data.companion.name,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show the post-creation screen once companion exists
  if (created) {
    return (
      <CreationCompleteScreen
        created={created}
        wizardState={{
          companionType: state.companionType,
          overallVibe: state.overallVibe,
          conversationTone: state.conversationTone,
          visualStyle: state.visualStyle,
        }}
      />
    );
  }

  const renderStep = () => {
    switch (step) {
      case 1:  return <StepCompanionType state={state} update={update} />;
      case 2:  return <StepGender state={state} update={update} />;
      case 3:  return <StepAge state={state} update={update} />;
      case 4:  return <StepName state={state} update={update} />;
      case 5:  return <StepRelationship state={state} update={update} />;
      case 6:  return <StepGreeting state={state} update={update} />;
      case 7:  return <StepPersonalityPreset state={state} update={update} />;
      case 8:  return <StepTraits state={state} update={update} />;
      case 9:  return <StepVisualStyle state={state} update={update} />;
      case 10: return <StepHairEyes state={state} update={update} />;
      case 11: return <StepBodyFashion state={state} update={update} />;
      case 12: return <StepChatStyle state={state} update={update} />;
      case 13: return <StepMemory state={state} update={update} />;
      case 14: return <StepMediaDefaults state={state} update={update} />;
      case 15: return <StepReview state={state} />;
      default: return null;
    }
  };

  const Icon = currentConfig.icon;

  return (
    <div>
      <WizardProgressBar currentStep={step} totalSteps={TOTAL_STEPS} />

      {/* Mini step tabs — only show nearby steps to avoid crowding */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {STEP_CONFIGS.map((config, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < step;
          const isCurrent = stepNum === step;
          const StepIcon = config.icon;

          return (
            <button
              key={stepNum}
              type="button"
              onClick={() => stepNum < step && setStep(stepNum)}
              disabled={stepNum > step}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all shrink-0 ${
                isCurrent
                  ? "bg-purple-500/10 text-purple-300 border border-purple-500/30"
                  : isComplete
                  ? "text-[#9ca3af] hover:text-[#c4c2d4] cursor-pointer"
                  : "text-[#3a3a50] cursor-not-allowed"
              }`}
            >
              {isComplete ? (
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              ) : (
                <StepIcon className="h-2.5 w-2.5" />
              )}
              {config.title}
            </button>
          );
        })}
      </div>

      {/* Step card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-purple-400" />
            <div>
              <CardTitle>
                Step {step} of {TOTAL_STEPS}: {currentConfig.title}
              </CardTitle>
              <CardDescription>{currentConfig.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="min-h-[280px]">
            {renderStep()}
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="secondary" onClick={handleBack} disabled={step === 1}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {step < TOTAL_STEPS ? (
          <Button onClick={handleNext} disabled={!isStepValid()}>
            Continue
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleCreate} isLoading={isLoading} size="lg">
            <Sparkles className="h-4 w-4" />
            Create Companion
          </Button>
        )}
      </div>
    </div>
  );
}
