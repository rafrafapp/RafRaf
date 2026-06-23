"use client";

import { useEffect } from "react";
import styles from "./error.module.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in dev; swap for a real error reporter in production.
    console.error("[RafRaf error boundary]", error);
  }, [error]);

  return (
    <div className={styles.page} dir="rtl">
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden>⚠️</span>
        <h1 className={styles.title}>حدث خطأ غير متوقع</h1>
        <p className={styles.body}>
          نأسف على ذلك — حاول مرة أخرى أو أعد تحميل الصفحة.
        </p>
        {error.digest && (
          <p className={styles.digest} dir="ltr">
            {error.digest}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={reset}>
            إعادة المحاولة
          </button>
          <a href="/dashboard" className={styles.btnGhost}>
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}
