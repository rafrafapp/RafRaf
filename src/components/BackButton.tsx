"use client";

import { useRouter } from "next/navigation";
import styles from "./BackButton.module.css";

// Shared "← رجوع" back control. Goes to the previous page (router.back) when there
// is history, otherwise to a known fallback route (default /dashboard). The chevron
// is direction-aware (flips in RTL via CSS), so it always points "back".
export function BackButton({
  label,
  fallback = "/dashboard",
  className = "",
}: {
  label: string;
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`${styles.back} ${className}`}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1)
          router.back();
        else router.push(fallback);
      }}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
