"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay, type TutorialStep } from "@/components/Tutorial/TutorialOverlay";
import { getDb, type LocalProduct, type PaymentMethod } from "@/lib/offline/db";
import {
  recordSale,
  buildInvoiceNumbers,
  formatInvoiceNo,
  type CartLine,
} from "@/lib/offline/transactions-repo";
import { saveProduct } from "@/lib/offline/products-repo";
import { syncAll } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/useSync";
import { PAYMENT_METHODS } from "@/lib/validation/transaction";
import { fromBase, toBase } from "@/lib/validation/currency";
import { useCurrencies, rateFor } from "@/lib/offline/useCurrencies";
import { CurrencySelect } from "@/components/CurrencySelect";
import { PartyPicker, type Party } from "@/components/PartyPicker";
import { Receipt, type ReceiptLine } from "@/components/Receipt";
import { Spinner } from "@/components/Spinner";
import { BackButton } from "@/components/BackButton";
import { safeDisplay } from "@/lib/validation/sanitize";
import { notifyOversell, notifyNewProduct } from "@/lib/messaging/actions";
import styles from "./sell.module.css";

const BarcodeScanner = dynamic(
  () => import("@/components/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false },
);

const nf = new Intl.NumberFormat("en-US");
const round2 = (n: number) => Math.round(n * 100) / 100;

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

const SELL_STEPS: TutorialStep[] = [
  { target: "#search-bar", title_ar: "ابحث عن المنتج", text_ar: "اكتب اسم المنتج أو امسح الباركود", position: "bottom" },
  { target: "#barcode-btn", title_ar: "مسح الباركود", text_ar: "اضغط لفتح الكاميرا ومسح باركود المنتج", position: "bottom" },
  { target: "#cart-section", title_ar: "سلة المشتريات", text_ar: "المنتجات اللي اخترتها تظهر هنا — اسحب لليسار لحذف", position: "top" },
  { target: "#payment-selector", title_ar: "طريقة الدفع", text_ar: "اختر كاش أو دين أو دفع جزئي", position: "top" },
  { target: "#confirm-sale-btn", title_ar: "إتمام البيع", text_ar: "اضغط هنا لإتمام البيع وتسجيله بالسجل", position: "top" },
];

function lineTotal(l: CartLine): number {
  return l.qty * l.price * (1 - (l.discount || 0) / 100);
}

export function SellView({
  merchantId,
  currency,
  storeName,
  locale,
  tx,
  common,
  syncLabels,
  scanLabels,
}: Props) {
  const tutorial = useTutorial("sell");
  const { online } = useSync(merchantId);
  const { currencies, base } = useCurrencies(merchantId);
  const [currencyCode, setCurrencyCode] = useState<string>("");
  const selected = currencies.find((c) => c.code === currencyCode) ?? base ?? null;
  const code = selected?.code ?? "SYP";
  const rate = selected ? Number(selected.rate_to_base) || 1 : 1;
  const symbol = selected?.symbol ?? "ل.س";
  const baseSymbol = base?.symbol ?? "ل.س";
  const isBase = !selected || selected.is_base;

  // Search state (lifted from ProductPicker into this view)
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [customer, setCustomer] = useState<Party | null>(null);
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");

  // UI state
  const [toast, setToast] = useState<string | null>(null);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [overdraw, setOverdraw] = useState<{ name: string; available: number; required: number } | null>(null);
  const [receipt, setReceipt] = useState<{
    lines: ReceiptLine[];
    total: number;
    date: string;
    invoiceNo: string;
    currencySymbol: string;
    sypTotal: number | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  // Unknown barcode modal state
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [savingNew, setSavingNew] = useState(false);

  // Swipe tracking
  const touchStartX = useRef<number | null>(null);

  const s = tx.sell;
  const ub = (s as Record<string, unknown>).unknownBarcode as Record<string, string> | undefined;
  const payments = tx.payments as Record<string, string>;

  // All products from IndexedDB
  const all = useLiveQuery(
    () => getDb().products.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
    [merchantId],
  );
  const products = all ?? [];

  // Search results
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const list = products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.name_en?.toLowerCase().includes(needle) ?? false) ||
        (p.barcode?.toLowerCase().includes(needle) ?? false),
    );
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ar")).slice(0, 30);
  }, [products, q]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

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
          price: round2(fromBase(Number(p.sell_price), rate)),
          discount: 0,
        },
      ];
    });
    setQ("");
    showToast(`✓ ${safeDisplay(p.name)} — ${s.addedToCart ?? "أضيف للسلة"}`);
  }

  function changeCurrency(newCode: string) {
    const oldRate = rate;
    const newRate = rateFor(currencies, newCode);
    setCart((prev) =>
      prev.map((l) => ({
        ...l,
        price: round2(fromBase(toBase(l.price, oldRate), newRate)),
      })),
    );
    setPaid("");
    setCurrencyCode(newCode);
  }

  function updateQty(index: number, qty: number) {
    if (qty <= 0) {
      removeLineAnimated(index);
      return;
    }
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, qty } : l)));
  }

  function removeLineAnimated(index: number) {
    setRemovingIdx(index);
    setTimeout(() => {
      setCart((prev) => prev.filter((_, i) => i !== index));
      setRemovingIdx(null);
    }, 200);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent, index: number) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -80) removeLineAnimated(index); // swipe left to delete
  }

  function onDetected(code: string) {
    setScanning(false);
    const exact = products.find((p) => p.barcode === code);
    if (exact) {
      doAdd(exact);
    } else {
      setUnknownBarcode(code);
      setNewPrice("");
      setNewQty("1");
    }
  }

  async function saveNewProduct() {
    if (!unknownBarcode || !newPrice || savingNew) return;
    const price = parseFloat(newPrice);
    const qty = parseInt(newQty) || 1;
    if (!price || price <= 0) return;
    setSavingNew(true);
    try {
      const id = await saveProduct({
        mode: "create",
        merchantId,
        data: {
          name: `منتج-${unknownBarcode}`,
          name_en: undefined,
          barcode: unknownBarcode,
          category: undefined,
          cost_price: 0,
          sell_price: price,
          stock: qty,
          min_stock: 0,
          unit: undefined,
          notes: undefined,
          custom_fields: {},
        },
      });
      const newProduct: LocalProduct = {
        id,
        merchant_id: merchantId,
        name: `منتج-${unknownBarcode}`,
        name_en: null,
        barcode: unknownBarcode,
        category: null,
        subcategory: null,
        cost_price: 0,
        sell_price: price,
        stock: qty,
        min_stock: 0,
        unit: null,
        supplier_id: null,
        image_url: null,
        image_public_id: null,
        notes: null,
        custom_fields: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _sync: "pending",
        _op: "upsert",
        _deleted: 0,
        _base_updated_at: null,
      };
      doAdd(newProduct);
      setUnknownBarcode(null);
      void notifyNewProduct(unknownBarcode).catch(() => {});
      void syncAll(merchantId).catch(() => {});
    } finally {
      setSavingNew(false);
    }
  }

  const total = cart.reduce((sum, l) => sum + lineTotal(l), 0);

  async function complete() {
    if (cart.length === 0 || busyRef.current) return;
    if (payment !== "cash" && !customer) {
      showToast(s.creditNoCustomer);
      return;
    }
    const db = getDb();
    for (const l of cart) {
      if (!l.product_id) continue;
      const p = await db.products.get(l.product_id);
      if (p && l.qty > Number(p.stock)) {
        setOverdraw({ name: l.product_name, available: Number(p.stock), required: l.qty });
        return;
      }
    }
    await proceedComplete();
  }

  async function proceedComplete() {
    if (cart.length === 0 || busyRef.current) return;
    busyRef.current = true;
    const oversold = overdraw;
    setOverdraw(null);
    setSaving(true);
    try {
      const group = await recordSale({
        merchantId,
        currency: code,
        exchangeRate: rate,
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
      const allTx = await getDb()
        .transactions.where("merchant_id")
        .equals(merchantId)
        .toArray();
      const invoiceNo = formatInvoiceNo(buildInvoiceNumbers(allTx).get(group));
      const recTotal = lines.reduce((sum, l) => sum + l.total, 0);
      setReceipt({
        lines,
        total: recTotal,
        date: new Date().toISOString(),
        invoiceNo,
        currencySymbol: symbol,
        sypTotal: isBase ? null : recTotal * rate,
      });
      setCart([]);
      setNote("");
      setPayment("cash");
      setCustomer(null);
      setPaid("");
      if (oversold)
        void notifyOversell(oversold.name, oversold.available, oversold.required).catch(() => {});
      void syncAll(merchantId).catch(() => {});
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
  }

  return (
    <div className={styles.page}>
      {/* Toast */}
      {toast && <div className={styles.toast} role="status">{toast}</div>}

      {/* ── Sticky top: header + search ── */}
      <div className={styles.stickyTop}>
        <div className={styles.topHeader}>
          <BackButton label={common.back} fallback="/dashboard" />
          <h1 className={styles.topTitle}>{s.title}</h1>
          <button type="button" className={styles.helpBtn} onClick={tutorial.reset} aria-label="شرح التطبيق">
            ؟
          </button>
        </div>
        <div className={styles.searchRow}>
          <input
            id="search-bar"
            className={styles.searchInput}
            type="search"
            inputMode="search"
            placeholder={s.searchProduct}
            aria-label={s.searchProduct}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            id="barcode-btn"
            type="button"
            className={styles.scanBtn}
            onClick={() => setScanning(true)}
            aria-label={s.scan}
          >
            {/* Barcode SVG icon */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9V5a2 2 0 0 1 2-2h2M3 15v4a2 2 0 0 0 2 2h2M21 9V5a2 2 0 0 0-2-2h-2M21 15v4a2 2 0 0 1-2 2h-2M7 8v8M10 8v8M13 8v8M16 8v8" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Scrollable middle ── */}
      <div className={styles.scrollArea}>
        <div className={styles.scrollInner}>
          {!online && <p className={styles.offlineHint}>{syncLabels.offlineHint}</p>}

          {q ? (
            /* Search results */
            results.length === 0 ? (
              <p className={styles.resultsEmpty}>{tx.list.emptyFiltered}</p>
            ) : (
              <ul className={styles.results}>
                {results.map((p) => {
                  const stock = Number(p.stock);
                  const minStock = Number(p.min_stock);
                  const out = stock <= 0;
                  const low = !out && minStock > 0 && stock <= minStock;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={styles.resultItem}
                        onClick={() => doAdd(p)}
                      >
                        <span className={styles.resultName}>{safeDisplay(p.name)}</span>
                        <span className={styles.resultMeta}>
                          {nf.format(Number(p.sell_price))} {currency}
                          <span className={`${styles.stockBadge} ${out ? styles.badgeOut : low ? styles.badgeLow : styles.badgeOk}`}>
                            {nf.format(stock)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : cart.length === 0 ? (
            /* Empty state */
            <div className={styles.emptyState}>
              <svg className={styles.emptyIcon} width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9V5a2 2 0 0 1 2-2h2M3 15v4a2 2 0 0 0 2 2h2M21 9V5a2 2 0 0 0-2-2h-2M21 15v4a2 2 0 0 1-2 2h-2M7 8v8M10 8v8M13 8v8M16 8v8" />
              </svg>
              <p className={styles.emptyText}>{(s as Record<string, unknown>).scanEmpty as string ?? "امسح باركود أو ابحث عن منتج"}</p>
            </div>
          ) : (
            /* Cart items + options */
            <>
              <div className={styles.cartSection} id="cart-section">
                {cart.map((l, i) => (
                  <div
                    key={i}
                    className={styles.cartItemWrap}
                    onTouchStart={onTouchStart}
                    onTouchEnd={(e) => onTouchEnd(e, i)}
                  >
                    <div className={styles.cartItemDelete} aria-hidden>حذف</div>
                    <div className={`${styles.cartItem}${removingIdx === i ? ` ${styles.removing}` : ""}`}>
                      <div className={styles.cartItemMain}>
                        <span className={styles.cartItemName}>{safeDisplay(l.product_name)}</span>
                        <span className={styles.cartItemPrice}>{nf.format(l.price)} {symbol}</span>
                      </div>
                      <div className={styles.cartItemRight}>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => updateQty(i, l.qty - 1)}
                            aria-label="تقليل"
                          >
                            −
                          </button>
                          <input
                            className={styles.stepInput}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            dir="ltr"
                            value={l.qty}
                            onChange={(e) => updateQty(i, Number(e.target.value) || 0)}
                            aria-label={s.qty}
                          />
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => updateQty(i, l.qty + 1)}
                            aria-label="زيادة"
                          >
                            +
                          </button>
                        </div>
                        <span className={styles.cartItemTotal}>
                          {nf.format(lineTotal(l))}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payment options card */}
              <div className={styles.optionsCard} id="payment-selector">
                {currencies.length > 1 && (
                  <div>
                    <span className={styles.optLabel}>{tx.currency}</span>
                    <CurrencySelect
                      currencies={currencies}
                      value={code}
                      onChange={changeCurrency}
                      locale={locale}
                      className={styles.select}
                    />
                  </div>
                )}

                <div>
                  <span className={styles.optLabel}>{s.payment}</span>
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
                </div>

                <div>
                  <span className={styles.optLabel}>{s.customer}</span>
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
                </div>

                {payment === "partial" && (
                  <label className={styles.fieldLabel}>
                    {s.paidNow} ({symbol})
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

                {payment !== "cash" && customer && (
                  <div className={styles.debtRow}>
                    <span className={styles.muted}>{s.remaining}</span>
                    <span className={styles.debtAmt}>
                      {nf.format(
                        payment === "credit"
                          ? total
                          : Math.max(0, total - (Number(paid) || 0)),
                      )}{" "}
                      {symbol}
                    </span>
                  </div>
                )}

                {!isBase && total > 0 && (
                  <div className={styles.debtRow}>
                    <span className={styles.muted}>{tx.inBase}</span>
                    <span className={styles.muted}>≈ {nf.format(total * rate)} {baseSymbol}</span>
                  </div>
                )}

                <textarea
                  className={styles.textarea}
                  placeholder={s.note}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Fixed bottom bar: summary + confirm ── */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomSummary}>
          {cart.length > 0 && (
            <span className={styles.bottomCount}>
              {nf.format(cart.length)} {(s as Record<string, unknown>).cartItems as string ?? "منتج في السلة"}
            </span>
          )}
          <span className={styles.bottomTotal}>
            {cart.length > 0 ? `${nf.format(total)} ${symbol}` : "—"}
          </span>
        </div>
        <button
          id="confirm-sale-btn"
          type="button"
          className={styles.confirmBtn}
          onClick={complete}
          disabled={saving || cart.length === 0}
        >
          {saving ? (
            <>
              <Spinner />
              {s.completing}
            </>
          ) : (
            (s as Record<string, unknown>).confirmSale as string ?? s.complete
          )}
        </button>
      </div>

      {/* ── Scanner ── */}
      {scanning && (
        <BarcodeScanner
          onDetected={onDetected}
          onClose={() => setScanning(false)}
          labels={scanLabels}
        />
      )}

      {/* ── Unknown barcode sheet ── */}
      {unknownBarcode && (
        <div
          className={styles.sheetBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget) { setUnknownBarcode(null); } }}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.sheetCard}>
            <h2 className={styles.sheetTitle}>{ub?.title ?? "منتج جديد"}</h2>
            <p className={styles.sheetHint}>{ub?.hint ?? "الباركود غير موجود. أكمل البيانات الأساسية:"}</p>

            <label className={styles.fieldLabel}>
              {ub?.barcodeLabel ?? "الباركود"}
              <input className={styles.readonlyInput} readOnly value={unknownBarcode} />
            </label>

            <div className={styles.sheetRow}>
              <label className={styles.fieldLabel}>
                {ub?.priceLabel ?? "سعر البيع *"}
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  autoFocus
                />
              </label>
              <label className={styles.fieldLabel}>
                {ub?.qtyLabel ?? "الكمية"}
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  step="1"
                  inputMode="numeric"
                  dir="ltr"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </label>
            </div>

            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setUnknownBarcode(null)}
              >
                {ub?.cancel ?? "إلغاء"}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={saveNewProduct}
                disabled={savingNew || !newPrice}
              >
                {savingNew ? (ub?.saving ?? "جاري الحفظ...") : (ub?.save ?? "حفظ وإضافة للسلة")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Oversell warning ── */}
      {overdraw && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={`${styles.confirmBox} ${styles.warnBox}`}>
            <p className={styles.warnTitle}>{s.oversellTitle}</p>
            <div className={styles.warnRows}>
              <div className={styles.warnRow}>
                <span>{s.oversellProduct}</span>
                <strong>{overdraw.name}</strong>
              </div>
              <div className={styles.warnRow}>
                <span>{s.oversellAvailable}</span>
                <strong className={styles.warnAvail}>{nf.format(overdraw.available)}</strong>
              </div>
              <div className={styles.warnRow}>
                <span>{s.oversellRequired}</span>
                <strong>{nf.format(overdraw.required)}</strong>
              </div>
            </div>
            <p className={styles.warnQuestion}>{s.oversellQuestion}</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setOverdraw(null)}>
                {s.oversellNo}
              </button>
              <button
                type="button"
                className={styles.btnWarn}
                onClick={() => void proceedComplete()}
                disabled={saving}
              >
                {saving ? <><Spinner />{s.completing}</> : s.oversellYes}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt ── */}
      {receipt && (
        <Receipt
          storeName={storeName}
          currency={receipt.currencySymbol}
          locale={locale}
          dateIso={receipt.date}
          lines={receipt.lines}
          total={receipt.total}
          invoiceNo={receipt.invoiceNo}
          sypTotal={receipt.sypTotal}
          baseSymbol={baseSymbol}
          labels={{
            title: tx.receipt.title,
            print: tx.receipt.print,
            share: tx.receipt.share,
            pdf: tx.receipt.pdf,
            thanks: tx.receipt.thanks,
            total: tx.receipt.total,
            newSale: s.newSale,
          }}
          onClose={() => setReceipt(null)}
        />
      )}

      {/* ── Tutorial ── */}
      {tutorial.show && (
        <TutorialOverlay
          steps={SELL_STEPS}
          onComplete={tutorial.onComplete}
          onSkip={tutorial.onSkip}
        />
      )}
    </div>
  );
}
