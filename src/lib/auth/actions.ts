"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { checkPassword } from "@/lib/validation/password";
import { logSecurityEvent, getRecentFailedLogins } from "@/lib/security/events";
import { rateLimit } from "@/lib/security/ratelimit";

// Form state returned to the client. `error`/`notice` are i18n *codes* the
// client maps to localized copy — the server never builds user-facing strings,
// so messages stay bilingual and we don't leak which field was wrong.
export type AuthState = { error?: string; notice?: string };

// Login lockout (rafraf_security.md, Layer 3): 5 failures / 15 min, then locked.
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MIN = 15;

async function getOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid_input" };

  const email = parsed.data.email;
  const ip = await clientIp();

  // Per-IP rate limit (Layer 2) — was previously in middleware; moved here so the
  // Edge runtime doesn't bundle @upstash/redis. No-op until Upstash is configured.
  if (!(await rateLimit(`login:${ip}`, 20)).success) {
    await logSecurityEvent("RATE_LIMIT_HIT", { ip, message: "POST /login" });
    return { error: "locked" };
  }

  // Lockout: too many recent failed attempts for this email → block + alert.
  if ((await getRecentFailedLogins(email, LOCKOUT_WINDOW_MIN)) >= LOCKOUT_THRESHOLD) {
    await logSecurityEvent("LOGIN_LOCKOUT", {
      email,
      ip,
      message: "too many failed attempts",
    });
    return { error: "locked" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await logSecurityEvent("FAILED_LOGIN", { email, ip });
    if (error.code === "email_not_confirmed") return { error: "email_not_confirmed" };
    // Generic on purpose — don't reveal whether the email exists.
    return { error: "invalid_credentials" };
  }

  redirect("/dashboard");
}

export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === "password");
    return { error: weak ? "weak_password" : "invalid_input" };
  }

  // Server-side strength enforcement (the client meter is bypassable).
  if (!checkPassword(parsed.data.password, { email: parsed.data.email }).acceptable) {
    return { error: "weak_password" };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    // Surface the real cause in the server logs — the client only ever gets an
    // i18n code (so we don't leak internals or which field was wrong).
    console.error("[signup] Supabase auth error:", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    const code = error.code ?? "";
    const msg = (error.message ?? "").toLowerCase();
    if (code === "weak_password") return { error: "weak_password" };
    if (code === "user_already_exists" || code === "email_exists")
      return { error: "email_in_use" };
    if (error.status === 429 || code.includes("rate_limit") || msg.includes("rate limit"))
      return { error: "rate_limited" };
    // Email confirmation is ON but Supabase couldn't send the email (no SMTP
    // configured, or the built-in mailer is rate-limited/failing) — the most
    // common cause of an otherwise-mysterious signup failure. Tell the merchant
    // to use Google sign-in for now.
    if (
      code === "unexpected_failure" ||
      code === "email_provider_error" ||
      msg.includes("error sending") ||
      msg.includes("confirmation email") ||
      msg.includes("sending confirmation")
    )
      return { error: "email_send_failed" };
    return { error: "signup_failed" };
  }

  // With confirmations on, an existing email returns a user with no identities.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { error: "email_in_use" };
  }

  // No session means a confirmation email was sent.
  if (!data.session) return { notice: "check_email" };

  redirect("/dashboard");
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type PasswordChangeState = { ok?: boolean; error?: string };

// Change the signed-in user's password. Requires the current password (verified
// by re-authenticating) and enforces the strength policy server-side.
export async function changePassword(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "unauthorized" };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next !== confirm) return { error: "mismatch" };

  // Prove knowledge of the current password before allowing a change.
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyErr) return { error: "wrong_current" };

  // Strength enforcement (same policy as signup; personal check vs email + store).
  const { data: m } = await supabase
    .from("merchants")
    .select("store_name")
    .eq("id", user.id)
    .maybeSingle();
  if (
    !checkPassword(next, {
      email: user.email,
      storeName: m?.store_name ?? undefined,
    }).acceptable
  ) {
    return { error: "weak" };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: "failed" };
  return { ok: true };
}
