"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { recordShamCash } from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { PAYMENT_METHODS, parsePositive } from "@/lib/validation/transaction";
import { Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/PageHeader";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
};

// Sham Cash transfer (شام كاش) — service income, no stock effect.
export function ShamCashForm({
  merchantId,
  currency,
  tx,
  common,
  syncLabels,
}: Props) {
  const router = useRouter();
  const { online } = useSync(merchantId);
  const [usd, setUsd] = useState("");
  const [rate, setRate] = useState("");
  const [commission, setCommission] = useState("");
  const [payment, setPayment] = useState<string>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const s = tx.shamCash;
  const pays = tx.payments as Record<string, string>;

  const usdNum = parsePositive(usd);
  const rateNum = parsePositive(rate);
  const totalSyp =
    usdNum != null && rateNum != null
      ? usdNum * rateNum + (Number(commission) || 0)
      : null;

  async function save() {
    setError(null);
    if (usdNum == null || rateNum == null) {
      setError(tx.errors.invalid);
      return;
    }
    setSaving(true);
    try {
      await recordShamCash({
        merchantId,
        amountUsd: usdNum,
        exchangeRate: rateNum,
        commission: Number(commission) || 0,
        payment: payment as (typeof PAYMENT_METHODS)[number],
        currency,
        note: note.trim() || null,
      });
      void syncAll(merchantId).catch(() => {});
      router.push("/transactions");
    } catch {
      setError(tx.errors.failed);
      setSaving(false);
    }
  }

  return (
    <main className={styles.main}>
      <PageHeader
        title={`💸 ${s.title}`}
        backHref="/dashboard"
        backLabel={common.back}
      />

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.form}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <label className={styles.label}>
          {s.amountUsd} (USD)
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={usd}
            onChange={(e) => setUsd(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          {s.exchangeRate}
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          {s.commission} ({currency})
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
        </label>

        {totalSyp != null && (
          <p className={styles.subtitle}>
            {s.totalSyp}: {nf.format(totalSyp)} {currency}
          </p>
        )}

        <label className={styles.label}>
          {s.payment}
          <select
            className={styles.select}
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>
                {pays[p]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          {tx.sell.note} <span className={styles.muted}>({common.optional})</span>
          <textarea
            className={styles.textarea}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button
          type="button"
          className={styles.submit}
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <>
              <Spinner />
              {tx.sell.completing}
            </>
          ) : (
            s.save
          )}
        </button>
      </div>
    </main>
  );
}
