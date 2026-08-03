"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WizardShell } from "./WizardShell";
import { ProgressScreen } from "./ProgressScreen";
import {
  StepGender,
  StepLook,
  StepBond,
  StepPersonality,
  StepAge,
  StepHeritage,
  StepHair,
  StepEyes,
  StepBody,
  StepFashion,
  StepDetails,
  buildPreviewIndex,
} from "./wizard-steps";
import {
  emptyDraft,
  isStepComplete,
  WIZARD_STEP_ORDER,
  bodyMeasurementsAllowed,
  type WizardDraft,
  type WizardStep,
} from "./wizard-state";
import { createCharacterDraftAction } from "../actions/create-draft.action";
import { startOrLoadConversationAction } from "@/modules/chat/client";
import { slugifyName } from "@/shared/presentation/utils";
import type { CharacterLookupsDto } from "../../application/dto/lookups.dto";
import type { WizardPreviewRow } from "../../application/ports/wizard-preview-repository";

export interface CharacterWizardProps {
  lookups: CharacterLookupsDto;
  /** All preview rows for the whole table — filtered client-side. */
  previews: readonly WizardPreviewRow[];
}

/**
 * CharacterWizard — Candy.ai-style unified visual wizard (11 steps).
 *
 * Step machine (order fixed in `WIZARD_STEP_ORDER`):
 *   1  gender         → drives image gender presentation
 *   2  look           → REALISTIC vs ANIME
 *   3  bond           → picks relationship archetype slug
 *   4  personality    → picks personality archetype slug
 *   5  age            → 4 buckets, mapped to a concrete year
 *   6  heritage       → picks Ethnicity
 *   7  hair           → color + style on one page
 *   8  eyes           → eye color
 *   9  body           → body type + optional bust/hip (feminine presentations)
 *  10  fashion        → FashionStyle preset + optional freeform clothing
 *  11  details        → name / occupation / voice / hobbies / backstory / NSFW
 *
 * After step 11: `progress` → server round-trip → `preview`.
 *
 * State ownership: draft is client-local, mutated via a single `patch()`
 * merge. No fields are derived from any external context — this wizard
 * is a pure island. The `previews` prop drives visual tiles; missing
 * previews fall back to labels + emojis so the wizard is usable even
 * before Phase 3's image seeder has run.
 */
export function CharacterWizard({
  lookups,
  previews: previewRows,
}: CharacterWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("gender");
  const [draft, setDraft] = useState<WizardDraft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const patch = (p: Partial<WizardDraft>) =>
    setDraft((prev) => {
      // Voice options are filtered by gender AND age bucket, so
      // changing either invalidates any voice picked under the previous
      // filter. Clear it and let the Details step's required-field
      // validation force a re-pick.
      const genderChanged = p.gender !== undefined && p.gender !== prev.gender;
      const ageChanged =
        p.ageBucket !== undefined && p.ageBucket !== prev.ageBucket;
      if (genderChanged || ageChanged) {
        return { ...prev, ...p, voiceSlug: null };
      }
      return { ...prev, ...p };
    });

  // Preview index rebuilt only when the (baseStyle, gender) filter
  // changes — most tile renders don't allocate anything new.
  const previews = useMemo(
    () => buildPreviewIndex(previewRows, draft.baseStyle, draft.gender),
    [previewRows, draft.baseStyle, draft.gender],
  );

  const stepIndex = WIZARD_STEP_ORDER.indexOf(
    step as (typeof WIZARD_STEP_ORDER)[number],
  );
  const isFirstVisualStep = stepIndex === 0;
  const isLastVisualStep = stepIndex === WIZARD_STEP_ORDER.length - 1;

  const canContinue = useMemo(() => {
    if (step === "progress" || step === "preview") return false;
    const check = isStepComplete[step];
    return check ? check(draft) : false;
  }, [step, draft]);

  const goBack = () => {
    if (stepIndex <= 0) return;
    setStep(WIZARD_STEP_ORDER[stepIndex - 1]);
    setError(null);
  };

  const goNext = () => {
    if (step === "details") {
      submit();
      return;
    }
    // Sanity: whenever the user re-enters the body step under a
    // masculine presentation, blow away any previously-set bust/hip
    // so the payload doesn't leak stale measurements.
    if (step === "body" && !bodyMeasurementsAllowed(draft.gender)) {
      setDraft((d) => ({ ...d, bustSize: null, hipSize: null }));
    }
    if (stepIndex >= 0 && stepIndex < WIZARD_STEP_ORDER.length - 1) {
      setStep(WIZARD_STEP_ORDER[stepIndex + 1]);
    }
  };

  const submit = () => {
    // ── React 19 async-transition gotcha ─────────────────────────
    // State updates inside `startTransition(async () => ...)` get
    // batched with the whole transition and don't flush until the
    // async callback resolves. That means if we set `step: "progress"`
    // *inside* the transition, the ProgressScreen never appears —
    // the wizard sits on the details step until the round-trip
    // finishes, then jumps straight to the chat page.
    //
    // Fix: hoist the pre-flight state updates OUT of the transition
    // so React commits them urgently. `startSubmit` still owns the
    // isSubmitting flag while the async work runs.
    setError(null);
    setStep("progress");

    startSubmit(async () => {
      // Minimum display time for the progress screen — even if the
      // whole round-trip is instant (warm caches, cached auth, etc.),
      // we want the user to feel the "creation" moment. Candy.ai
      // does the same thing; ~1.5s feels satisfying without being
      // draggy. If the network takes longer, this is a no-op.
      const MIN_PROGRESS_MS = 1500;
      const started = Date.now();

      const payload = {
        name: draft.name,
        appearance: {
          baseStyle: draft.baseStyle!,
          ethnicity: draft.ethnicity!,
          gender: draft.gender!,
          ageYears: draft.ageYears,
          eyeColor: draft.eyeColor!,
          hairStyle: draft.hairStyle!,
          hairColor: draft.hairColor!,
          bodyType: draft.bodyType!,
          bustSize: draft.bustSize,
          hipSize: draft.hipSize,
          clothing:
            draft.clothing.trim().length > 0 ? draft.clothing.trim() : null,
          fashionStyle: draft.fashionStyle,
        },
        personalitySlug: draft.personalitySlug!,
        relationshipSlug: draft.relationshipSlug!,
        occupationSlug: draft.occupationSlug!,
        voiceSlug: draft.voiceSlug!,
        hobbies: draft.hobbies,
        language: draft.language,
        nsfwOptIn: draft.nsfwOptIn,
        backstory:
          draft.backstory.trim().length > 0 ? draft.backstory.trim() : null,
      };
      const res = await createCharacterDraftAction(payload);
      if (!res.ok) {
        setError(res.error);
        setStep("details");
        return;
      }

      // Candy.ai-style handoff: open (or lazily create) the single
      // conversation for this (user, character) pair and take the user
      // straight to the chat. The preview screen is intentionally
      // skipped — companions come to life inside the chat window, not
      // on a static preview page.
      const convo = await startOrLoadConversationAction({
        characterId: res.characterId,
      });
      if (!convo.ok) {
        setError(convo.error);
        setStep("details");
        return;
      }

      // Wait out the minimum display window before redirecting so
      // the ProgressScreen animation has time to breathe. Only sleeps
      // if the round-trip finished ahead of the floor.
      const elapsed = Date.now() - started;
      if (elapsed < MIN_PROGRESS_MS) {
        await new Promise((r) => setTimeout(r, MIN_PROGRESS_MS - elapsed));
      }

      const slug = slugifyName(draft.name);
      router.push(
        `/ai-girlfriend/${slug}?conversation_id=${convo.conversation.id}`,
      );
    });
  };

  if (step === "progress") {
    return <ProgressScreen name={draft.name} />;
  }

  // Both `progress` and `preview` are handled by the early-returns
  // above; the terminal-state branches never fall through to the shell.
  // TS still needs a concrete narrow because it can't prove the negative
  // from an if-return chain — hence the explicit cast.
  const visualStep = step as Exclude<WizardStep, "progress" | "preview">;
  const stepCopy = STEP_COPY[visualStep];

  return (
    <WizardShell
      step={visualStep}
      title={stepCopy.title}
      subtitle={stepCopy.subtitle}
      onBack={goBack}
      onContinue={goNext}
      canContinue={canContinue}
      isSubmitting={isSubmitting}
      isFirst={isFirstVisualStep}
      isLast={isLastVisualStep}
      error={error}
    >
      {step === "gender" ? (
        <StepGender draft={draft} patch={patch} previews={previews} />
      ) : step === "look" ? (
        <StepLook draft={draft} patch={patch} previews={previews} />
      ) : step === "bond" ? (
        <StepBond
          draft={draft}
          patch={patch}
          previews={previews}
          relationships={lookups.relationships}
        />
      ) : step === "personality" ? (
        <StepPersonality
          draft={draft}
          patch={patch}
          previews={previews}
          personalities={lookups.personalities}
        />
      ) : step === "age" ? (
        <StepAge draft={draft} patch={patch} previews={previews} />
      ) : step === "heritage" ? (
        <StepHeritage draft={draft} patch={patch} previews={previews} />
      ) : step === "hair" ? (
        <StepHair draft={draft} patch={patch} previews={previews} />
      ) : step === "eyes" ? (
        <StepEyes draft={draft} patch={patch} previews={previews} />
      ) : step === "body" ? (
        <StepBody draft={draft} patch={patch} previews={previews} />
      ) : step === "fashion" ? (
        <StepFashion draft={draft} patch={patch} previews={previews} />
      ) : (
        <StepDetails draft={draft} patch={patch} lookups={lookups} />
      )}
    </WizardShell>
  );
}

// ─── Step titles + subtitles ─────────────────────────────────────────────
// Kept as a static map (over a switch) so it's obvious what copy each
// step shows and translation extraction can grep it directly later.

const STEP_COPY: Record<
  Exclude<WizardStep, "progress" | "preview">,
  { title: string; subtitle?: string }
> = {
  gender: {
    title: "Gender",
    subtitle: "How should we present your companion?",
  },
  look: {
    title: "Pick a look",
    subtitle: "Realistic photo or animated illustration.",
  },
  bond: {
    title: "What kind of bond?",
    subtitle: "Tap to choose.",
  },
  personality: {
    title: "How do they feel?",
    subtitle: "Pick a personality that fits the vibe.",
  },
  age: {
    title: "Age range",
  },
  heritage: {
    title: "Their look",
    subtitle: "Pick what feels right — you can tweak the portrait after.",
  },
  hair: {
    title: "Hair",
    subtitle: "Colour first, then a style.",
  },
  eyes: {
    title: "Eyes",
    subtitle: "The little detail that pulls a portrait together.",
  },
  body: {
    title: "Body",
    subtitle: "Choose a build that fits how you picture them.",
  },
  fashion: {
    title: "Fashion",
    subtitle: "The wardrobe we'll draw from when generating portraits.",
  },
  details: {
    title: "Finish them off",
    subtitle: "Name, occupation, voice, and any extras.",
  },
};
