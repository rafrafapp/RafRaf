import { z } from "zod";

// Security policy (rafraf_security.md, Layer 3): minimum password length is 10.
// Leaked-password / reuse checks are enforced by Supabase Auth, not here.
export const MIN_PASSWORD_LENGTH = 10;

export const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const signUpSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
