"use client";

import { useState } from "react";

interface ModelToggleProps {
  modelId: string;
  isEnabled: boolean;
}

export function ModelToggle({ modelId, isEnabled }: ModelToggleProps) {
  const [enabled, setEnabled] = useState(isEnabled);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/models/${modelId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !enabled }),
      });
      if (res.ok) setEnabled(!enabled);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={isLoading}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 focus:ring-offset-[#0a0a0f] disabled:opacity-50 ${
        enabled ? "bg-purple-500" : "bg-[#2a2a3d]"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
