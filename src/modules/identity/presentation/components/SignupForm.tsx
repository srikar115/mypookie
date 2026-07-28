"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  registerAction,
  type RegisterFormState,
} from "../actions/register.action";

const INITIAL: RegisterFormState = { status: "idle" };

interface Props {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSuccess, onSwitchToLogin }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(registerAction, INITIAL);
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
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8a99]" />
          <input
            name="name"
            type="text"
            placeholder="Name (optional)"
            autoComplete="name"
            maxLength={80}
            className="w-full h-12 pl-10 pr-3 rounded-lg bg-[#0a0a0f] border border-[#2a2a34] text-white text-sm placeholder:text-[#6b6b76] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 transition-colors"
          />
        </div>
      </div>

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
            placeholder="Password (8+ chars, mixed case, digit)"
            autoComplete="new-password"
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

      <div className="space-y-2 pt-1">
        <ConsentRow name="age18" error={fieldErrors.age18}>
          I confirm I am <strong className="text-white">18 or older</strong>
        </ConsentRow>
        <ConsentRow name="acceptTos" error={fieldErrors.acceptTos}>
          I accept the <PolicyLink href="/terms">Terms of Service</PolicyLink>
        </ConsentRow>
        <ConsentRow name="acceptPrivacy" error={fieldErrors.acceptPrivacy}>
          I accept the <PolicyLink href="/privacy">Privacy Policy</PolicyLink>
        </ConsentRow>
        <ConsentRow name="acceptContent" error={fieldErrors.acceptContent}>
          I accept the <PolicyLink href="/safety">Content Policy</PolicyLink>
        </ConsentRow>
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full mt-4"
        disabled={pending}
      >
        {pending ? "Creating account…" : "Create free account"}
      </Button>

      <p className="text-center text-xs text-[#8a8a99] pt-2">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-pink-400 font-medium hover:text-pink-300 cursor-pointer"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

interface ConsentRowProps {
  name: string;
  error?: string;
  children: React.ReactNode;
}

/**
 * Consent checkbox row. The checkbox and its clickable text are wrapped in a
 * `<label>` linked via `htmlFor`, while inline `<Link>` elements live OUTSIDE
 * the label — this keeps the checkbox toggle-on-text-click behaviour without
 * fighting Next.js `<Link>` navigation.
 */
function ConsentRow({ name, error, children }: ConsentRowProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          name={name}
          className="mt-0.5 h-4 w-4 rounded border-[#2a2a34] bg-[#0a0a0f] accent-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/40 cursor-pointer shrink-0"
        />
        <label
          htmlFor={id}
          className="text-xs text-[#c4c2d4] leading-relaxed cursor-pointer hover:text-white transition-colors"
        >
          {children}
        </label>
      </div>
      {error && <p className="mt-0.5 ml-6 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function PolicyLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      className="text-pink-400 hover:text-pink-300 underline underline-offset-2"
    >
      {children}
    </Link>
  );
}
