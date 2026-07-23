"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserX, UserCheck } from "lucide-react";

interface UserStatusToggleProps {
  userId: string;
  currentStatus: string;
}

export function UserStatusToggle({ userId, currentStatus }: UserStatusToggleProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = async () => {
    const newStatus = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setIsLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setStatus(newStatus);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={status === "ACTIVE" ? "destructive" : "secondary"}
      size="sm"
      onClick={toggle}
      disabled={isLoading}
      className="h-7 text-xs"
    >
      {status === "ACTIVE" ? (
        <>
          <UserX className="h-3 w-3" />
          Suspend
        </>
      ) : (
        <>
          <UserCheck className="h-3 w-3" />
          Activate
        </>
      )}
    </Button>
  );
}
