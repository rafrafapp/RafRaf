"use client";

import { useRouter } from "next/navigation";
import styles from "./BackButton.module.css";

// Shared "← رجوع" back control. Always navigates to an EXPLICIT route (never
// router.back()) so "back" is predictable from any entry point. `fallback` is the
// target (default /dashboard). The chevron flips in RTL via CSS.
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
      onClick={() => router.push(fallback)}
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
