"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb, type LocalTransaction, type TxType } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import {
  recordShamCashVoid,
  VOID_NOTE_PREFIX,
} from "@/lib/offline/transactions-repo";
import { safeDisplay } from "@/lib/validation/sanitize";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { Spinner } from "@/components/Spinner";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

// Money-in (+, green) vs money-out (−, red) for the amount colour.
const INCOME: TxType[] = [
  "sell",
  "debt_payment",
  "return_supplier",
  "mobile_credit",
  "sham_cash",
];

type Filter =
  | "all"
  | "sell"
  | "buy"
  | "return"
  | "expense"
  | "payment"
  | "service";

type Props = {
  merchantId: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
};

type Entry = {
  key: string;
  type: TxType;
  title: string;
  total: number;
  date: string;
  currency: string;
};

export function TransactionsView({
  merchantId,
  locale,
  appName,
  tx,
  common,
  syncLabels,
}: Props) {
  const { online, syncing, sync } = useSync(merchantId);
  const [filter, setFilter] = useState<Filter>("all");
  const [voidTarget, setVoidTarget] = useState<LocalTransaction | null>(null);
  const [voiding, setVoiding] = useState(false);

  const rows = useLiveQuery(
    () => getDb().transactions.where("merchant_id").equals(merchantId).toArray(),
    [merchantId],
  );
  const loading = rows === undefined;
  const all = rows ?? [];

  // Sham-cash rows that already have a reversing void row (so we hide their
  // "cancel" button — the ledger is append-only, a void is a separate row).
  const voidedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const t of rows ?? []) {
      if (t.type === "sham_cash_void" && t.note?.startsWith(VOID_NOTE_PREFIX))
        set.add(t.note.slice(VOID_NOTE_PREFIX.length));
    }
    return set;
  }, [rows]);
  const types = tx.types as Record<string, string>;
  const providers = tx.mobileCredit.providers as Record<string, string>;

  // Group multi-item cart lines (shared group_uuid) into one invoice entry;
  // everything else is shown individually. Newest first.
  const entries = useMemo(() => {
    const filtered = all.filter((t) =>
      filter === "all"
        ? true
        : filter === "return"
          ? t.type === "return_customer" || t.type === "return_supplier"
          : filter === "payment"
            ? t.type === "debt_payment" || t.type === "supplier_payment"
            : filter === "service"
              ? t.type === "mobile_credit" ||
                t.type === "sham_cash" ||
                t.type === "sham_cash_void"
              : t.type === filter,
    );
    const groups = new Map<string, LocalTransaction[]>();
    const singles: LocalTransaction[] = [];
    for (const t of filtered) {
      if (t.group_uuid) {
        const arr = groups.get(t.group_uuid) ?? [];
        arr.push(t);
        groups.set(t.group_uuid, arr);
      } else {
        singles.push(t);
      }
    }
    const out: Entry[] = [];
    for (const [g, arr] of groups) {
      out.push({
        key: g,
        type: arr[0].type,
        title: tx.list.invoiceItems.replace("{n}", String(arr.length)),
        total: arr.reduce((sum, t) => sum + Number(t.total), 0),
        date: arr.reduce((d, t) => (t.created_at > d ? t.created_at : d), arr[0].created_at),
        currency: arr[0].currency,
      });
    }
    for (const t of singles) {
      const title =
        t.type === "mobile_credit"
          ? `📱 ${types.mobile_credit}${t.product_name ? ` · ${providers[t.product_name] ?? t.product_name}` : ""}`
          : t.type === "sham_cash"
            ? `💸 ${types.sham_cash}`
            : t.type === "sham_cash_void"
              ? `↩️ ${types.sham_cash_void}`
              : (t.product_name ?? types[t.type]);
      out.push({
        key: t.client_uuid,
        type: t.type,
        title,
        total: Number(t.total),
        date: t.created_at,
        currency: t.currency,
      });
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }, [all, filter, tx.list.invoiceItems, types, providers]);

  function badgeClass(type: TxType): string {
    if (type === "sell") return styles.badgeSell;
    if (type === "buy") return styles.badgeBuy;
    if (type === "expense") return styles.badgeExpense;
    if (type === "debt_payment" || type === "supplier_payment")
      return styles.badgePay;
    if (type === "mobile_credit" || type === "sham_cash")
      return styles.badgeService;
    return styles.badgeReturn;
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: tx.list.all },
    { key: "sell", label: types.sell },
    { key: "buy", label: types.buy },
    { key: "return", label: tx.returns.title },
    { key: "expense", label: types.expense },
    { key: "payment", label: tx.list.payment },
    { key: "service", label: tx.list.service },
  ];

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
          <h1 className={styles.title}>{tx.list.title}</h1>
          <p className={styles.subtitle}>{tx.list.subtitle}</p>
        </div>
        <Link href="/sell" className={styles.back}>
          {tx.sell.title}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.filters}>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`${styles.chip} ${filter === f.key ? styles.chipActive : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.count}>{common.loading}</p>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {filter === "all" ? tx.list.empty : tx.list.emptyFiltered}
          </p>
          {filter === "all" && (
            <p className={styles.emptyHint}>{tx.list.emptyHint}</p>
          )}
        </div>
      ) : (
        <>
          <p className={styles.count}>
            {tx.list.results}: {nf.format(entries.length)}
          </p>
          <ul className={styles.list}>
            {entries.map((en) => (
              <li key={en.key} className={styles.txRow}>
                <div className={styles.txMain}>
                  <span className={styles.txName}>{safeDisplay(en.title)}</span>
                  <div className={styles.txMeta}>
                    <span className={`${styles.txBadge} ${badgeClass(en.type)}`}>
                      {types[en.type]}
                    </span>
                    <span>
                      {new Date(en.date).toLocaleString(
                        locale === "ar" ? "ar" : "en-GB",
                        { dateStyle: "short", timeStyle: "short" },
                      )}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "0.3rem",
                  }}
                >
                  <span
                    className={`${styles.txAmount} ${
                      INCOME.includes(en.type) ? styles.txIn : styles.txOut
                    }`}
                  >
                    {INCOME.includes(en.type) ? "+" : "−"} {nf.format(en.total)}{" "}
                    {en.currency}
                  </span>
                  {en.type === "sham_cash" && !voidedKeys.has(en.key) && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() =>
                        setVoidTarget(
                          (rows ?? []).find((t) => t.client_uuid === en.key) ??
                            null,
                        )
                      }
                    >
                      {tx.list.cancel}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {voidTarget && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.confirmBox}>
            <p className={styles.confirmTitle} style={{ color: "var(--text)" }}>
              {tx.list.cancelConfirm}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setVoidTarget(null)}
                disabled={voiding}
              >
                {tx.sell.cancel}
              </button>
              <button
                type="button"
                className={styles.btnWarn}
                disabled={voiding}
                onClick={async () => {
                  if (!voidTarget) return;
                  setVoiding(true);
                  try {
                    await recordShamCashVoid({ merchantId, original: voidTarget });
                    void sync();
                    setVoidTarget(null);
                  } finally {
                    setVoiding(false);
                  }
                }}
              >
                {voiding ? (
                  <>
                    <Spinner />
                    {tx.list.canceling}
                  </>
                ) : (
                  tx.list.cancelYes
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
