import { requireSuperadmin } from "@/lib/security/admin";
import { getSecurityLogs, getAdminLogs } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { safeDisplay } from "@/lib/validation/sanitize";
import styles from "../rafraf-admin.module.css";

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n) + "…" : s);

export default async function AdminSecurityPage() {
  await requireSuperadmin();
  const [events, adminLog, locale] = await Promise.all([
    getSecurityLogs(100),
    getAdminLogs(100),
    getCurrentLocale(),
  ]);
  const dict = await getDictionary(locale);
  const s = dict.admin.security;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
      dateStyle: "short",
      timeStyle: "short",
    });

  const sevPill = (sev: string) => {
    if (sev === "high") return { cls: styles.pillBad, label: s.high };
    if (sev === "med") return { cls: styles.pillWarn, label: s.med };
    return { cls: styles.pill, label: s.low };
  };

  const summarize = (det: Record<string, unknown> | null) =>
    det ? clip(safeDisplay(JSON.stringify(det))) : "—";

  return (
    <>
      <div>
        <h1 className={styles.title}>{s.title}</h1>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{s.events}</h2>
        {events.length === 0 ? (
          <p className={styles.empty}>{s.empty}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{s.type}</th>
                  <th>{s.severity}</th>
                  <th>{s.ip}</th>
                  <th>{s.when}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const p = sevPill(e.severity);
                  return (
                    <tr key={e.id}>
                      <td title={summarize(e.details)}>{e.type}</td>
                      <td>
                        <span className={`${styles.pill} ${p.cls}`}>
                          {p.label}
                        </span>
                      </td>
                      <td className={styles.muted} dir="ltr">
                        {e.ip ?? "—"}
                      </td>
                      <td className={styles.muted}>{fmt(e.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{s.adminLog}</h2>
        {adminLog.length === 0 ? (
          <p className={styles.empty}>{s.empty}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{s.action}</th>
                  <th>{s.actor}</th>
                  <th>{s.when}</th>
                </tr>
              </thead>
              <tbody>
                {adminLog.map((l) => (
                  <tr key={l.id}>
                    <td title={summarize(l.details)}>{l.action}</td>
                    <td className={styles.muted} dir="ltr">
                      {l.actor_email ?? "—"}
                    </td>
                    <td className={styles.muted}>{fmt(l.created_at)}</td>
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
