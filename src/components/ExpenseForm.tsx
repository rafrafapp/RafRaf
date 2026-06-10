"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { recordTransaction } from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { EXPENSE_CATEGORIES, parsePositive } from "@/lib/validation/transaction";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import styles from "@/components/transactions.module.css";

type Props = {
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
};

// Categorized expense (no stock effect). Stored with product_name = category
// label so it reads clearly in the history.
export function ExpenseForm({
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
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const e = tx.expenses;
  const cats = e.categories as Record<string, string>;

  async function save() {
    setError(null);
    const amt = parsePositive(amount);
    if (amt == null) {
      setError(tx.errors.invalid);
      return;
    }
    setSaving(true);
    try {
      const catLabel = cats[category] ?? category;
      await recordTransaction({
        merchantId,
        type: "expense",
        currency,
        product_name: catLabel,
        total: amt,
        note: note.trim() ? `${catLabel} — ${note.trim()}` : catLabel,
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
          <h1 className={styles.title}>{e.title}</h1>
          <p className={styles.subtitle}>{e.subtitle}</p>
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
          {e.category}
          <select
            className={styles.select}
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {cats[c]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          {e.amount} ({currency})
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
          />
        </label>

        <label className={styles.label}>
          {e.note} <span className={styles.muted}>({common.optional})</span>
          <textarea
            className={styles.textarea}
            rows={2}
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
          />
        </label>

        <button
          type="button"
          className={styles.submit}
          onClick={save}
          disabled={saving}
        >
          {saving ? tx.sell.completing : e.save}
        </button>
      </div>
    </main>
  );
}
