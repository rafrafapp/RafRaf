"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getLocalSupplier, deleteSupplierLocal } from "@/lib/offline/suppliers-repo";
import {
  getSupplierLedger,
  recordSupplierPayment,
} from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { parsePositive } from "@/lib/validation/transaction";
import type { TxType } from "@/lib/offline/db";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { Spinner } from "@/components/Spinner";
import { SupplierForm } from "./SupplierForm";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  id: string;
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  suppliers: Dictionary["suppliers"];
  common: Dictionary["common"];
  tx: Dictionary["transactions"];
  sync: Dictionary["products"]["sync"];
};

function badgeClass(type: TxType): string {
  if (type === "buy") return styles.badgeBuy;
  if (type === "supplier_payment") return styles.badgePay;
  return styles.badgeReturn;
}

export function SupplierView({
  id,
  merchantId,
  currency,
  locale,
  appName,
  suppliers: s,
  common,
  tx,
  sync: syncLabels,
}: Props) {
  const { online, syncing, sync } = useSync(merchantId);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const supplier = useLiveQuery(() => getLocalSupplier(id), [id]);
  const ledger =
    useLiveQuery(() => getSupplierLedger(merchantId, id), [merchantId, id]) ?? [];
  const types = tx.types as Record<string, string>;

  const owed = Number(supplier?.balance_owed ?? 0);

  if (supplier === undefined) {
    return (
      <main className={styles.main}>
        <p className={styles.count}>{common.loading}</p>
      </main>
    );
  }
  if (supplier === null || supplier._deleted) {
    return (
      <main className={styles.main}>
        <p className={styles.error} role="alert">
          {s.errors.not_found}
        </p>
        <Link href="/suppliers" className={styles.back}>
          {s.backToList}
        </Link>
      </main>
    );
  }

  function openPay() {
    setAmount(owed > 0 ? String(owed) : "");
    setPayNote("");
    setPayError(null);
    setPayOpen(true);
  }

  async function submitPay() {
    const amt = parsePositive(amount);
    if (amt == null) {
      setPayError(s.pay.invalid);
      return;
    }
    setSaving(true);
    try {
      await recordSupplierPayment({
        merchantId,
        supplierId: id,
        amount: amt,
        currency,
        note: payNote.trim() || null,
      });
      void syncAll(merchantId).catch(() => {});
      setPayOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(s.deleteConfirm)) return;
    await deleteSupplierLocal(id);
    void syncAll(merchantId).catch(() => {});
    router.push("/suppliers");
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.logo}>
          {appName}
        </Link>
        <div className={styles.headerActions}>
          <SyncBadge
            merchantId={merchantId}
            online={online}
            syncing={syncing}
            onSync={() => void sync()}
            labels={syncLabels}
          />
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
        </div>
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{supplier.name}</h1>
        <Link href="/suppliers" className={styles.back}>
          {s.backToList}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.profile}>
        {(supplier.phone || supplier.payment_terms) && (
          <span className={styles.profileMeta}>
            {[supplier.phone, supplier.payment_terms].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className={styles.profileBalanceLabel}>
          {owed < 0 ? s.advance : s.owed}
        </span>
        <span
          className={styles.profileBalance}
          style={{
            color: owed > 0 ? "var(--error)" : owed < 0 ? "var(--primary)" : undefined,
          }}
        >
          {owed === 0 ? s.noOwed : `${nf.format(Math.abs(owed))} ${currency}`}
        </span>

        <div className={styles.partyActions}>
          <button type="button" className={styles.btnGo} onClick={openPay}>
            {s.pay.title}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setEditing((v) => !v)}
          >
            {s.edit}
          </button>
        </div>
      </div>

      {editing && (
        <SupplierForm
          mode="edit"
          merchantId={merchantId}
          initial={supplier}
          suppliers={s}
          common={common}
          onSaved={() => setEditing(false)}
        />
      )}

      <div>
        <p className={styles.count}>{s.ledger}</p>
        {ledger.length === 0 ? (
          <p className={styles.pickerEmpty}>{s.ledgerEmpty}</p>
        ) : (
          <ul className={styles.list}>
            {ledger.map((t) => (
              <li key={t.client_uuid} className={styles.txRow}>
                <div className={styles.txMain}>
                  <span className={styles.txName}>
                    {t.product_name ?? types[t.type]}
                  </span>
                  <div className={styles.txMeta}>
                    <span className={`${styles.txBadge} ${badgeClass(t.type)}`}>
                      {types[t.type]}
                    </span>
                    <span>
                      {new Date(t.created_at).toLocaleString(
                        locale === "ar" ? "ar" : "en-GB",
                        { dateStyle: "short", timeStyle: "short" },
                      )}
                    </span>
                  </div>
                </div>
                <span className={styles.txAmount}>
                  {nf.format(Number(t.total))} {t.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.partyActions}>
        <button
          type="button"
          className={styles.btnGhost}
          style={{ color: "var(--error)" }}
          onClick={onDelete}
        >
          {s.delete}
        </button>
      </div>

      {payOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.confirmBox}>
            <p className={styles.confirmTitle} style={{ color: "var(--text)" }}>
              {s.pay.title}
            </p>
            {payError && (
              <p className={styles.error} role="alert">
                {payError}
              </p>
            )}
            <label className={styles.label}>
              {s.pay.amount} ({currency})
              <input
                className={styles.input}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {owed > 0 && (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setAmount(String(owed))}
              >
                {s.pay.full}
              </button>
            )}
            <label className={styles.label}>
              {s.pay.note} <span className={styles.muted}>({common.optional})</span>
              <input
                className={styles.input}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </label>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setPayOpen(false)}
              >
                {tx.sell.cancel}
              </button>
              <button
                type="button"
                className={styles.btnGo}
                onClick={submitPay}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Spinner />
                    {s.pay.save}
                  </>
                ) : (
                  s.pay.save
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
