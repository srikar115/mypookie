"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw } from "lucide-react";

export function RegenerateLookButton({ companionId }: { companionId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleRegenerate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/companions/${companionId}/regenerate-avatar`, {
        method: "POST",
      });
      if (res.ok) {
        setDone(true);
        // Refresh the page after a short delay to show the new avatar
        setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      // fail silently
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400 py-2">
        <Camera className="h-3.5 w-3.5" />
        Generating new look…
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={handleRegenerate} disabled={isLoading}>
      {isLoading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <Camera className="h-4 w-4" />
      )}
      {isLoading ? "Generating…" : "Regenerate Look"}
    </Button>
  );
}
