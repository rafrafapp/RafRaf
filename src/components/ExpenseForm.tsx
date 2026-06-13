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
import { useCurrencies } from "@/lib/offline/useCurrencies";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Spinner } from "@/components/Spinner";
import { BackButton } from "@/components/BackButton";
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

// Categorized expense (no stock effect). Stored with product_name = category
// label so it reads clearly in the history.
export function ExpenseForm({
  merchantId,
  locale,
  appName,
  tx,
  common,
  syncLabels,
}: Props) {
  const router = useRouter();
  const { online, syncing, sync } = useSync(merchantId);
  const { currencies, base } = useCurrencies(merchantId);
  const [currencyCode, setCurrencyCode] = useState<string>("");
  const selected =
    currencies.find((c) => c.code === currencyCode) ?? base ?? null;
  const code = selected?.code ?? "SYP";
  const rate = selected ? Number(selected.rate_to_base) || 1 : 1;
  const symbol = selected?.symbol ?? "ل.س";
  const baseSymbol = base?.symbol ?? "ل.س";
  const isBaseCur = !selected || selected.is_base;
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
        currency: code,
        exchangeRate: rate,
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
        <BackButton label={common.back} />
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

        {currencies.length > 1 && (
          <label className={styles.label}>
            {tx.currency}
            <CurrencySelect
              currencies={currencies}
              value={code}
              onChange={setCurrencyCode}
              locale={locale}
              className={styles.select}
            />
          </label>
        )}

        <label className={styles.label}>
          {e.amount} ({symbol})
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
        {!isBaseCur && (Number(amount) || 0) > 0 && (
          <p className={styles.muted}>
            {tx.inBase}: ≈ {nf.format((Number(amount) || 0) * rate)} {baseSymbol}
          </p>
        )}

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
          {saving ? (
            <>
              <Spinner />
              {tx.sell.completing}
            </>
          ) : (
            e.save
          )}
        </button>
      </div>
    </main>
  );
}
