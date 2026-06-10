"use client";

import styles from "./SyncStatus.module.css";

type Props = {
  online: boolean;
  syncing: boolean;
  pending: number;
  labels: {
    online: string;
    offline: string;
    syncing: string;
    synced: string;
    pending: string;
  };
};

// Small, glanceable badge: offline → pending → syncing → synced. Reused by the
// products view (and future transaction views in later phases).
export function SyncStatus({ online, syncing, pending, labels }: Props) {
  const state = !online
    ? "offline"
    : syncing
      ? "syncing"
      : pending > 0
        ? "pending"
        : "synced";

  const text =
    state === "offline"
      ? labels.offline
      : state === "syncing"
        ? labels.syncing
        : state === "pending"
          ? labels.pending.replace("{n}", String(pending))
          : labels.synced;

  return (
    <span
      className={`${styles.status} ${styles[state]}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </span>
  );
}
