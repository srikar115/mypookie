import { z } from "zod";

/**
 * Transport-shape validation for the signup form. Business invariants
 * (email format, password strength) live in the domain layer — the schema
 * here only rejects the shapes so bad that dispatching the use case is
 * pointless.
 */
export const registerSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
  name: z.string().max(80).optional(),
  age18: z.literal(true, {
    error: "You must confirm you are 18 or older",
  }),
  acceptTos: z.literal(true, {
    error: "You must accept the Terms of Service",
  }),
  acceptPrivacy: z.literal(true, {
    error: "You must accept the Privacy Policy",
  }),
  acceptContent: z.literal(true, {
    error: "You must accept the Content Policy",
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
