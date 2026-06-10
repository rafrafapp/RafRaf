"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb, type TxType, type PaymentMethod } from "@/lib/offline/db";
import { computeReport, presetRange } from "@/lib/reports/compute";
import { useSync } from "@/lib/offline/useSync";
import { safeDisplay } from "@/lib/validation/sanitize";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncStatus } from "@/components/SyncStatus";
import { SignOutButton } from "@/components/SignOutButton";
import {
  IconTrendingUp,
  IconBox,
  IconWallet,
  IconStore,
  IconUsers,
  IconTruck,
  IconCart,
  IconReturn,
  IconBanknote,
  IconHistory,
  IconChart,
  IconPhone,
  IconExchange,
  IconWarning,
  IconAlert,
  IconPlus,
  IconHome,
  IconSettings,
  ActivityIcon,
} from "./icons";
import styles from "./dashboard.module.css";

const nf = new Intl.NumberFormat("en-US");

type IconComp = React.ComponentType<{ size?: number; className?: string }>;
type ActionLabel =
  | "manageProducts"
  | "customers"
  | "suppliers"
  | "buy"
  | "returns"
  | "expenses"
  | "transactions"
  | "reports"
  | "mobileCredit"
  | "shamCash";
type ColorClass = "cPrimary" | "cSecondary" | "cTertiary" | "cError";

// The action grid (the user-specified routes + the two new service cards).
const ACTIONS: { href: string; label: ActionLabel; Icon: IconComp; color: ColorClass }[] = [
  { href: "/products", label: "manageProducts", Icon: IconBox, color: "cPrimary" },
  { href: "/customers", label: "customers", Icon: IconUsers, color: "cSecondary" },
  { href: "/suppliers", label: "suppliers", Icon: IconTruck, color: "cTertiary" },
  { href: "/buy", label: "buy", Icon: IconCart, color: "cPrimary" },
  { href: "/returns", label: "returns", Icon: IconReturn, color: "cError" },
  { href: "/expenses", label: "expenses", Icon: IconBanknote, color: "cError" },
  { href: "/transactions", label: "transactions", Icon: IconHistory, color: "cPrimary" },
  { href: "/reports", label: "reports", Icon: IconChart, color: "cSecondary" },
  { href: "/mobile-credit", label: "mobileCredit", Icon: IconPhone, color: "cPrimary" },
  { href: "/sham-cash", label: "shamCash", Icon: IconExchange, color: "cSecondary" },
];

// Income (+, green) vs outflow (−, red) for the recent-activity amounts.
const INCOME: TxType[] = ["sell", "debt_payment", "return_supplier", "mobile_credit", "sham_cash"];

type Props = {
  merchantId: string;
  currency: string;
  storeName: string;
  logoUrl: string | null;
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
  common,
  sync,
}: Props) {
  const { online, syncing, sync: doSync } = useSync(merchantId);

  // Live, offline-first reads straight from IndexedDB (re-render on any sync/write).
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

  // Today's figures (sales / receivable / low-stock) from the shared report module.
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
  const lowStock = report.lowStock.slice(0, 5);

  // Recent activity: most recent invoices, collapsing multi-line carts (group_uuid).
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
      if (order.length >= 50) break; // bound work; first 5 groups are complete by now
    }
    return order.slice(0, 5).map((k) => map.get(k)!);
  }, [txns]);

  const fmt = (n: number) => nf.format(Math.round(n));
  const rtf = useMemo(
    () => new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" }),
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerStart}>
          <span className={styles.storeName}>{safeDisplay(storeName)}</span>
          <span className={styles.divider} aria-hidden />
          <span className={styles.greeting}>{d.welcome} 👋</span>
        </div>
        <div className={styles.headerEnd}>
          <button
            type="button"
            className={styles.syncBtn}
            onClick={() => void doSync()}
            disabled={!online || syncing}
            title={d.manualSync}
            aria-label={d.manualSync}
          >
            <SyncStatus
              online={online}
              syncing={syncing}
              pending={pending}
              labels={{
                online: sync.online,
                offline: sync.offline,
                syncing: sync.syncing,
                synced: sync.synced,
                pending: sync.pending,
              }}
            />
          </button>
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
          <Link href="/settings" className={styles.avatar} aria-label={d.settings}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className={styles.avatarImg} />
            ) : (
              <span>{initials}</span>
            )}
          </Link>
          <SignOutButton label={d.signOut} className={styles.iconBtn} />
        </div>
      </header>

      <main className={styles.main}>
        {/* Stats */}
        <section className={styles.stats}>
          <div className={`${styles.statCard} ${styles.statPrimary} ${styles.glass}`}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{d.salesToday}</span>
              <span className={`${styles.statIcon} ${styles.iconBgPrimary}`}>
                <IconTrendingUp size={22} />
              </span>
            </div>
            <div className={styles.statValueRow}>
              <span className={`${styles.statValue} ${styles.cPrimary}`}>{fmt(report.sales)}</span>
              <span className={styles.statUnit}>{currency}</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statSecondary} ${styles.glass}`}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{d.stockTitle}</span>
              <span className={`${styles.statIcon} ${styles.iconBgSecondary}`}>
                <IconBox size={22} />
              </span>
            </div>
            <div className={styles.statValueRow}>
              <span className={`${styles.statValue} ${styles.cSecondary}`}>{fmt(productCount)}</span>
              <span className={styles.statUnit}>{d.productUnit}</span>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statError} ${styles.glass}`}>
            <div className={styles.statHead}>
              <span className={styles.statLabel}>{d.totalDebt}</span>
              <span className={`${styles.statIcon} ${styles.iconBgError}`}>
                <IconWallet size={22} />
              </span>
            </div>
            <div className={styles.statValueRow}>
              <span className={`${styles.statValue} ${styles.cError}`}>{fmt(report.receivable)}</span>
              <span className={styles.statUnit}>{currency}</span>
            </div>
          </div>
        </section>

        {/* Primary CTA + action grid */}
        <section className={styles.grid}>
          <div className={styles.ctaCol}>
            <Link href="/sell" className={styles.cta}>
              <IconStore size={72} />
              <span className={styles.ctaTitle}>{d.sell}</span>
              <span className={styles.ctaPill}>
                <IconPlus size={16} /> {d.newInvoice}
              </span>
            </Link>
          </div>
          <div className={styles.actionsCol}>
            <nav className={styles.actions}>
              {ACTIONS.map((a) => (
                <Link key={a.href} href={a.href} className={`${styles.action} ${styles.glass}`}>
                  <span className={styles.actionIcon}>
                    <a.Icon size={24} className={styles[a.color]} />
                  </span>
                  <span className={styles.actionLabel}>{d[a.label]}</span>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        {/* Recent activity + stock alerts */}
        <section className={styles.panels}>
          <div className={`${styles.panel} ${styles.glass}`}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{d.recentActivity}</h2>
              <Link href="/transactions" className={styles.panelLink}>
                {d.viewAll}
              </Link>
            </div>
            <div className={styles.activityList}>
              {recent.length === 0 ? (
                <p className={styles.emptyRow}>{d.noActivity}</p>
              ) : (
                recent.map((r) => {
                  const income = INCOME.includes(r.type);
                  return (
                    <div key={r.key} className={styles.activityRow}>
                      <div className={styles.activityMain}>
                        <span
                          className={`${styles.activityIcon} ${income ? styles.iconBgPrimary : styles.iconBgError}`}
                        >
                          <ActivityIcon type={r.type} size={20} />
                        </span>
                        <div className={styles.activityInfo}>
                          <p className={styles.activityTitle}>{d.activity[r.type]}</p>
                          <p className={styles.activitySub}>
                            {timeAgo(r.at)} • {d.payments[r.payment]}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`${styles.activityAmount} ${income ? styles.amountIn : styles.amountOut}`}
                      >
                        {income ? "+" : "−"} {fmt(r.total)} {currency}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`${styles.panel} ${styles.glass}`}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{d.stockAlerts}</h2>
              {lowStock.length > 0 && (
                <span className={styles.alertBadge}>
                  {d.alertsCount.replace("{n}", String(lowStock.length))}
                </span>
              )}
            </div>
            <div className={styles.alertsBody}>
              {lowStock.length === 0 ? (
                <p className={styles.emptyRow}>{d.noAlerts}</p>
              ) : (
                <>
                  {lowStock.map((a) => {
                    const ratio = a.min > 0 ? a.stock / a.min : 0;
                    const critical = ratio < 0.34;
                    const pct = Math.max(4, Math.min(100, Math.round(ratio * 100)));
                    return (
                      <div
                        key={a.id}
                        className={`${styles.alertItem} ${critical ? styles.alertError : styles.alertWarn}`}
                      >
                        <span
                          className={`${styles.alertIcon} ${critical ? styles.iconBgError : styles.iconBgSecondary}`}
                        >
                          {critical ? <IconWarning size={22} /> : <IconAlert size={22} />}
                        </span>
                        <div className={styles.alertContent}>
                          <div className={styles.alertRow}>
                            <h3 className={styles.alertName}>{safeDisplay(a.name)}</h3>
                            <span
                              className={`${styles.alertRemaining} ${critical ? styles.cError : styles.cSecondary}`}
                            >
                              {d.remaining}: {fmt(a.stock)}
                            </span>
                          </div>
                          <div className={styles.bar}>
                            <div
                              className={styles.barFill}
                              style={{
                                inlineSize: `${pct}%`,
                                background: critical ? "var(--error)" : "var(--secondary)",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <Link href="/buy" className={styles.orderBtn}>
                    {d.orderGoods}
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Mobile bottom nav */}
      <nav className={styles.bottomNav}>
        <Link href="/dashboard" className={`${styles.navItem} ${styles.navItemActive}`}>
          <IconHome size={22} />
          <span>{d.nav.home}</span>
        </Link>
        <Link href="/products" className={styles.navItem}>
          <IconBox size={22} />
          <span>{d.nav.products}</span>
        </Link>
        <Link href="/sell" className={styles.navItem}>
          <IconStore size={22} />
          <span>{d.nav.sell}</span>
        </Link>
        <Link href="/reports" className={styles.navItem}>
          <IconChart size={22} />
          <span>{d.nav.reports}</span>
        </Link>
        <Link href="/settings" className={styles.navItem}>
          <IconSettings size={22} />
          <span>{d.nav.settings}</span>
        </Link>
      </nav>
    </div>
  );
}
