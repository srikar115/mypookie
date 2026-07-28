"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/presentation/utils";
import { usePublicShell } from "@/components/public/PublicShell";
import { StyleStep } from "./steps/StyleStep";
import { AppearanceStep } from "./steps/AppearanceStep";
import { CharacterStep } from "./steps/CharacterStep";
import { ProgressScreen } from "./ProgressScreen";
import { PreviewScreen } from "./PreviewScreen";
import {
  deriveDraftFromCategory,
  emptyDraft,
  isAppearanceComplete,
  isCharacterComplete,
  type WizardDraft,
  type WizardStep,
} from "./wizard-state";
import { createCharacterDraftAction } from "../actions/create-draft.action";
import type { CharacterLookupsDto } from "../../application/dto/lookups.dto";
import type { CharacterDto } from "../../application/dto/character.dto";

export interface CharacterWizardProps {
  lookups: CharacterLookupsDto;
  /** Server action bound in the parent so the client stays framework-agnostic. */
  fetchCharacter: (id: string) => Promise<CharacterDto | null>;
}

/**
 * CharacterWizard — the client orchestrator for the 3-step character
 * creation flow, followed by the async progress + preview screens.
 *
 * State machine:
 *   style → appearance → character → progress → preview
 *
 * Only the `progress → preview` transition depends on a server round-trip
 * (createCharacterDraftAction). Everything before that is pure local state.
 */
export function CharacterWizard({ lookups, fetchCharacter }: CharacterWizardProps) {
  const { category } = usePublicShell();
  const [step, setStep] = useState<WizardStep>("style");
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    ...emptyDraft(),
    ...deriveDraftFromCategory(category),
  }));
  // Track the last category we synced with so we can re-derive baseStyle +
  // gender during render if the user switches tabs mid-wizard. This follows
  // React's "adjusting state on prop change" pattern (setState during render
  // triggers an immediate re-render without an intervening paint) and avoids
  // the setState-in-effect anti-pattern that useEffect would introduce.
  const [syncedCategory, setSyncedCategory] = useState(category);
  if (syncedCategory !== category) {
    setSyncedCategory(category);
    const derived = deriveDraftFromCategory(category);
    setDraft((prev) => ({
      ...prev,
      ...derived,
      bustSize: derived.gender === "FEMALE" ? prev.bustSize : null,
      hipSize: derived.gender === "FEMALE" ? prev.hipSize : null,
    }));
  }
  const [character, setCharacter] = useState<CharacterDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const patch = (p: Partial<WizardDraft>) =>
    setDraft((prev) => ({ ...prev, ...p }));

  const stepIndex = useMemo(() => {
    if (step === "style") return 0;
    if (step === "appearance") return 1;
    if (step === "character") return 2;
    return 3;
  }, [step]);

  const canProceed = useMemo(() => {
    if (step === "style") {
      // baseStyle + gender are auto-derived from the top-nav category, so
      // the only user-facing requirement on step 1 is ethnicity.
      return draft.ethnicity !== null;
    }
    if (step === "appearance") {
      return isAppearanceComplete(draft);
    }
    if (step === "character") {
      return isCharacterComplete(draft);
    }
    return false;
  }, [step, draft]);

  const goBack = () => {
    if (step === "appearance") setStep("style");
    else if (step === "character") setStep("appearance");
  };

  const goNext = () => {
    if (step === "style") setStep("appearance");
    else if (step === "appearance") setStep("character");
    else if (step === "character") submit();
  };

  const submit = () =>
    startSubmit(async () => {
      setError(null);
      setStep("progress");
      const payload = {
        name: draft.name,
        appearance: {
          baseStyle: draft.baseStyle,
          ethnicity: draft.ethnicity,
          gender: draft.gender,
          ageYears: draft.ageYears,
          eyeColor: draft.eyeColor,
          hairStyle: draft.hairStyle,
          hairColor: draft.hairColor,
          bodyType: draft.bodyType,
          bustSize: draft.bustSize,
          hipSize: draft.hipSize,
          clothing: draft.clothing.trim().length > 0 ? draft.clothing.trim() : null,
        },
        personalitySlug: draft.personalitySlug,
        relationshipSlug: draft.relationshipSlug,
        occupationSlug: draft.occupationSlug,
        voiceSlug: draft.voiceSlug,
        hobbies: draft.hobbies,
        language: draft.language,
        nsfwOptIn: draft.nsfwOptIn,
        backstory:
          draft.backstory.trim().length > 0 ? draft.backstory.trim() : null,
      };
      const res = await createCharacterDraftAction(payload);
      if (!res.ok) {
        setError(res.error);
        setStep("character");
        return;
      }
      const fetched = await fetchCharacter(res.characterId);
      if (!fetched) {
        setError(
          "Character created but we couldn't load its preview. Try refreshing.",
        );
        setStep("character");
        return;
      }
      setCharacter(fetched);
      setStep("preview");
    });

  if (step === "progress") {
    return <ProgressScreen name={draft.name} />;
  }

  if (step === "preview" && character) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        <PreviewScreen
          characterId={character.id}
          characterName={character.name}
          initialImageUrl={character.imageUrl}
          initialRegenerationsRemaining={character.regenerationsRemaining}
          summary={{
            personality: character.personality.personalityLabel,
            relationship: character.personality.relationshipLabel,
            occupation: character.personality.occupationLabel,
            hobbies: character.hobbies,
            bio: character.bio,
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
      <Stepper current={stepIndex} />

      <div className="mt-8">
        {step === "style" ? (
          <StyleStep draft={draft} onPatch={patch} />
        ) : step === "appearance" ? (
          <AppearanceStep draft={draft} onPatch={patch} />
        ) : (
          <CharacterStep draft={draft} onPatch={patch} lookups={lookups} />
        )}
      </div>

      {error ? (
        <div className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
          {error}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between sticky bottom-0 bg-[#0a0a0f] pb-4 pt-4 border-t border-[#1a1a26] -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={step === "style" || isSubmitting}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          size="lg"
          onClick={goNext}
          disabled={!canProceed || isSubmitting}
          isLoading={isSubmitting}
        >
          {step === "character" ? "Create Character" : "Next"}
          {step !== "character" ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const labels = ["Style", "Appearance", "Character"];
  return (
    <ol className="flex items-center gap-3">
      {labels.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={label} className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-full text-sm font-semibold transition-colors",
                done
                  ? "bg-purple-500 text-white"
                  : active
                    ? "bg-white text-black"
                    : "bg-[#1a1a26] text-[#5a5a66]",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-sm font-medium hidden sm:inline",
                active
                  ? "text-white"
                  : done
                    ? "text-[#c4c2d4]"
                    : "text-[#5a5a66]",
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 ? (
              <div
                className={cn(
                  "h-px w-8 md:w-16 transition-colors",
                  done ? "bg-purple-500" : "bg-[#26263a]",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
