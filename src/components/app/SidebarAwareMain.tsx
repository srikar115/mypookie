"use client";

import { useEffect, useState } from "react";

export function SidebarAwareMain({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Read initial state
    const stored = localStorage.getItem("sidebar-collapsed");
    setCollapsed(stored === "true");

    // Listen for storage changes (other tabs) and custom sidebar toggle events
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sidebar-collapsed") setCollapsed(e.newValue === "true");
    };
    const onToggle = (e: CustomEvent<boolean>) => setCollapsed(e.detail);

    window.addEventListener("storage", onStorage);
    window.addEventListener("sidebar-toggle", onToggle as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sidebar-toggle", onToggle as EventListener);
    };
  }, []);

  return (
    <div
      className="transition-all duration-200"
      style={{ marginLeft: collapsed ? 64 : 240 }}
    >
      {children}
    </div>
  );
}
