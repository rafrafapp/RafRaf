"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminMerchant } from "@/lib/admin/queries";
import { safeDisplay } from "@/lib/validation/sanitize";
import styles from "../rafraf-admin.module.css";

type Labels = {
  search: string;
  results: string;
  store: string;
  email: string;
  plan: string;
  role: string;
  lastActive: string;
  created: string;
  view: string;
  empty: string;
  never: string;
};

export function MerchantsTable({
  rows,
  basePath,
  plans,
  roles,
  labels,
  locale,
}: {
  rows: AdminMerchant[];
  basePath: string;
  plans: Record<string, string>;
  roles: Record<string, string>;
  labels: Labels;
  locale: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(
      (r) =>
        r.store_name.toLowerCase().includes(n) ||
        (r.email?.toLowerCase().includes(n) ?? false) ||
        (r.phone?.toLowerCase().includes(n) ?? false),
    );
  }, [rows, q]);

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === "ar" ? "ar" : "en-GB")
      : labels.never;

  return (
    <>
      <input
        className={styles.input}
        type="search"
        placeholder={labels.search}
        aria-label={labels.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className={styles.subtitle}>
        {labels.results}: {filtered.length}
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{labels.store}</th>
              <th>{labels.email}</th>
              <th>{labels.plan}</th>
              <th>{labels.role}</th>
              <th>{labels.lastActive}</th>
              <th>{labels.created}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{safeDisplay(r.store_name)}</td>
                <td className={styles.muted} dir="ltr">
                  {r.email ?? "—"}
                </td>
                <td>{plans[r.plan] ?? r.plan}</td>
                <td>{roles[r.role] ?? r.role}</td>
                <td className={styles.muted}>{fmt(r.last_active)}</td>
                <td className={styles.muted}>{fmt(r.created_at)}</td>
                <td>
                  <Link
                    className={styles.rowLink}
                    href={`${basePath}/merchants/${r.id}`}
                  >
                    {labels.view}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className={styles.empty}>{labels.empty}</p>}
    </>
  );
}
