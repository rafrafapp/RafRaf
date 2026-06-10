"use client";

import { useActionState, useMemo, useState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { changePassword } from "@/lib/auth/actions";
import { checkPassword } from "@/lib/validation/password";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import styles from "@/app/products/product-form.module.css";

type Props = {
  email: string;
  storeName: string;
  labels: Dictionary["settings"]["password"];
  passwordLabels: Dictionary["password"];
};

export function PasswordChangeForm({
  email,
  storeName,
  labels: s,
  passwordLabels,
}: Props) {
  const [state, formAction, pending] = useActionState(
    changePassword,
    {} as { ok?: boolean; error?: string },
  );
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = useMemo(
    () => checkPassword(next, { email, storeName }),
    [next, email, storeName],
  );
  const mismatch = confirm.length > 0 && next !== confirm;
  const errs = s.errors as Record<string, string>;

  return (
    <form action={formAction} className={styles.form}>
      {state.error && (
        <p className={styles.error} role="alert">
          {errs[state.error] ?? errs.failed}
        </p>
      )}
      {state.ok && (
        <p className={styles.muted} role="status">
          {s.changed}
        </p>
      )}

      <label className={styles.label}>
        {s.current}
        <input
          className={styles.input}
          type="password"
          name="current_password"
          autoComplete="current-password"
          required
          dir="ltr"
        />
      </label>

      <label className={styles.label}>
        {s.new}
        <input
          className={styles.input}
          type="password"
          name="new_password"
          autoComplete="new-password"
          required
          dir="ltr"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      {next.length > 0 && (
        <PasswordStrengthMeter strength={strength} labels={passwordLabels} />
      )}

      <label className={styles.label}>
        {s.confirm}
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
          {errs.mismatch}
        </p>
      )}

      <button
        type="submit"
        className={styles.submit}
        disabled={pending || !strength.acceptable || mismatch}
      >
        {pending ? s.saving : s.save}
      </button>
    </form>
  );
}
