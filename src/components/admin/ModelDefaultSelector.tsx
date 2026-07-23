"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface AiModelSlim {
  id: string;
  name: string;
  slug: string;
}

interface ModelDefaultSelectorProps {
  modelType: "CHAT" | "IMAGE" | "VIDEO";
  currentDefault: AiModelSlim | null;
  availableModels: AiModelSlim[];
  adminId: string;
}

export function ModelDefaultSelector({
  modelType,
  currentDefault,
  availableModels,
  adminId,
}: ModelDefaultSelectorProps) {
  const [selected, setSelected] = useState(currentDefault?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/admin/models/defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelType, modelId: selected, adminId }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#2a2a3d] bg-[#0c0c14] p-4">
      <p className="text-xs font-semibold text-[#c4c2d4] mb-3">
        Default {modelType.charAt(0) + modelType.slice(1).toLowerCase()} Model
      </p>
      {availableModels.length === 0 ? (
        <p className="text-xs text-[#4b5563]">No enabled models available.</p>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-[#2a2a3d] bg-[#12121a] px-3 py-2 text-sm text-[#f1f0ff] focus:border-purple-500 focus:outline-none mb-3"
          >
            <option value="">Select model...</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!selected || isSaving}
            className="w-full"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              "Set as Default"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
