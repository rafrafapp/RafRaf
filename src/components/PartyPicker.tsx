"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/offline/db";
import { saveCustomer } from "@/lib/offline/customers-repo";
import { saveSupplier } from "@/lib/offline/suppliers-repo";
import { syncAll } from "@/lib/offline/sync";
import { safeDisplay } from "@/lib/validation/sanitize";
import styles from "./transactions.module.css";

// A minimal party projection shared by both stores.
export type Party = { id: string; name: string; phone: string | null };

type Props = {
  merchantId: string;
  kind: "customer" | "supplier";
  value: Party | null;
  onChange: (p: Party | null) => void;
  labels: {
    search: string;
    none: string; // "walk-in" / "no supplier"
    add: string; // "Add «{q}»"
    selected: string;
    change: string;
  };
};

// Pick (or quick-create) a customer/supplier for a sale or purchase. Reads the
// local store live, filters client-side, and can create a party by name on the
// fly (offline-first) so a credit sale never stalls on data entry.
export function PartyPicker({ merchantId, kind, value, onChange, labels }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // Normalize to Party inside each branch so the two stores' row types don't
  // surface as a union (whose array methods wouldn't unify).
  const rows = useLiveQuery<Party[]>(async () => {
    const db = getDb();
    if (kind === "customer") {
      const list = await db.customers
        .where("[merchant_id+_deleted]")
        .equals([merchantId, 0])
        .toArray();
      return list.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
    }
    const list = await db.suppliers
      .where("[merchant_id+_deleted]")
      .equals([merchantId, 0])
      .toArray();
    return list.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
  }, [merchantId, kind]);
  const all = rows ?? [];

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? all.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            (r.phone?.toLowerCase().includes(needle) ?? false),
        )
      : all;
    return [...list]
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .slice(0, 20);
  }, [all, q]);

  const exact = useMemo(
    () => all.some((r) => r.name.trim().toLowerCase() === q.trim().toLowerCase()),
    [all, q],
  );

  async function quickAdd() {
    const name = q.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const id =
        kind === "customer"
          ? await saveCustomer({
              mode: "create",
              merchantId,
              data: { name, phone: null, neighborhood: null, telegram_chat_id: null },
            })
          : await saveSupplier({
              mode: "create",
              merchantId,
              data: { name, phone: null, payment_terms: null },
            });
      onChange({ id, name, phone: null });
      setQ("");
      void syncAll(merchantId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className={styles.partySelected}>
        <span className={styles.partyName}>
          {labels.selected}: <strong>{safeDisplay(value.name)}</strong>
        </span>
        <button
          type="button"
          className={styles.removeBtn}
          onClick={() => onChange(null)}
        >
          {labels.change}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        <input
          className={styles.pickerInput}
          type="search"
          placeholder={labels.search}
          aria-label={labels.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={styles.pickerScan}
          onClick={() => onChange(null)}
        >
          {labels.none}
        </button>
      </div>

      {(results.length > 0 || (q.trim() && !exact)) && (
        <ul className={styles.pickerResults}>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.pickerItem}
                onClick={() => {
                  onChange({ id: r.id, name: r.name, phone: r.phone });
                  setQ("");
                }}
              >
                <span className={styles.pickerName}>{safeDisplay(r.name)}</span>
                {r.phone && (
                  <span className={styles.pickerMeta} dir="ltr">
                    {r.phone}
                  </span>
                )}
              </button>
            </li>
          ))}
          {q.trim() && !exact && (
            <li>
              <button
                type="button"
                className={styles.pickerItem}
                onClick={quickAdd}
                disabled={busy}
              >
                <span className={styles.pickerName}>
                  {labels.add.replace("{q}", q.trim())}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
