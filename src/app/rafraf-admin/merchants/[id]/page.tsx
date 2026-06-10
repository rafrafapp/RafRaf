import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/security/admin";
import { getMerchantDetail } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { safeDisplay } from "@/lib/validation/sanitize";
import { adminPath } from "@/lib/security/admin-path";
import {
  PlanControl,
  BillingForm,
  ImpersonateButton,
} from "../../controls";
import styles from "../../rafraf-admin.module.css";

const nf = new Intl.NumberFormat("en-US");

export default async function AdminMerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperadmin();
  const { id } = await params;
  const detail = await getMerchantDetail(id);
  if (!detail) notFound();

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const d = dict.admin.detail;
  const { merchant } = detail;

  const impersonating =
    (await cookies()).get("rafraf_impersonate")?.value === id;
  const storeName =
    locale === "en" && merchant.store_name_en
      ? merchant.store_name_en
      : merchant.store_name;

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";

  const txTypes = dict.transactions.types as Record<string, string>;

  const stats: { label: string; value: string }[] = [
    { label: d.products, value: nf.format(detail.products) },
    { label: d.transactions, value: nf.format(detail.transactions) },
    { label: d.customers, value: nf.format(detail.customers) },
    { label: d.suppliers, value: nf.format(detail.suppliers) },
    {
      label: d.debt,
      value: `${nf.format(detail.outstandingDebt)} ${merchant.default_currency}`,
    },
  ];

  return (
    <>
      <div>
        <Link href={adminPath("/merchants") ?? "/dashboard"} className={styles.rowLink}>
          ← {dict.admin.merchants.title}
        </Link>
        <h1 className={styles.title}>{safeDisplay(storeName)}</h1>
        <p className={styles.subtitle} dir="ltr">
          {merchant.email ?? "—"} · {merchant.phone ?? "—"}
        </p>
      </div>

      {impersonating && (
        <div className={styles.banner}>
          <span>{d.impersonating.replace("{store}", safeDisplay(storeName))}</span>
          <ImpersonateButton
            merchantId={id}
            active
            labels={{ start: d.impersonate, stop: d.stopImpersonate }}
          />
        </div>
      )}

      <section className={styles.cards}>
        {stats.map((s) => (
          <div key={s.label} className={styles.card}>
            <span className={styles.cardLabel}>{s.label}</span>
            <span className={styles.cardValue}>{s.value}</span>
          </div>
        ))}
      </section>

      <section className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>{d.plan}</h2>
          <PlanControl
            merchantId={id}
            plan={merchant.plan}
            plans={dict.admin.plans}
            labels={{
              save: d.save,
              saving: dict.common.loading,
              saved: d.saved,
              failed: dict.admin.actionFailed,
            }}
          />
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{d.lastPaid}</span>
            <span>{fmt(merchant.last_paid_at)}</span>
          </div>
          {!impersonating && (
            <div className={styles.controlRow}>
              <ImpersonateButton
                merchantId={id}
                active={false}
                labels={{ start: d.impersonate, stop: d.stopImpersonate }}
              />
            </div>
          )}
        </div>

        <BillingForm
          merchantId={id}
          notes={merchant.billing_notes}
          labels={{
            title: d.billing,
            placeholder: d.billingNotes,
            save: d.save,
            markPaid: d.markPaid,
            saved: d.saved,
            failed: dict.admin.actionFailed,
          }}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{d.recentTx}</h2>
        {detail.recentTx.length === 0 ? (
          <p className={styles.empty}>{d.noTx}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {detail.recentTx.map((t) => (
                  <tr key={t.id}>
                    <td>{safeDisplay(t.product_name ?? txTypes[t.type] ?? t.type)}</td>
                    <td className={styles.muted}>{txTypes[t.type] ?? t.type}</td>
                    <td>
                      {nf.format(t.total)} {merchant.default_currency}
                    </td>
                    <td className={styles.muted}>{fmt(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
