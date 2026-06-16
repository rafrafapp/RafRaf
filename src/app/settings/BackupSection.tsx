"use client";

import { useState, useTransition } from "react";
import { requestBackup } from "@/lib/merchant/actions";
import { Spinner } from "@/components/Spinner";
import styles from "@/app/products/product-form.module.css";

type Labels = {
  status: string;
  linked: string;
  notLinked: string;
  lastBackup: string;
  never: string;
  request: string;
  requesting: string;
  requested: string;
  requestFailed: string;
};

// Merchant-facing backup status + a "request a backup" button that pings the admin
// over Telegram (the merchant can't run a cross-tenant backup themselves).
export function BackupSection({
  linked,
  lastBackupAt,
  labels,
}: {
  linked: boolean;
  lastBackupAt: string | null;
  labels: Labels;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className={styles.form}>
      <p className={styles.muted}>
        {labels.status}: {linked ? labels.linked : labels.notLinked}
      </p>
      <p className={styles.muted}>
        {labels.lastBackup}: {lastBackupAt ?? labels.never}
      </p>
      <button
        type="button"
        className={styles.submit}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestBackup();
            setMsg(r.ok ? labels.requested : labels.requestFailed);
          })
        }
      >
        {pending ? (
          <>
            <Spinner />
            {labels.requesting}
          </>
        ) : (
          labels.request
        )}
      </button>
      {msg && (
        <p className={styles.muted} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
