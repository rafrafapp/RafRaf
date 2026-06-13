"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/get-dictionary";
import { createClient } from "@/lib/supabase/client";
import { sendPasswordResetEmail } from "@/lib/auth/actions";
import { Spinner } from "@/components/Spinner";
import styles from "@/app/login/login.module.css";

// Request a password-reset email. Calls Supabase directly from the browser. To
// avoid account enumeration we ALWAYS show the same generic success message
// (resetPasswordForEmail itself doesn't error for unknown emails); only local
// email-format validation surfaces an inline error.
export function ForgotPasswordForm({
  labels,
}: {
  labels: Dictionary["forgotPassword"];
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError(labels.invalidEmail);
      return;
    }
    setError(null);
    setPending(true);
    try {
      // Prefer RafRaf's own Resend-API email (independent of Supabase SMTP).
      const res = await sendPasswordResetEmail(value);
      // Fall back to Supabase's built-in mailer if we didn't send it ourselves.
      if (!res.sent) {
        await createClient().auth.resetPasswordForEmail(value, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
      }
    } catch {
      // Swallow — never reveal whether the email exists or that infra failed.
    }
    setPending(false);
    setDone(true);
  }

  if (done) {
    return (
      <div>
        <p className={styles.notice} role="status">
          {labels.success}
        </p>
        <Link href="/login" className={styles.backLink}>
          {labels.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <label className={styles.label}>
        {labels.email}
        <input
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            {labels.submitting}
          </>
        ) : (
          labels.submit
        )}
      </button>
      <Link href="/login" className={styles.backLink}>
        {labels.backToLogin}
      </Link>
    </form>
  );
}
