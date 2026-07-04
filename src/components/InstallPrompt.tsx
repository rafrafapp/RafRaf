"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./InstallPrompt.module.css";

type Labels = { text: string; install: string; dismiss: string };

// Chrome's install event — not yet in the TS DOM lib.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VISITS_KEY = "rafraf_visits";
const DISMISS_KEY = "rafraf_install_dismissed";

// "أضف رف رف لشاشتك الرئيسية" banner. Appears from the 3rd visit onward when the
// browser offers `beforeinstallprompt` (Chrome/Android — iOS has no such event).
// Dismissing it persists — we never nag again.
export function InstallPrompt({ labels }: { labels: Labels }) {
  const pathname = usePathname() || "";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
      // Count one visit per browser session.
      if (!sessionStorage.getItem(VISITS_KEY)) {
        sessionStorage.setItem(VISITS_KEY, "1");
        const visits = Number(localStorage.getItem(VISITS_KEY) || "0") + 1;
        localStorage.setItem(VISITS_KEY, String(visits));
      }
      if (Number(localStorage.getItem(VISITS_KEY) || "0") >= 3) {
        setEligible(true);
      }
    } catch {
      /* storage unavailable — never show */
    }
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's mini-infobar quiet; we show our own
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Admin pages stay chrome-free.
  if (pathname.startsWith("/rafraf-admin")) return null;
  if (!eligible || !deferred) return null;

  async function install() {
    const evt = deferred;
    setDeferred(null);
    try {
      await evt?.prompt();
      await evt?.userChoice;
    } catch {
      /* user closed the native sheet */
    }
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function dismiss() {
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={styles.banner} role="dialog" aria-label={labels.text}>
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* download-to-device */}
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <span className={styles.text}>{labels.text}</span>
      <button type="button" className={styles.installBtn} onClick={install}>
        {labels.install}
      </button>
      <button
        type="button"
        className={styles.dismissBtn}
        onClick={dismiss}
        aria-label={labels.dismiss}
      >
        ✕
      </button>
    </div>
  );
}
