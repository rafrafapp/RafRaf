"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { recordMobileCredit } from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import {
  MOBILE_PROVIDERS,
  PAYMENT_METHODS,
  parsePositive,
} from "@/lib/validation/transaction";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { Spinner } from "@/components/Spinner";
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

// Mobile credit / phone units (وحدات) — service income, no stock effect.
export function MobileCreditForm({
  merchantId,
  currency,
  locale,
  appName,
  tx,
  common,
  syncLabels,
}: Props) {
  const router = useRouter();
  const { online, syncing, sync } = useSync(merchantId);
  const [provider, setProvider] = useState<string>(MOBILE_PROVIDERS[0]);
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [payment, setPayment] = useState<string>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const m = tx.mobileCredit;
  const providers = m.providers as Record<string, string>;
  const pays = tx.payments as Record<string, string>;

  const amt = parsePositive(amount);
  const profit = amt == null ? null : amt - (Number(cost) || 0);

  async function save() {
    setError(null);
    if (amt == null) {
      setError(tx.errors.invalid);
      return;
    }
    setSaving(true);
    try {
      await recordMobileCredit({
        merchantId,
        provider,
        amountSold: amt,
        cost: cost.trim() ? Number(cost) : undefined,
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
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.logo}>
          {appName}
        </Link>
        <div className={styles.headerActions}>
          <SyncBadge
            merchantId={merchantId}
            online={online}
            syncing={syncing}
            onSync={() => void sync()}
            labels={syncLabels}
          />
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
        </div>
      </header>

      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>📱 {m.title}</h1>
          <p className={styles.subtitle}>{m.subtitle}</p>
        </div>
        <Link href="/dashboard" className={styles.back}>
          {tx.list.title}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.form}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <label className={styles.label}>
          {m.provider}
          <select
            className={styles.select}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {MOBILE_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {providers[p]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          {m.amountSold} ({currency})
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          {m.cost} <span className={styles.muted}>({common.optional})</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>

        {profit != null && (
          <p className={styles.subtitle}>
            {m.profit}: {nf.format(profit)} {currency}
          </p>
        )}

        <label className={styles.label}>
          {m.payment}
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
            m.save
          )}
        </button>
      </div>
    </main>
  );
}
