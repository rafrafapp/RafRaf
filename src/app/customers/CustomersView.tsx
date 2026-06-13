"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { safeDisplay } from "@/lib/validation/sanitize";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncStatus } from "@/components/SyncStatus";
import { BackButton } from "@/components/BackButton";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  customers: Dictionary["customers"];
  common: Dictionary["common"];
  sync: Dictionary["products"]["sync"];
};

export function CustomersView({
  merchantId,
  currency,
  locale,
  appName,
  customers: c,
  common,
  sync: syncLabels,
}: Props) {
  const { online, syncing, sync } = useSync(merchantId);
  const [q, setQ] = useState("");

  const all = useLiveQuery(
    () =>
      getDb()
        .customers.where("[merchant_id+_deleted]")
        .equals([merchantId, 0])
        .toArray(),
    [merchantId],
  );
  const pending =
    useLiveQuery(
      () =>
        getDb()
          .customers.where("[merchant_id+_sync]")
          .equals([merchantId, "pending"])
          .count(),
      [merchantId],
      0,
    ) ?? 0;

  const rows = all ?? [];
  const loading = all === undefined || (syncing && rows.length === 0);

  const totalDebt = useMemo(
    () => rows.reduce((s, r) => s + Math.max(0, Number(r.debt_balance)), 0),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            (r.phone?.toLowerCase().includes(needle) ?? false),
        )
      : rows;
    // Debtors first (largest debt), then alphabetical.
    return [...list].sort((a, b) => {
      const da = Number(a.debt_balance);
      const db = Number(b.debt_balance);
      if (da > 0 || db > 0) return db - da;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [rows, q]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.logo}>
          {appName}
        </Link>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.syncBtn}
            onClick={() => void sync()}
            disabled={!online || syncing}
            title={syncLabels.retry}
          >
            <SyncStatus
              online={online}
              syncing={syncing}
              pending={pending}
              labels={{
                online: syncLabels.online,
                offline: syncLabels.offline,
                syncing: syncLabels.syncing,
                synced: syncLabels.synced,
                pending: syncLabels.pending,
              }}
            />
          </button>
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
        </div>
      </header>

      <div className={styles.titleRow}>
        <div>
          <div style={{ marginBlockEnd: "0.5rem" }}>
            <BackButton label={common.back} />
          </div>
          <h1 className={styles.title}>{c.title}</h1>
          <p className={styles.subtitle}>{c.subtitle}</p>
        </div>
        <Link href="/customers/new" className={styles.addBtn}>
          <svg
            className={styles.addIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {c.add}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      {totalDebt > 0 && (
        <div className={styles.stat}>
          <span className={styles.statLabel}>{c.totalDebt}</span>
          <span className={styles.statValue}>
            {nf.format(totalDebt)} {currency}
          </span>
        </div>
      )}

      <div className={styles.searchField}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className={styles.pickerInput}
          type="search"
          placeholder={c.search}
          aria-label={c.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <p className={styles.count}>{common.loading}</p>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{q ? c.emptyFiltered : c.empty}</p>
          {!q && <p className={styles.emptyHint}>{c.emptyHint}</p>}
        </div>
      ) : (
        <>
          <p className={styles.count}>
            {c.results}: {nf.format(filtered.length)}
          </p>
          <ul className={styles.list}>
            {filtered.map((r) => {
              const debt = Number(r.debt_balance);
              return (
                <li key={r.id}>
                  <Link
                    href={`/customers/${r.id}`}
                    className={styles.txRow}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className={styles.txLead}>
                      <span className={styles.avatar} aria-hidden="true">
                        {safeDisplay(r.name).trim().slice(0, 2)}
                      </span>
                      <div className={styles.txMain}>
                        <span className={styles.txName}>{safeDisplay(r.name)}</span>
                        {r.phone && (
                          <span className={styles.txMeta} dir="ltr">
                            {r.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={
                        debt > 0
                          ? styles.debtPos
                          : debt < 0
                            ? styles.debtClear
                            : styles.txMeta
                      }
                    >
                      {debt > 0
                        ? `${nf.format(debt)} ${currency}`
                        : debt < 0
                          ? `${c.credit}: ${nf.format(-debt)} ${currency}`
                          : c.noDebt}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
