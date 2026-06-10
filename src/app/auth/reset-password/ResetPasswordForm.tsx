"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Dictionary } from "@/i18n/get-dictionary";
import { createClient } from "@/lib/supabase/client";
import { checkPassword } from "@/lib/validation/password";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import styles from "@/app/login/login.module.css";

type Status = "verifying" | "ready" | "invalid" | "done";

export function ResetPasswordForm({
  labels,
  passwordLabels,
}: {
  labels: Dictionary["resetPassword"];
  passwordLabels: Dictionary["password"];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Establish the recovery session from the URL on mount. Supports the project's
  // token_hash email template (primary), the PKCE ?code= flow, and the implicit
  // hash flow (auto-handled by the browser client) as a fallback.
  useEffect(() => {
    let active = true;
    const finish = (ok: boolean) => active && setStatus(ok ? "ready" : "invalid");

    (async () => {
      const supabase = createClient();
      const sp = new URLSearchParams(window.location.search);
      const tokenHash = sp.get("token_hash");
      const type = (sp.get("type") ?? "recovery") as EmailOtpType;
      const code = sp.get("code");

      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          return finish(!error);
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) return finish(true);
        }
        // Implicit (hash) flow or an already-active recovery session — the client
        // parses the hash asynchronously, so re-check once after a short delay.
        let { data } = await supabase.auth.getSession();
        if (!data.session) {
          await new Promise((r) => setTimeout(r, 300));
          ({ data } = await supabase.auth.getSession());
        }
        finish(Boolean(data.session));
      } catch {
        finish(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const strength = useMemo(() => checkPassword(pw), [pw]);
  const mismatch = confirm.length > 0 && pw !== confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!strength.acceptable) {
      setError(labels.weak);
      return;
    }
    if (pw !== confirm) {
      setError(labels.mismatch);
      return;
    }
    setError(null);
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) {
      setPending(false);
      setError(labels.failed);
      return;
    }
    setStatus("done");
    router.replace("/dashboard");
  }

  if (status === "verifying") {
    return (
      <p className={styles.notice} role="status">
        {labels.verifying}
      </p>
    );
  }

  if (status === "invalid") {
    return (
      <div>
        <p className={styles.error} role="alert">
          {labels.invalidLink}
        </p>
        <Link href="/forgot-password" className={styles.backLink}>
          {labels.requestNew}
        </Link>
      </div>
    );
  }

  if (status === "done") {
    return (
      <p className={styles.notice} role="status">
        {labels.success}
      </p>
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
        {labels.new}
        <input
          className={styles.input}
          type="password"
          name="new_password"
          autoComplete="new-password"
          required
          dir="ltr"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </label>
      {pw.length > 0 && (
        <PasswordStrengthMeter strength={strength} labels={passwordLabels} />
      )}

      <label className={styles.label}>
        {labels.confirm}
        <input
          className={styles.input}
          type="password"
          name="confirm_password"
          autoComplete="new-password"
          required
          dir="ltr"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {mismatch && (
        <p className={styles.error} role="alert">
          {labels.mismatch}
        </p>
      )}

      <button
        type="submit"
        className={styles.submit}
        disabled={pending || !strength.acceptable || mismatch}
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
