"use client";

import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import styles from "./LanguageSwitcher.module.css";

type Props = {
  current: Locale;
  labels: { arabic: string; english: string };
};

export function LanguageSwitcher({ current, labels }: Props) {
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    startTransition(() => {
      void setLocale(locale);
    });
  }

  return (
    <div className={styles.switcher} role="group" aria-label="Language">
      <button
        type="button"
        className={styles.button}
        aria-pressed={current === "ar"}
        disabled={isPending}
        onClick={() => switchTo("ar")}
      >
        {labels.arabic}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-pressed={current === "en"}
        disabled={isPending}
        onClick={() => switchTo("en")}
      >
        {labels.english}
      </button>
    </div>
  );
}
