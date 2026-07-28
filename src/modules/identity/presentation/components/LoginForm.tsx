"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loginAction,
  type LoginFormState,
} from "../actions/login.action";

const INITIAL: LoginFormState = { status: "idle" };

interface Props {
  onSuccess: () => void;
  onSwitchToSignup: () => void;
}

export function LoginForm({ onSuccess, onSwitchToSignup }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
      router.refresh();
    }
  }, [state.status, onSuccess, router]);

  const fieldErrors = state.status === "error" ? state.fieldErrors : {};
  const formError = state.status === "error" ? state.formError : undefined;

  return (
    <form action={action} className="space-y-3" noValidate>
      {formError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {formError}
        </div>
      )}

      <div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8a99]" />
          <input
            name="email"
            type="email"
            placeholder="E-mail"
            autoComplete="email"
            className="w-full h-12 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#2a2a34] text-white text-sm placeholder:text-[#6b6b76] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 transition-colors"
            required
          />
        </div>
        {fieldErrors.email && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
        )}
      </div>

      <div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8a99]" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full h-12 pl-10 pr-10 rounded-lg bg-[#0a0a0f] border border-[#2a2a34] text-white text-sm placeholder:text-[#6b6b76] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 transition-colors"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a99] hover:text-white cursor-pointer"
            aria-label="Toggle password visibility"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {fieldErrors.password && (
          <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full mt-4"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-[#8a8a99] pt-2">
        Don&apos;t have an account yet?{" "}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-pink-400 font-medium hover:text-pink-300 cursor-pointer"
        >
          Create one
        </button>
      </p>
    </form>
  );
}
