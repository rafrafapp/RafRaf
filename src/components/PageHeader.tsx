"use client";

import Link from "next/link";
import { BackButton } from "./BackButton";
import { IconBell } from "@/app/dashboard/icons";
import styles from "./PageHeader.module.css";

// Shared page header used across all protected pages:
//   right (RTL start): back button (explicit route) + page title
//   left (RTL end):     notifications bell → /notifications
export function PageHeader({
  title,
  backHref,
  backLabel,
  bellLabel = "",
  showBell = true,
}: {
  title: string;
  backHref: string; // explicit "back" target (never history.back)
  backLabel: string;
  bellLabel?: string;
  showBell?: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.titleWrap}>
        <BackButton label={backLabel} fallback={backHref} />
        <h1 className={styles.title}>{title}</h1>
      </div>
      {showBell && (
        <Link href="/notifications" className={styles.bell} aria-label={bellLabel}>
          <IconBell size={24} />
        </Link>
      )}
    </header>
  );
}
