"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/get-dictionary";
import {
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  type AuthState,
} from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";
import { checkPassword } from "@/lib/validation/password";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { Spinner } from "@/components/Spinner";
import styles from "./login.module.css";

type Props = {
  auth: Dictionary["auth"];
  password: Dictionary["password"];
  urlError?: string;
};

const empty: AuthState = {};

export function LoginForm({ auth, password: pwLabels, urlError }: Props) {
  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inState, inAction, inPending] = useActionState(signInWithPassword, empty);
  const [upState, upAction, upPending] = useActionState(signUpWithPassword, empty);

  const isSignIn = tab === "in";
  const state = isSignIn ? inState : upState;
  const pending = isSignIn ? inPending : upPending;

  // On signup, gate the submit on password strength (>= جيد). The server
  // enforces the same check, so this is just UX.
  const strength = useMemo(
    () => checkPassword(password, { email }),
    [password, email],
  );
  const blockSignUp = !isSignIn && !strength.acceptable;

  const errors = auth.errors as Record<string, string>;
  const notices = auth.notices as Record<string, string>;
  const errorMsg =
    (state.error && errors[state.error]) ||
    (urlError && errors[urlError]) ||
    null;
  const noticeMsg = state.notice ? notices[state.notice] : null;

  return (
    <div>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isSignIn}
          className={styles.tab}
          onClick={() => setTab("in")}
        >
          {auth.signInTab}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isSignIn}
          className={styles.tab}
          onClick={() => setTab("up")}
        >
          {auth.signUpTab}
        </button>
      </div>

      <form action={signInWithGoogle} className={styles.googleForm}>
        <button type="submit" className={styles.googleButton}>
          <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C41.38 39.012 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
            />
          </svg>
          {auth.google}
        </button>
      </form>

      <div className={styles.divider}>
        <span>{auth.or}</span>
      </div>

      {errorMsg && (
        <p className={styles.error} role="alert">
          {errorMsg}
        </p>
      )}
      {noticeMsg && (
        <p className={styles.notice} role="status">
          {noticeMsg}
        </p>
      )}

      <form action={isSignIn ? inAction : upAction} className={styles.form}>
        <label className={styles.label}>
          {auth.email}
          <input
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          {auth.password}
          <span className={styles.passwordWrap}>
            <input
              className={styles.input}
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
              minLength={isSignIn ? undefined : MIN_PASSWORD_LENGTH}
              required
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? auth.hidePassword : auth.showPassword}
              aria-pressed={showPassword}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </span>
          {!isSignIn && (
            <span className={styles.hint}>{auth.passwordHint}</span>
          )}
        </label>

        {isSignIn && (
          <Link href="/forgot-password" className={styles.forgotLink}>
            {auth.forgotLink}
          </Link>
        )}

        {!isSignIn && password.length > 0 && (
          <PasswordStrengthMeter strength={strength} labels={pwLabels} />
        )}

        <button
          type="submit"
          className={styles.submit}
          disabled={pending || blockSignUp}
        >
          {pending && <Spinner />}
          {isSignIn ? auth.signInButton : auth.signUpButton}
        </button>
      </form>

      <button
        type="button"
        className={styles.switchLink}
        onClick={() => setTab(isSignIn ? "up" : "in")}
      >
        {isSignIn ? auth.noAccount : auth.haveAccount}
      </button>

      <p className={styles.consent}>
        {auth.agree}{" "}
        <Link href="/terms" target="_blank" rel="noopener noreferrer">
          {auth.terms}
        </Link>{" "}
        {auth.and}{" "}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer">
          {auth.privacy}
        </Link>
      </p>
    </div>
  );
}
