"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/shared/presentation/utils";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

export type AuthTab = "login" | "signup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
}

/**
 * Modal that hosts both the Sign-in and Create-account flows in tabbed
 * form. Fully controlled on `open` and `tab` — the parent decides which
 * tab is active when opening (so clicking "Create Free Account" lands on
 * signup while "Login" lands on sign-in). On success, closes itself; the
 * caller is expected to call `router.refresh()` (already handled inside
 * each form).
 */
export function AuthDialog({ open, onOpenChange, tab, onTabChange }: Props) {
  const close = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-0 border border-[#2a2a34] bg-[#131318] shadow-2xl overflow-hidden rounded-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="relative hidden md:flex md:flex-col bg-gradient-to-br from-pink-900/40 via-rose-800/30 to-purple-900/40 overflow-hidden">
              <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-10">
                <div className="text-center">
                  <div className="w-28 h-28 rounded-full mx-auto mb-4 bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-4xl shadow-2xl">
                    💕
                  </div>
                  <p className="text-white/80 text-sm font-medium">
                    Your AI companion awaits
                  </p>
                  <p className="text-white/50 text-xs mt-2 max-w-[220px] mx-auto leading-relaxed">
                    Personalised chats, memory that grows with you, and
                    everything else you sign up for.
                  </p>
                </div>
              </div>
              <div className="relative z-10 pb-6 text-center">
                <div className="inline-flex items-baseline gap-0.5">
                  <span className="text-2xl font-bold text-white">amorify</span>
                  <span className="text-pink-400 text-2xl font-bold">.ai</span>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>

            <div className="p-8 relative">
              <Dialog.Close asChild>
                <button
                  className="absolute top-4 right-4 text-[#8a8a99] hover:text-white transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>

              <Dialog.Title className="text-2xl font-bold text-white mb-1">
                {tab === "login" ? "Welcome back" : "Create your account"}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-[#8a8a99] mb-5">
                {tab === "login"
                  ? "Sign in to continue chatting with your companions."
                  : "Free forever. 100 trial credits on us."}
              </Dialog.Description>

              <div className="flex gap-1 mb-5 rounded-lg bg-[#0a0a0f] border border-[#2a2a34] p-1">
                <TabButton
                  active={tab === "login"}
                  onClick={() => onTabChange("login")}
                >
                  Sign in
                </TabButton>
                <TabButton
                  active={tab === "signup"}
                  onClick={() => onTabChange("signup")}
                >
                  Create account
                </TabButton>
              </div>

              {tab === "login" ? (
                <LoginForm
                  onSuccess={close}
                  onSwitchToSignup={() => onTabChange("signup")}
                />
              ) : (
                <SignupForm
                  onSuccess={close}
                  onSwitchToLogin={() => onTabChange("login")}
                />
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-9 rounded-md text-sm font-medium transition-colors cursor-pointer",
        active
          ? "bg-pink-500 text-white shadow"
          : "text-[#8a8a99] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
