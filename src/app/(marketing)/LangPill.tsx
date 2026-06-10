"use client";

import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import styles from "./landing.module.css";

// AR/EN toggle reusing the app's cookie-based setLocale (matches the rest of the
// app). The landing copy itself stays Arabic.
export function LangPill({ current }: { current: Locale }) {
  const [pending, start] = useTransition();
  const to = (l: Locale) => {
    if (l !== current) start(() => void setLocale(l));
  };
  return (
    <div className={`${styles.langPill} ${styles.label}`} role="group" aria-label="Language">
      <button
        type="button"
        className={`${styles.langBtn} ${current === "ar" ? styles.langBtnActive : ""}`}
        onClick={() => to("ar")}
        disabled={pending}
      >
        AR
      </button>
      <button
        type="button"
        className={`${styles.langBtn} ${current === "en" ? styles.langBtnActive : ""}`}
        onClick={() => to("en")}
        disabled={pending}
      >
        EN
      </button>
    </div>
  );
}
