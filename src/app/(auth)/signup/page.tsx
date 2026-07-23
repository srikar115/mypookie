"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, UserPlus, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  ageConfirmed: boolean;
  tosAccepted: boolean;
  privacyAccepted: boolean;
  contentPolicyAccepted: boolean;
}

function CheckboxField({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
        checked
          ? "border-purple-500/40 bg-purple-500/5"
          : "border-[#2a2a3d] bg-[#0a0a0f] hover:border-[#3a3a50]"
      )}
    >
      <div
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors mt-0.5",
          checked
            ? "border-purple-500 bg-purple-500"
            : "border-[#3a3a50]"
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" />}
      </div>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-[#c4c2d4] leading-relaxed">{children}</span>
    </label>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    ageConfirmed: false,
    tosAccepted: false,
    privacyAccepted: false,
    contentPolicyAccepted: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const update = (field: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.email.includes("@")) return "Valid email is required.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    if (!form.ageConfirmed) return "You must confirm that you are 18 or older.";
    if (!form.tosAccepted) return "You must accept the Terms of Service.";
    if (!form.privacyAccepted) return "You must accept the Privacy Policy.";
    if (!form.contentPolicyAccepted) return "You must accept the Content Policy.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          ageConfirmed: form.ageConfirmed,
          tosAccepted: form.tosAccepted,
          privacyAccepted: form.privacyAccepted,
          contentPolicyAccepted: form.contentPolicyAccepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Signup failed. Please try again.");
        return;
      }

      router.push("/login?registered=true");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-[#2a2a3d] bg-[#12121a] p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#f1f0ff] mb-1">Create your account</h1>
          <p className="text-sm text-[#6b7280]">Start with free trial credits</p>
        </div>

        {/* Age warning */}
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 mb-6">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            Honey Bunny is an adults-only platform for users aged <strong>18+</strong>. You must confirm your age before creating an account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Display Name"
            type="text"
            placeholder="How should we call you?"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            autoComplete="email"
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              required
              autoComplete="new-password"
              hint="Minimum 8 characters"
            />
            <button
              type="button"
              className="absolute right-3 top-8 text-[#6b7280] hover:text-[#c4c2d4] transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Repeat your password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            required
            autoComplete="new-password"
          />

          {/* Compliance checkboxes */}
          <div className="space-y-3 pt-1">
            <CheckboxField
              id="ageConfirmed"
              checked={form.ageConfirmed}
              onChange={(v) => update("ageConfirmed", v)}
            >
              <strong>I confirm I am 18 years of age or older.</strong> I understand this platform is for adults only.
            </CheckboxField>

            <CheckboxField
              id="tosAccepted"
              checked={form.tosAccepted}
              onChange={(v) => update("tosAccepted", v)}
            >
              I accept the{" "}
              <Link href="/terms" target="_blank" className="text-purple-400 hover:underline font-medium">
                Terms of Service
              </Link>
            </CheckboxField>

            <CheckboxField
              id="privacyAccepted"
              checked={form.privacyAccepted}
              onChange={(v) => update("privacyAccepted", v)}
            >
              I accept the{" "}
              <Link href="/privacy" target="_blank" className="text-purple-400 hover:underline font-medium">
                Privacy Policy
              </Link>
            </CheckboxField>

            <CheckboxField
              id="contentPolicyAccepted"
              checked={form.contentPolicyAccepted}
              onChange={(v) => update("contentPolicyAccepted", v)}
            >
              I accept the Content Policy and confirm I will not attempt to generate illegal, minor-related, or non-consensual content.
            </CheckboxField>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading} size="lg">
            <UserPlus className="h-4 w-4" />
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-[#6b7280] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-purple-400 hover:text-purple-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
