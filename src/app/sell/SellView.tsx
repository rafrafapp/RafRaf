"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb, type LocalProduct, type PaymentMethod } from "@/lib/offline/db";
import { recordSale, type CartLine } from "@/lib/offline/transactions-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { PAYMENT_METHODS } from "@/lib/validation/transaction";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
import { ProductPicker } from "@/components/ProductPicker";
import { PartyPicker, type Party } from "@/components/PartyPicker";
import { Receipt, type ReceiptLine } from "@/components/Receipt";
import { Spinner } from "@/components/Spinner";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  storeName: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
  scanLabels: {
    title: string;
    hint: string;
    error: string;
    close: string;
    upload: string;
  };
};

function lineTotal(l: CartLine): number {
  return l.qty * l.price * (1 - (l.discount || 0) / 100);
}

export function SellView({
  merchantId,
  currency,
  storeName,
  locale,
  appName,
  tx,
  common,
  syncLabels,
  scanLabels,
}: Props) {
  const { online, syncing, sync } = useSync(merchantId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customer, setCustomer] = useState<Party | null>(null);
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [overdraw, setOverdraw] = useState(false);
  const [receipt, setReceipt] = useState<{
    lines: ReceiptLine[];
    total: number;
    date: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Synchronous re-entrancy guard: complete() awaits a Dexie stock read before
  // saving flips, so a ref (not state) is what actually blocks a double-submit.
  const busyRef = useRef(false);

  const s = tx.sell;
  const payments = tx.payments as Record<string, string>;

  function doAdd(p: LocalProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === p.id);
      if (existing) {
        return prev.map((l) =>
          l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          qty: 1,
          price: Number(p.sell_price),
          discount: 0,
        },
      ];
    });
  }

  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const total = cart.reduce((sum, l) => sum + lineTotal(l), 0);

  // Soft-block: if any line would drive stock negative (oversell), confirm first.
  // Checked at completion so it catches every path — scan, quick-add, or editing
  // the qty field directly. The sale is still allowed (negative stock is a UI soft
  // block, not a DB constraint).
  async function complete() {
    if (cart.length === 0 || busyRef.current) return;
    const db = getDb();
    for (const l of cart) {
      if (!l.product_id) continue;
      const p = await db.products.get(l.product_id);
      if (p && l.qty > Number(p.stock)) {
        setOverdraw(true);
        return;
      }
    }
    await proceedComplete();
  }

  async function proceedComplete() {
    if (cart.length === 0 || busyRef.current) return;
    busyRef.current = true;
    setOverdraw(false);
    setSaving(true);
    try {
      await recordSale({
        merchantId,
        currency,
        payment,
        note: note.trim() || null,
        lines: cart,
        customerId: customer?.id ?? null,
        paid: payment === "partial" ? Number(paid) || 0 : undefined,
      });
      const lines: ReceiptLine[] = cart.map((l) => ({
        name: l.product_name,
        qty: l.qty,
        price: l.price,
        total: lineTotal(l),
      }));
      setReceipt({
        lines,
        total: lines.reduce((sum, l) => sum + l.total, 0),
        date: new Date().toISOString(),
      });
      setCart([]);
      setNote("");
      setPayment("cash");
      setCustomer(null);
      setPaid("");
      void syncAll(merchantId).catch(() => {});
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
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
        <h1 className={styles.title}>{s.title}</h1>
        <Link href="/dashboard" className={styles.back}>
          {tx.list.title}
        </Link>
      </div>

      {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

      <ProductPicker
        merchantId={merchantId}
        currency={currency}
        onPick={doAdd}
        labels={{
          search: s.searchProduct,
          scan: s.scan,
          empty: tx.list.emptyFiltered,
          noProducts: tx.noProducts,
          available: s.available,
        }}
        scanLabels={scanLabels}
      />

      {cart.length === 0 ? (
        <p className={styles.cartEmpty}>{s.cartEmpty}</p>
      ) : (
        <div className={styles.cart}>
          {cart.map((l, i) => (
            <div key={i} className={styles.cartLine}>
              <div className={styles.cartHead}>
                <span className={styles.cartName}>{l.product_name}</span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeLine(i)}
                >
                  {s.remove}
                </button>
              </div>
              <div className={styles.cartControls}>
                <label className={styles.miniLabel}>
                  {s.qty}
                  <input
                    className={styles.miniInput}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    dir="ltr"
                    value={l.qty}
                    onChange={(e) =>
                      updateLine(i, { qty: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label className={styles.miniLabel}>
                  {s.price}
                  <input
                    className={styles.miniInput}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    dir="ltr"
                    value={l.price}
                    onChange={(e) =>
                      updateLine(i, { price: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label className={styles.miniLabel}>
                  {s.discount}
                  <input
                    className={styles.miniInput}
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    inputMode="decimal"
                    dir="ltr"
                    value={l.discount}
                    onChange={(e) =>
                      updateLine(i, { discount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
              </div>
              <div className={styles.lineFoot}>
                <span className={styles.muted}>{s.total}</span>
                <span className={styles.lineTotal}>
                  {nf.format(lineTotal(l))} {currency}
                </span>
              </div>
            </div>
          ))}

          <div className={styles.summary}>
            <div className={styles.segment}>
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.chip} ${payment === m ? styles.chipActive : ""}`}
                  onClick={() => setPayment(m)}
                >
                  {payments[m]}
                </button>
              ))}
            </div>

            <label className={styles.label}>{s.customer}</label>
            <PartyPicker
              merchantId={merchantId}
              kind="customer"
              value={customer}
              onChange={setCustomer}
              labels={{
                search: s.searchCustomer,
                none: s.walkIn,
                add: tx.party.add,
                selected: tx.party.selected,
                change: tx.party.change,
              }}
            />

            {payment === "partial" && (
              <label className={styles.label}>
                {s.paidNow} ({currency})
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  dir="ltr"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </label>
            )}

            {payment !== "cash" &&
              (customer ? (
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>{s.remaining}</span>
                  <span className={styles.debtPos}>
                    {nf.format(
                      payment === "credit"
                        ? total
                        : Math.max(0, total - (Number(paid) || 0)),
                    )}{" "}
                    {currency}
                  </span>
                </div>
              ) : (
                <p className={styles.offlineHint}>{s.creditNoCustomer}</p>
              ))}

            <textarea
              className={styles.textarea}
              placeholder={s.note}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>{s.total}</span>
              <span className={styles.totalValue}>
                {nf.format(total)} {currency}
              </span>
            </div>
            <button
              type="button"
              className={styles.submit}
              onClick={complete}
              disabled={saving || cart.length === 0}
            >
              {saving ? (
                <>
                  <Spinner />
                  {s.completing}
                </>
              ) : (
                s.complete
              )}
            </button>
          </div>
        </div>
      )}

      {overdraw && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.confirmBox}>
            <p className={styles.confirmTitle}>{s.oversellTitle}</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setOverdraw(false)}
              >
                {s.oversellNo}
              </button>
              <button
                type="button"
                className={styles.btnWarn}
                onClick={() => void proceedComplete()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Spinner />
                    {s.completing}
                  </>
                ) : (
                  s.oversellYes
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <Receipt
          storeName={storeName}
          currency={currency}
          locale={locale}
          dateIso={receipt.date}
          lines={receipt.lines}
          total={receipt.total}
          labels={{
            title: tx.receipt.title,
            print: tx.receipt.print,
            share: tx.receipt.share,
            thanks: tx.receipt.thanks,
            total: tx.receipt.total,
            newSale: s.newSale,
          }}
          onClose={() => setReceipt(null)}
        />
      )}
    </main>
  );
}
