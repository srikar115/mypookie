"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Save, AlertTriangle } from "lucide-react";

interface MemoryEditorProps {
  companionId: string;
  initialMarkdown: string;
  version: number;
}

export function MemoryEditor({ companionId, initialMarkdown, version }: MemoryEditorProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch(`/api/companions/${companionId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryMarkdown: markdown, changeReason: "Manual edit" }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save memory.");
        return;
      }

      setMessage("Memory saved successfully.");
    } catch {
      setError("Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-emerald-400" />
            Companion Memory
            <span className="text-xs text-[#6b7280] font-normal ml-auto">
              Version {version}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 mb-4">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80">
              Memory is written in Markdown. Your companion uses this context in every conversation. Changes take effect immediately.
            </p>
          </div>

          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="min-h-[400px] font-mono text-xs leading-relaxed"
            placeholder="# Memory\n\nEdit your companion's memory here..."
          />

          {message && (
            <p className="text-sm text-emerald-400 mt-2">{message}</p>
          )}
          {error && (
            <p className="text-sm text-red-400 mt-2">{error}</p>
          )}

          <div className="flex justify-end mt-4">
            <Button onClick={handleSave} isLoading={isSaving}>
              <Save className="h-4 w-4" />
              Save Memory
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
