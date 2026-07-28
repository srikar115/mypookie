"use client";

import { useState, createContext, useContext } from "react";
import { AuthDialog, type AuthTab, type SessionUser } from "@/modules/identity/client";
import { PublicSidebar } from "./PublicSidebar";
import { PublicTopbar } from "./PublicTopbar";

type Category = "girls" | "anime" | "guys";

interface ShellContextValue {
  openLogin: () => void;
  openSignup: () => void;
  user: SessionUser | null;
  category: Category;
  setCategory: (c: Category) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function usePublicShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("usePublicShell must be used within PublicShell");
  return ctx;
}

interface Props {
  children: React.ReactNode;
  user: SessionUser | null;
}

export function PublicShell({ children, user }: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [category, setCategory] = useState<Category>("girls");

  const openLogin = () => {
    setAuthTab("login");
    setAuthOpen(true);
  };
  const openSignup = () => {
    setAuthTab("signup");
    setAuthOpen(true);
  };

  return (
    <ShellContext.Provider
      value={{ openLogin, openSignup, user, category, setCategory }}
    >
      <PublicTopbar
        user={user}
        onLoginClick={openLogin}
        onSignupClick={openSignup}
        onMobileMenuClick={() => setMobileMenuOpen((v) => !v)}
        category={category}
        onCategoryChange={setCategory}
      />

      <PublicSidebar user={user} onProtectedClick={openLogin} />

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 top-16 bottom-0 w-56 z-50 md:hidden">
            <PublicSidebar user={user} onProtectedClick={openLogin} />
          </div>
        </>
      )}

      <div className="pt-16 md:pl-56 min-h-screen">
        <main>{children}</main>
      </div>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        tab={authTab}
        onTabChange={setAuthTab}
      />
    </ShellContext.Provider>
  );
}
