import { requireSuperadmin } from "@/lib/security/admin";
import { getBackupStatuses } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { safeDisplay } from "@/lib/validation/sanitize";
import { BackupGlobalControls, BackupRunButton } from "../controls";
import styles from "../rafraf-admin.module.css";

export default async function AdminBackupsPage() {
  await requireSuperadmin();
  const { perMerchant, failures } = await getBackupStatuses();
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const b = dict.admin.backups;

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : b.never;

  const pill = (status: string | null) => {
    if (status === "success") return { cls: styles.pillOk, label: b.success };
    if (status === "error") return { cls: styles.pillBad, label: b.error };
    return { cls: styles.pillWarn, label: b.never };
  };

  return (
    <>
      <div>
        <h1 className={styles.title}>{b.title}</h1>
      </div>

      <BackupGlobalControls
        labels={{
          runAll: b.runAll,
          updateMaster: b.updateMaster,
          running: b.running,
          done: b.done,
          failed: dict.admin.actionFailed,
        }}
      />

      <section className={styles.section}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{b.store}</th>
                <th>{b.status}</th>
                <th>{b.lastRun}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {perMerchant.map((r) => {
                const p = pill(r.status);
                return (
                  <tr key={r.merchantId}>
                    <td>{safeDisplay(r.storeName)}</td>
                    <td>
                      <span className={`${styles.pill} ${p.cls}`}>{p.label}</span>
                    </td>
                    <td className={styles.muted}>{fmt(r.at)}</td>
                    <td>
                      <BackupRunButton
                        merchantId={r.merchantId}
                        labels={{
                          runNow: b.runNow,
                          running: b.running,
                          done: b.done,
                          failed: dict.admin.actionFailed,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{b.failures}</h2>
        {failures.length === 0 ? (
          <p className={styles.empty}>{b.noFailures}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id}>
                    <td className={styles.muted}>{f.scope ?? "—"}</td>
                    <td className={styles.statusBad} title={f.error ?? ""}>
                      {safeDisplay(f.error ?? "—")}
                    </td>
                    <td className={styles.muted}>{fmt(f.created_at)}</td>
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
