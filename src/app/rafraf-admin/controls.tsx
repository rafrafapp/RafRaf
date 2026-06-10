"use client";

import { useState, useTransition } from "react";
import {
  changePlan,
  updateBilling,
  startImpersonation,
  stopImpersonation,
  runMerchantBackup,
  runAllBackups,
  runMasterUpdate,
  broadcast,
} from "./actions";
import styles from "./rafraf-admin.module.css";

// Small client widgets that call the admin server actions. Labels are passed in
// from the (server) pages so everything stays bilingual without duplicating the
// dictionary on the client.

const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n) + "…" : s);

export function PlanControl({
  merchantId,
  plan,
  plans,
  labels,
}: {
  merchantId: string;
  plan: string;
  plans: Record<string, string>;
  labels: { save: string; saving: string; saved: string; failed: string };
}) {
  const [value, setValue] = useState(plan);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className={styles.controlRow}>
      <select
        className={styles.select}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
      >
        {Object.entries(plans).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.btn}
        disabled={pending || value === plan}
        onClick={() =>
          start(async () => {
            const r = await changePlan(merchantId, value);
            setMsg(r.ok ? labels.saved : labels.failed);
          })
        }
      >
        {pending ? labels.saving : labels.save}
      </button>
      {msg && <span className={styles.status}>{msg}</span>}
    </div>
  );
}

export function BillingForm({
  merchantId,
  notes,
  labels,
}: {
  merchantId: string;
  notes: string | null;
  labels: {
    title: string;
    placeholder: string;
    save: string;
    markPaid: string;
    saved: string;
    failed: string;
  };
}) {
  const [value, setValue] = useState(notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (markPaid: boolean) =>
    start(async () => {
      const r = await updateBilling(merchantId, markPaid, value);
      setMsg(r.ok ? labels.saved : labels.failed);
    });

  return (
    <div className={styles.panel}>
      <strong>{labels.title}</strong>
      <textarea
        className={styles.textarea}
        value={value}
        placeholder={labels.placeholder}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className={styles.controlRow}>
        <button
          type="button"
          className={styles.btn}
          disabled={pending}
          onClick={() => submit(false)}
        >
          {labels.save}
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={pending}
          onClick={() => submit(true)}
        >
          {labels.markPaid}
        </button>
        {msg && <span className={styles.status}>{msg}</span>}
      </div>
    </div>
  );
}

export function ImpersonateButton({
  merchantId,
  active,
  labels,
}: {
  merchantId: string;
  active: boolean;
  labels: { start: string; stop: string };
}) {
  const [pending, start] = useTransition();
  if (active) {
    return (
      <button
        type="button"
        className={styles.btn}
        disabled={pending}
        onClick={() => start(async () => void (await stopImpersonation()))}
      >
        {labels.stop}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={styles.btnPrimary}
      disabled={pending}
      onClick={() => start(async () => void (await startImpersonation(merchantId)))}
    >
      {labels.start}
    </button>
  );
}

export function BackupRunButton({
  merchantId,
  labels,
}: {
  merchantId: string;
  labels: { runNow: string; running: string; done: string; failed: string };
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={styles.controlRow}>
      <button
        type="button"
        className={styles.btn}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runMerchantBackup(merchantId);
            setMsg(r.ok ? labels.done : clip(r.error ?? labels.failed));
          })
        }
      >
        {pending ? labels.running : labels.runNow}
      </button>
      {msg && (
        <span className={styles.status} title={msg}>
          {msg}
        </span>
      )}
    </div>
  );
}

export function BackupGlobalControls({
  labels,
}: {
  labels: {
    runAll: string;
    updateMaster: string;
    running: string;
    done: string;
    failed: string;
  };
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? `${labels.done} ${r.message ?? ""}`.trim() : clip(r.error ?? labels.failed));
    });

  return (
    <div className={styles.controlRow}>
      <button
        type="button"
        className={styles.btnPrimary}
        disabled={pending}
        onClick={() => run(runAllBackups)}
      >
        {labels.runAll}
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={pending}
        onClick={() => run(runMasterUpdate)}
      >
        {labels.updateMaster}
      </button>
      {pending ? (
        <span className={styles.status}>{labels.running}</span>
      ) : (
        msg && (
          <span className={styles.status} title={msg}>
            {msg}
          </span>
        )
      )}
    </div>
  );
}

export function BroadcastForm({
  labels,
}: {
  labels: {
    placeholder: string;
    all: string;
    telegram: string;
    whatsapp: string;
    send: string;
    sending: string;
    sent: string; // "... {n}"
    empty: string;
    failed: string;
  };
}) {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"all" | "telegram" | "whatsapp">("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className={styles.panel}>
      <textarea
        className={styles.textarea}
        value={message}
        placeholder={labels.placeholder}
        disabled={pending}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className={styles.controlRow}>
        <select
          className={styles.select}
          value={channel}
          disabled={pending}
          onChange={(e) =>
            setChannel(e.target.value as "all" | "telegram" | "whatsapp")
          }
        >
          <option value="all">{labels.all}</option>
          <option value="telegram">{labels.telegram}</option>
          <option value="whatsapp">{labels.whatsapp}</option>
        </select>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={pending || !message.trim()}
          onClick={() =>
            start(async () => {
              const r = await broadcast(message, channel);
              if (r.ok) {
                setMsg(labels.sent.replace("{n}", r.message ?? "0"));
                setMessage("");
              } else {
                setMsg(r.error === "empty" ? labels.empty : labels.failed);
              }
            })
          }
        >
          {pending ? labels.sending : labels.send}
        </button>
        {msg && <span className={styles.status}>{msg}</span>}
      </div>
    </div>
  );
}
