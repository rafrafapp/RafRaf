"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb, type TxType, type PaymentMethod } from "@/lib/offline/db";
import { computeReport, presetRange } from "@/lib/reports/compute";
import { useSync } from "@/lib/offline/useSync";
import { useCurrencies } from "@/lib/offline/useCurrencies";
import { safeDisplay } from "@/lib/validation/sanitize";
import {
  IconBox,
  IconStore,
  IconUsers,
  IconTruck,
  IconCart,
  IconReturn,
  IconBanknote,
  IconHistory,
  IconChart,
  IconBell,
  IconHome,
  IconSettings,
} from "./icons";
import styles from "./dashboard.module.css";

// Western digits everywhere (1,2,3 — never ١,٢,٣).
const nf = new Intl.NumberFormat("en-US");

type IconComp = React.ComponentType<{ size?: number; className?: string }>;
type TileKey =
  | "products"
  | "customers"
  | "suppliers"
  | "reports"
  | "buy"
  | "returns"
  | "expenses"
  | "transactions";

// The 4×2 quick-action grid (exactly the design's eight tiles).
const TILES: { href: string; key: TileKey; Icon: IconComp }[] = [
  { href: "/products", key: "products", Icon: IconBox },
  { href: "/customers", key: "customers", Icon: IconUsers },
  { href: "/suppliers", key: "suppliers", Icon: IconTruck },
  { href: "/reports", key: "reports", Icon: IconChart },
  { href: "/buy", key: "buy", Icon: IconCart },
  { href: "/returns", key: "returns", Icon: IconReturn },
  { href: "/expenses", key: "expenses", Icon: IconBanknote },
  { href: "/transactions", key: "transactions", Icon: IconHistory },
];

// Money-in (+) vs money-out (−) for the recent-activity amount colour.
const INCOME: TxType[] = [
  "sell",
  "debt_payment",
  "return_supplier",
  "mobile_credit",
  "sham_cash",
];

type Props = {
  merchantId: string;
  currency: string;
  storeName: string;
  logoUrl: string | null;
  offersMobileCredit: boolean;
  locale: Locale;
  dashboard: Dictionary["dashboard"];
  common: Dictionary["common"];
  sync: Dictionary["products"]["sync"];
};

export function DashboardView({
  merchantId,
  currency,
  storeName,
  logoUrl,
  locale,
  dashboard: d,
  sync,
}: Props) {
  const { online, syncing } = useSync(merchantId);
  const { base } = useCurrencies(merchantId);
  const baseSym = base?.symbol ?? currency;

  // Live, offline-first reads straight from IndexedDB.
  const products = useLiveQuery(
    () => getDb().products.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
    [merchantId],
  );
  const customers = useLiveQuery(
    () => getDb().customers.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
    [merchantId],
  );
  const suppliers = useLiveQuery(
    () => getDb().suppliers.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
    [merchantId],
  );
  const txns = useLiveQuery(
    () => getDb().transactions.where("merchant_id").equals(merchantId).toArray(),
    [merchantId],
  );
  const pending =
    useLiveQuery(async () => {
      const db = getDb();
      const [p, c, s, t] = await Promise.all([
        db.products.where("[merchant_id+_sync]").equals([merchantId, "pending"]).count(),
        db.customers.where("[merchant_id+_sync]").equals([merchantId, "pending"]).count(),
        db.suppliers.where("[merchant_id+_sync]").equals([merchantId, "pending"]).count(),
        db.transactions.where("[merchant_id+_sync]").equals([merchantId, "pending"]).count(),
      ]);
      return p + c + s + t;
    }, [merchantId]) ?? 0;

  const report = useMemo(
    () =>
      computeReport({
        txns: txns ?? [],
        products: products ?? [],
        customers: customers ?? [],
        suppliers: suppliers ?? [],
        range: presetRange("today"),
      }),
    [txns, products, customers, suppliers],
  );
  const productCount = products?.length ?? 0;

  const money = (n: number) => `${nf.format(Math.round(n))} ${baseSym}`;

  // Alerts = low-stock items + outstanding debtors (matches the design's mix of
  // "out of stock" + "late invoice"). Full list lives on /notifications.
  const alerts = useMemo(() => {
    const stock = report.lowStock.map((p) => ({
      key: `s-${p.id}`,
      name: p.name,
      meta: p.stock <= 0 ? d.notifications.outOfStock : d.notifications.lowStockItem,
      href: `/products/${p.id}/edit`,
    }));
    const debts = report.topDebtors.map((c) => ({
      key: `d-${c.id}`,
      name: c.name,
      meta: d.notifications.lateInvoice,
      href: `/customers/${c.id}`,
    }));
    return [...stock, ...debts];
  }, [report.lowStock, report.topDebtors, d.notifications]);

  const debtors = report.topDebtors.slice(0, 3);

  // Recent activity: most recent invoices, collapsing multi-line carts.
  const recent = useMemo(() => {
    const rows = [...(txns ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const order: string[] = [];
    const map = new Map<
      string,
      { key: string; type: TxType; total: number; payment: PaymentMethod; at: string }
    >();
    for (const t of rows) {
      const gkey = t.group_uuid ?? t.client_uuid;
      const ex = map.get(gkey);
      if (ex) ex.total += Number(t.total) || 0;
      else {
        map.set(gkey, {
          key: gkey,
          type: t.type,
          total: Number(t.total) || 0,
          payment: t.payment,
          at: t.created_at,
        });
        order.push(gkey);
      }
      if (order.length >= 50) break;
    }
    return order.slice(0, 5).map((k) => map.get(k)!);
  }, [txns]);

  // Western-digit, Arabic-word date + relative time (locale "ar-u-nu-latn").
  const numLocale = locale === "ar" ? "ar-u-nu-latn" : "en-GB";
  const dateStr = new Date().toLocaleDateString(numLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rtf = useMemo(
    () =>
      new Intl.RelativeTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", {
        numeric: "auto",
      }),
    [locale],
  );
  const timeAgo = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (Math.abs(min) < 60) return rtf.format(-min, "minute");
    const hr = Math.round(min / 60);
    if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
    return rtf.format(-Math.round(hr / 24), "day");
  };
  const initials = storeName.trim().slice(0, 2);

  // Sync state shown as a small dot on the avatar (no text badge):
  // red = offline, orange = syncing / pending, green = synced & online.
  const dotClass = !online
    ? styles.dotOffline
    : syncing || pending > 0
      ? styles.dotPending
      : styles.dotSynced;
  const dotLabel = !online
    ? sync.offline
    : syncing || pending > 0
      ? sync.syncing
      : sync.synced;

  return (
    <div className={styles.page}>
      {/* Top app bar */}
      <header className={styles.topbar}>
        <Link href="/settings" className={styles.brand} aria-label={d.settings}>
          <span className={styles.avatarWrap}>
            <span className={styles.avatar}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className={styles.avatarImg} />
              ) : (
                <span>{safeDisplay(initials)}</span>
              )}
            </span>
            <span
              className={`${styles.statusDot} ${dotClass}`}
              role="status"
              aria-label={dotLabel}
            />
          </span>
          <span className={styles.brandText}>
            <span className={styles.storeName}>{safeDisplay(storeName)}</span>
            <span className={styles.date}>{dateStr}</span>
          </span>
        </Link>
        <div className={styles.topActions}>
          <Link
            href="/notifications"
            className={styles.bellBtn}
            aria-label={d.notifications.title}
          >
            <IconBell size={24} />
            {alerts.length > 0 && (
              <span className={styles.bellBadge}>{nf.format(alerts.length)}</span>
            )}
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* Stats */}
        <section className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{d.salesToday}</span>
            <span className={styles.statValue}>
              {nf.format(Math.round(report.sales))}{" "}
              <span className={styles.statUnit}>{baseSym}</span>
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{d.stockTitle}</span>
            <span className={styles.statValue}>
              {nf.format(productCount)}{" "}
              <span className={styles.statUnit}>{d.productUnit}</span>
            </span>
          </div>
          <div className={`${styles.stat} ${styles.statError}`}>
            <span className={styles.statLabel}>{d.totalDebt}</span>
            <span className={styles.statValue}>
              {nf.format(Math.round(report.receivable))}{" "}
              <span className={styles.statUnit}>{baseSym}</span>
            </span>
          </div>
        </section>

        {/* Primary CTA */}
        <Link href="/sell" className={styles.cta}>
          <IconCart size={24} />
          {d.newSaleInvoice}
        </Link>

        {/* Alerts */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadTitle}>
              <h2 className={styles.cardTitle}>{d.stockAlerts}</h2>
              {alerts.length > 0 && (
                <span className={styles.countBadge}>{nf.format(alerts.length)}</span>
              )}
            </div>
            <Link href="/notifications" className={styles.viewAll}>
              {d.viewAll}
            </Link>
          </div>
          <div className={styles.list}>
            {alerts.length === 0 ? (
              <p className={styles.emptyRow}>{d.noAlerts}</p>
            ) : (
              alerts.slice(0, 3).map((a) => (
                <Link key={a.key} href={a.href} className={styles.alertRow}>
                  <span className={styles.alertDot} aria-hidden />
                  <span className={styles.alertText}>
                    {a.meta}: {safeDisplay(a.name)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Quick actions */}
        <section className={styles.grid}>
          {TILES.map((tile) => (
            <Link key={tile.href} href={tile.href} className={styles.tile}>
              <span className={styles.tileIcon}>
                <tile.Icon size={30} />
              </span>
              <span className={styles.tileLabel}>{d.tiles[tile.key]}</span>
            </Link>
          ))}
        </section>

        {/* Uncollected debts */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{d.uncollectedDebts}</h2>
            <Link href="/customers" className={styles.viewAll}>
              {d.viewAll}
            </Link>
          </div>
          <div className={styles.list}>
            {debtors.length === 0 ? (
              <p className={styles.emptyRow}>{d.noDebtors}</p>
            ) : (
              debtors.map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className={styles.debtRow}
                >
                  <span className={styles.debtName}>{safeDisplay(c.name)}</span>
                  <span className={styles.debtAmount}>{money(c.amount)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{d.recentActivity}</h2>
            <Link href="/transactions" className={styles.viewAll}>
              {d.viewAll}
            </Link>
          </div>
          <div className={styles.list}>
            {recent.length === 0 ? (
              <p className={styles.emptyRow}>{d.noActivity}</p>
            ) : (
              recent.map((r) => {
                const income = INCOME.includes(r.type);
                return (
                  <div key={r.key} className={styles.activityRow}>
                    <div className={styles.activityInfo}>
                      <span className={styles.activityTitle}>
                        {d.activity[r.type]}
                      </span>
                      <span className={styles.activityTime}>{timeAgo(r.at)}</span>
                    </div>
                    <span
                      className={`${styles.activityAmount} ${income ? styles.amountIn : styles.amountOut}`}
                    >
                      {income ? "+" : "−"} {money(r.total)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </main>

      {/* Fixed bottom nav — always visible */}
      <nav className={styles.bottomNav}>
        <Link href="/dashboard" className={`${styles.navItem} ${styles.navActive}`}>
          <IconHome size={26} />
          <span>{d.nav.home}</span>
        </Link>
        <Link href="/products" className={styles.navItem}>
          <IconBox size={26} />
          <span>{d.nav.products}</span>
        </Link>
        <Link href="/sell" className={styles.navItem}>
          <IconStore size={26} />
          <span>{d.nav.sell}</span>
        </Link>
        <Link href="/reports" className={styles.navItem}>
          <IconChart size={26} />
          <span>{d.nav.reports}</span>
        </Link>
        <Link href="/settings" className={styles.navItem}>
          <IconSettings size={26} />
          <span>{d.nav.settings}</span>
        </Link>
      </nav>
    </div>
  );
}
