"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { useCurrencies } from "@/lib/offline/useCurrencies";
import { safeDisplay } from "@/lib/validation/sanitize";
import { BackButton } from "@/components/BackButton";
import styles from "@/app/dashboard/dashboard.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  locale: Locale;
  dashboard: Dictionary["dashboard"];
  common: Dictionary["common"];
};

export function NotificationsView({
  merchantId,
  currency,
  locale,
  dashboard: d,
  common,
}: Props) {
  useSync(merchantId);
  const { base } = useCurrencies(merchantId);
  const baseSym = base?.symbol ?? currency;
  const n = d.notifications;

  const products =
    useLiveQuery(
      () => getDb().products.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
      [merchantId],
      [],
    ) ?? [];
  const customers =
    useLiveQuery(
      () => getDb().customers.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
      [merchantId],
      [],
    ) ?? [];
  // All low-stock items (full list, not just the top 5).
  const lowStock = useMemo(
    () =>
      products
        .filter(
          (p) =>
            Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock),
        )
        .sort((a, b) => Number(a.stock) - Number(b.stock)),
    [products],
  );
  // All customers who owe money (full list).
  const debtors = useMemo(
    () =>
      customers
        .filter((c) => Number(c.debt_balance) > 0)
        .sort((a, b) => Number(b.debt_balance) - Number(a.debt_balance)),
    [customers],
  );

  const total = lowStock.length + debtors.length;
  const money = (v: number) => `${nf.format(Math.round(v))} ${baseSym}`;

  return (
    <div className={styles.page} style={{ paddingBlockEnd: "1.5rem" }}>
      <header className={styles.subHeader}>
        <BackButton label={common.back} fallback="/dashboard" />
        <h1 className={styles.subTitle}>{n.title}</h1>
        {total > 0 && <span className={styles.countBadge}>{nf.format(total)}</span>}
      </header>

      <main className={styles.main}>
        {total === 0 ? (
          <section className={styles.card}>
            <p className={styles.emptyRow}>{n.empty}</p>
          </section>
        ) : (
          <>
            {/* Low stock */}
            {lowStock.length > 0 && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>{n.lowStockTitle}</h2>
                  <span className={styles.countBadge}>
                    {nf.format(lowStock.length)}
                  </span>
                </div>
                <div className={styles.list}>
                  {lowStock.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}/edit`}
                      className={styles.alertRow}
                    >
                      <span className={styles.alertDot} aria-hidden />
                      <span className={styles.alertText}>
                        {safeDisplay(p.name)}
                      </span>
                      <span
                        className={`${styles.alertMeta} ${styles.alertMetaError}`}
                      >
                        {Number(p.stock) <= 0
                          ? n.outOfStock
                          : `${nf.format(Number(p.stock))} / ${nf.format(Number(p.min_stock))}`}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Outstanding debts */}
            {debtors.length > 0 && (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>{n.debtsTitle}</h2>
                  <span className={styles.countBadge}>
                    {nf.format(debtors.length)}
                  </span>
                </div>
                <div className={styles.list}>
                  {debtors.map((c) => (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}`}
                      className={styles.debtRow}
                    >
                      <span className={styles.debtName}>
                        {safeDisplay(c.name)}
                      </span>
                      <span className={styles.debtAmount}>
                        {money(Number(c.debt_balance))}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
