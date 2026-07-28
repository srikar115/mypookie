"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateCharacterImageAction } from "../actions/regenerate-image.action";
import { commitCharacterAction } from "../actions/commit.action";

interface Props {
  characterId: string;
  characterName: string;
  initialImageUrl: string | null;
  initialRegenerationsRemaining: number;
  summary: {
    personality: string;
    relationship: string;
    occupation: string;
    hobbies: readonly string[];
    bio: string | null;
  };
}

export function PreviewScreen({
  characterId,
  characterName,
  initialImageUrl,
  initialRegenerationsRemaining,
  summary,
}: Props) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [remaining, setRemaining] = useState(initialRegenerationsRemaining);
  const [error, setError] = useState<string | null>(null);
  const [isRegenerating, startRegenerate] = useTransition();
  const [isCommitting, startCommit] = useTransition();

  const handleRegenerate = () =>
    startRegenerate(async () => {
      setError(null);
      const res = await regenerateCharacterImageAction({ characterId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setImageUrl(res.imageUrl);
      setRemaining(res.regenerationsRemaining);
    });

  const handleCommit = () =>
    startCommit(async () => {
      setError(null);
      const res = await commitCharacterAction({ characterId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/");
      router.refresh();
    });

  const totalMax = 2;
  const used = totalMax - remaining;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-8">
      <div className="relative aspect-[3/4] w-full max-w-[520px] mx-auto lg:mx-0 rounded-3xl overflow-hidden bg-[#141420] border border-[#26263a]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={characterName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#5a5a66]">
            No preview yet.
          </div>
        )}
        {isRegenerating ? (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 text-purple-300 mx-auto animate-spin" />
              <div className="mt-3 text-sm text-white">Regenerating…</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col">
        <div className="rounded-2xl bg-[#111119] border border-[#26263a] p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{characterName}</h2>
            {summary.bio ? (
              <p className="text-sm text-[#c4c2d4] mt-1">{summary.bio}</p>
            ) : null}
          </div>
          <dl className="text-sm space-y-2">
            <Row label="Personality" value={summary.personality} />
            <Row label="Relationship" value={summary.relationship} />
            <Row label="Occupation" value={summary.occupation} />
            {summary.hobbies.length > 0 ? (
              <Row label="Hobbies" value={summary.hobbies.join(", ")} />
            ) : null}
          </dl>
        </div>

        <div className="mt-4 rounded-2xl bg-[#111119] border border-[#26263a] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-white">
                Regenerate image
              </div>
              <div className="text-xs text-[#8a8a99]">
                {used}/{totalMax} used
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              isLoading={isRegenerating}
              disabled={remaining === 0 || isCommitting}
            >
              <RefreshCw className="h-4 w-4" />
              {remaining === 0 ? "Locked" : "Regenerate"}
            </Button>
          </div>
          <p className="text-xs text-[#8a8a99]">
            Regeneration keeps her face consistent while varying pose, outfit, and scene.
          </p>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
            {error}
          </div>
        ) : null}

        <Button
          size="xl"
          onClick={handleCommit}
          isLoading={isCommitting}
          disabled={isRegenerating}
          className="mt-6"
        >
          <Heart className="h-5 w-5" />
          Bring my AI to Life
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#8a8a99]">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
    </div>
  );
}
