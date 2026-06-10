"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/offline/db";
import { SyncStatus } from "./SyncStatus";
import styles from "./transactions.module.css";

type Props = {
  merchantId: string;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  labels: {
    online: string;
    offline: string;
    syncing: string;
    synced: string;
    pending: string;
    retry: string;
  };
};

// Header sync badge for transaction screens: shows pending-ledger count and
// doubles as a "retry now" button. Reads the pending count live from Dexie.
export function SyncBadge({ merchantId, online, syncing, onSync, labels }: Props) {
  const pending =
    useLiveQuery(
      () =>
        getDb()
          .transactions.where("[merchant_id+_sync]")
          .equals([merchantId, "pending"])
          .count(),
      [merchantId],
      0,
    ) ?? 0;

  return (
    <button
      type="button"
      className={styles.syncBtn}
      onClick={onSync}
      disabled={!online || syncing}
      title={labels.retry}
    >
      <SyncStatus
        online={online}
        syncing={syncing}
        pending={pending}
        labels={{
          online: labels.online,
          offline: labels.offline,
          syncing: labels.syncing,
          synced: labels.synced,
          pending: labels.pending,
        }}
      />
    </button>
  );
}
