import Link from "next/link";
import { requireSuperadmin } from "@/lib/security/admin";
import { getOverview, getSystemHealth } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { safeDisplay } from "@/lib/validation/sanitize";
import { adminPath } from "@/lib/security/admin-path";
import styles from "./rafraf-admin.module.css";

const nf = new Intl.NumberFormat("en-US");

export default async function AdminOverviewPage() {
  await requireSuperadmin();
  const [m, health, locale] = await Promise.all([
    getOverview(),
    getSystemHealth(),
    getCurrentLocale(),
  ]);
  const dict = await getDictionary(locale);
  const o = dict.admin.overview;
  const h = dict.admin.health;

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : h.none;

  const cards: { label: string; value: string }[] = [
    { label: o.merchants, value: nf.format(m.merchants) },
    { label: o.activeToday, value: nf.format(m.activeToday) },
    { label: o.active7d, value: nf.format(m.active7d) },
    { label: o.products, value: nf.format(m.products) },
    { label: o.transactions, value: nf.format(m.transactions) },
    { label: o.sales, value: nf.format(m.totalSales) },
    { label: o.purchases, value: nf.format(m.totalPurchases) },
    { label: o.expenses, value: nf.format(m.totalExpenses) },
    { label: o.debt, value: nf.format(m.outstandingDebt) },
    { label: o.owed, value: nf.format(m.owedToSuppliers) },
  ];

  const healthRows: { label: string; ok: boolean; note?: string }[] = [
    { label: h.db, ok: health.db },
    { label: h.backup, ok: health.backup },
    { label: h.masterSheet, ok: health.masterSheet },
    { label: h.telegram, ok: health.telegram },
    { label: h.rateLimit, ok: health.rateLimit },
    {
      label: h.allowlist,
      ok: health.adminAllowlist > 0,
      note: String(health.adminAllowlist),
    },
  ];

  return (
    <>
      <div>
        <h1 className={styles.title}>{dict.admin.title}</h1>
        <p className={styles.subtitle}>{o.system}</p>
      </div>

      <section className={styles.cards}>
        {cards.map((c) => (
          <div key={c.label} className={styles.card}>
            <span className={styles.cardLabel}>{c.label}</span>
            <span className={styles.cardValue}>{c.value}</span>
          </div>
        ))}
      </section>

      <section className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>{o.system}</h2>
          {healthRows.map((r) => (
            <div key={r.label} className={styles.detailRow}>
              <span>
                <span
                  className={`${styles.dot} ${r.ok ? styles.dotOk : styles.dotBad}`}
                />
                {r.label}
              </span>
              <span className={r.ok ? styles.statusOk : styles.statusBad}>
                {r.note ?? (r.ok ? h.configured : h.notConfigured)}
              </span>
            </div>
          ))}
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{h.lastBackup}</span>
            <span>{fmtDate(health.lastBackupAt)}</span>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>{o.recent}</h2>
          {m.recent.length === 0 ? (
            <p className={styles.empty}>{dict.admin.merchants.empty}</p>
          ) : (
            m.recent.map((r) => (
              <div key={r.id} className={styles.detailRow}>
                <Link
                  href={adminPath(`/merchants/${r.id}`) ?? "#"}
                  className={styles.rowLink}
                >
                  {safeDisplay(r.store_name)}
                </Link>
                <span className={styles.muted}>{fmtDate(r.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
