"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getLocalCustomer, deleteCustomerLocal } from "@/lib/offline/customers-repo";
import {
  getCustomerLedger,
  recordDebtPayment,
  customerDebtStart,
} from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { parsePositive } from "@/lib/validation/transaction";
import { whatsappNumber } from "@/lib/validation/customer";
import { sendDebtReminder } from "@/lib/messaging/actions";
import type { TxType } from "@/lib/offline/db";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { CustomerForm } from "./CustomerForm";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  id: string;
  merchantId: string;
  currency: string;
  storeName: string;
  locale: Locale;
  appName: string;
  customers: Dictionary["customers"];
  common: Dictionary["common"];
  tx: Dictionary["transactions"];
  sync: Dictionary["products"]["sync"];
};

function badgeClass(type: TxType): string {
  if (type === "sell") return styles.badgeSell;
  if (type === "debt_payment") return styles.badgePay;
  return styles.badgeReturn;
}

export function CustomerView({
  id,
  merchantId,
  currency,
  storeName,
  locale,
  appName,
  customers: c,
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
  const [reminding, startRemind] = useTransition();
  const [remindMsg, setRemindMsg] = useState<string | null>(null);

  const customer = useLiveQuery(() => getLocalCustomer(id), [id]);
  const ledger =
    useLiveQuery(() => getCustomerLedger(merchantId, id), [merchantId, id]) ?? [];
  const types = tx.types as Record<string, string>;

  const debt = Number(customer?.debt_balance ?? 0);
  const debtStart = useMemo(() => customerDebtStart(ledger), [ledger]);
  const ageDays = debtStart
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(debtStart).getTime()) / 86400000),
      )
    : null;
  const ageClass =
    ageDays == null
      ? ""
      : ageDays <= 7
        ? styles.ageFresh
        : ageDays <= 30
          ? styles.ageDue
          : styles.ageOver;

  if (customer === undefined) {
    return (
      <main className={styles.main}>
        <p className={styles.count}>{common.loading}</p>
      </main>
    );
  }
  if (customer === null || customer._deleted) {
    return (
      <main className={styles.main}>
        <p className={styles.error} role="alert">
          {c.errors.not_found}
        </p>
        <Link href="/customers" className={styles.back}>
          {c.backToList}
        </Link>
      </main>
    );
  }

  function openPay() {
    setAmount(debt > 0 ? String(debt) : "");
    setPayNote("");
    setPayError(null);
    setPayOpen(true);
  }

  async function submitPay() {
    const amt = parsePositive(amount);
    if (amt == null) {
      setPayError(c.pay.invalid);
      return;
    }
    setSaving(true);
    try {
      await recordDebtPayment({
        merchantId,
        customerId: id,
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

  function remind() {
    const num = whatsappNumber(customer!.phone);
    const text = c.reminderText
      .replace("{name}", customer!.name)
      .replace("{store}", storeName)
      .replace("{amount}", nf.format(debt))
      .replace("{currency}", currency);
    window.open(
      `https://wa.me/${num}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  }

  // Owner-triggered reminder sent automatically from the store's WhatsApp
  // (Green API), via the RLS-scoped server action.
  function autoRemind() {
    setRemindMsg(null);
    startRemind(async () => {
      const res = await sendDebtReminder(id);
      if ("ok" in res) setRemindMsg(c.remindSent);
      else
        setRemindMsg(
          res.error === "not_configured"
            ? c.whatsappOff
            : res.error === "no_phone"
              ? c.noPhone
              : c.remindFail,
        );
    });
  }

  async function onDelete() {
    if (!window.confirm(c.deleteConfirm)) return;
    await deleteCustomerLocal(id);
    void syncAll(merchantId).catch(() => {});
    router.push("/customers");
  }

  const num = whatsappNumber(customer.phone);

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
        <h1 className={styles.title}>{customer.name}</h1>
        <Link href="/customers" className={styles.back}>
          {c.backToList}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={styles.profile}>
        {(customer.phone || customer.neighborhood) && (
          <span className={styles.profileMeta}>
            {[customer.phone, customer.neighborhood].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className={styles.profileBalanceLabel}>
          {debt < 0 ? c.credit : c.debt}
        </span>
        <span
          className={styles.profileBalance}
          style={{
            color: debt > 0 ? "var(--error)" : debt < 0 ? "var(--primary)" : undefined,
          }}
        >
          {debt === 0 ? c.noDebt : `${nf.format(Math.abs(debt))} ${currency}`}
        </span>
        {ageDays != null && debt > 0 && (
          <span>
            <span className={`${styles.txBadge} ${ageClass}`}>
              {c.aging.label} {c.aging.days.replace("{n}", nf.format(ageDays))}
            </span>
          </span>
        )}

        <div className={styles.partyActions}>
          <button type="button" className={styles.btnGo} onClick={openPay}>
            {c.pay.title}
          </button>
          {num && debt > 0 && (
            <button type="button" className={styles.btnGhost} onClick={remind}>
              {c.remind}
            </button>
          )}
          {num && debt > 0 && (
            <button
              type="button"
              className={styles.btnGhost}
              onClick={autoRemind}
              disabled={reminding}
            >
              {c.remindAuto}
            </button>
          )}
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => setEditing((v) => !v)}
          >
            {c.edit}
          </button>
        </div>
        {remindMsg && <p className={styles.profileMeta}>{remindMsg}</p>}
      </div>

      {editing && (
        <CustomerForm
          mode="edit"
          merchantId={merchantId}
          initial={customer}
          customers={c}
          common={common}
          onSaved={() => setEditing(false)}
        />
      )}

      <div>
        <p className={styles.count}>{c.ledger}</p>
        {ledger.length === 0 ? (
          <p className={styles.pickerEmpty}>{c.ledgerEmpty}</p>
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
          {c.delete}
        </button>
      </div>

      {payOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.confirmBox}>
            <p className={styles.confirmTitle} style={{ color: "var(--text)" }}>
              {c.pay.title}
            </p>
            {payError && (
              <p className={styles.error} role="alert">
                {payError}
              </p>
            )}
            <label className={styles.label}>
              {c.pay.amount} ({currency})
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
            {debt > 0 && (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setAmount(String(debt))}
              >
                {c.pay.full}
              </button>
            )}
            <label className={styles.label}>
              {c.pay.note} <span className={styles.muted}>({common.optional})</span>
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
                {c.pay.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
