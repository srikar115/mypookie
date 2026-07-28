"use server";

import { AuthError } from "next-auth";
import { signIn } from "../../infrastructure/nextauth";
import { loginSchema } from "../schemas/login.schema";

export type LoginFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      fieldErrors: Partial<Record<string, string>>;
      formError?: string;
    };

const INITIAL: LoginFormState = { status: "idle" };

export async function loginAction(
  previous: LoginFormState = INITIAL,
  formData: FormData,
): Promise<LoginFormState> {
  void previous;
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: "error", fieldErrors };
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
        formError: "Invalid email or password.",
      };
    }
    throw error;
  }

  return { status: "success" };
}
