"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Coins, Check } from "lucide-react";

interface GrantCreditsFormProps {
  userId: string;
}

export function GrantCreditsForm({ userId }: GrantCreditsFormProps) {
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleGrant = async () => {
    const credits = parseInt(amount);
    if (!credits || credits <= 0) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: credits }),
      });
      if (res.ok) {
        setSuccess(true);
        setAmount("");
        setTimeout(() => setSuccess(false), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Credits"
        className="w-20 h-7 rounded-lg border border-[#2a2a3d] bg-[#12121a] px-2 text-xs text-[#f1f0ff] focus:border-purple-500 focus:outline-none"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={handleGrant}
        disabled={!amount || isLoading}
        className="h-7 text-xs"
      >
        {success ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Coins className="h-3 w-3" />
        )}
        Grant
      </Button>
    </div>
  );
}
