"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { getServerContext } from "@/composition/server-context";
import { registerSchema } from "../schemas/register.schema";
import { createRegisterUserUseCase } from "../../composition/identity.dependencies";
import { signIn } from "../../infrastructure/nextauth";
import type { RegisterUserError } from "../../application/use-cases/register-user.use-case";

export type RegisterFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      fieldErrors: Partial<Record<string, string>>;
      formError?: string;
    };

const INITIAL: RegisterFormState = { status: "idle" };

export async function registerAction(
  previous: RegisterFormState = INITIAL,
  formData: FormData,
): Promise<RegisterFormState> {
  void previous;
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") ?? undefined,
    age18: formData.get("age18") === "on",
    acceptTos: formData.get("acceptTos") === "on",
    acceptPrivacy: formData.get("acceptPrivacy") === "on",
    acceptContent: formData.get("acceptContent") === "on",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", fieldErrors };
  }

  const hdrs = await headers();
  const ctx = await getServerContext();
  const useCase = createRegisterUserUseCase(ctx);

  const result = await useCase.execute({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name ?? null,
    ageConfirmed: parsed.data.age18,
    tosAccepted: parsed.data.acceptTos,
    privacyAccepted: parsed.data.acceptPrivacy,
    contentPolicyAccepted: parsed.data.acceptContent,
    signupIp:
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      null,
    signupUserAgent: hdrs.get("user-agent") ?? null,
  });

  if (!result.ok) {
    return { status: "error", ...toFormErrors(result.error) };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        fieldErrors: {},
        formError:
          "Account created, but automatic sign-in failed. Please sign in manually.",
      };
    }
    throw error;
  }

  return { status: "success" };
}

function toFormErrors(error: RegisterUserError): {
  fieldErrors: Record<string, string>;
  formError?: string;
} {
  switch (error.type) {
    case "invalid-email":
      return { fieldErrors: { email: emailMessage(error.reason) } };
    case "invalid-password":
      return { fieldErrors: { password: passwordMessage(error.reason) } };
    case "email-already-in-use":
      return {
        fieldErrors: { email: "An account with this email already exists" },
      };
    case "compliance-not-accepted":
      return {
        fieldErrors: {},
        formError: "Please confirm all consent checkboxes to continue.",
      };
    default: {
      const _exhaustive: never = error;
      void _exhaustive;
      return { fieldErrors: {}, formError: "Something went wrong. Try again." };
    }
  }
}

function emailMessage(reason: string): string {
  switch (reason) {
    case "empty":
      return "Email is required";
    case "too-long":
      return "Email is too long";
    case "malformed":
      return "Please enter a valid email";
    default:
      return "Invalid email";
  }
}

function passwordMessage(reason: string): string {
  switch (reason) {
    case "too-short":
      return "Password must be at least 8 characters";
    case "too-long":
      return "Password is too long (max 128 characters)";
    case "missing-lowercase":
      return "Password must contain a lowercase letter";
    case "missing-uppercase":
      return "Password must contain an uppercase letter";
    case "missing-digit":
      return "Password must contain a digit";
    default:
      return "Invalid password";
  }
}
