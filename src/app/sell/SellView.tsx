"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
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
import { PartyPicker, type Party } from "@/components/PartyPicker";
import { Receipt, type ReceiptLine } from "@/components/Receipt";
import { Spinner } from "@/components/Spinner";
import { safeDisplay } from "@/lib/validation/sanitize";
import {
  notifyOversell,
  notifyNewProductsBatch,
  notifySale,
} from "@/lib/messaging/actions";
import styles from "./sell.module.css";

const InlineScanner = dynamic(
  () => import("./InlineScanner").then((m) => m.InlineScanner),
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

function lineTotal(l: CartLine): number {
  return round2(l.qty * l.price * (1 - (l.discount || 0) / 100));
}

export function SellView({
  merchantId,
  currency,
  storeName,
  locale,
  tx,
  common,
  syncLabels,
}: Props) {
  const { online } = useSync(merchantId);
  const s = tx.sell;
  const payments = tx.payments as Record<string, string>;
  const ub = (s as Record<string, unknown>).unknownBarcode as Record<string, string> | undefined;

  // ── Cart ──
  const [cart, setCart] = useState<CartLine[]>([]);

  // ── Scanner ──
  const [scanning, setScanning] = useState(false);
  const [scanAfterSheet, setScanAfterSheet] = useState(false);

  // ── Search ──
  const [q, setQ] = useState("");

  // ── Scanner torch ──
  const [torch, setTorch] = useState(false);

  // ── UI feedback ──
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  // ── Unknown barcode sheet ──
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [savingNew, setSavingNew] = useState(false);

  // ── New barcodes batch (Telegram at end of sale) ──
  const [newBarcodeProducts, setNewBarcodeProducts] = useState<string[]>([]);

  // ── Summary sheet ──
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryPayment, setSummaryPayment] = useState<PaymentMethod>("cash");
  const [summaryCustomer, setSummaryCustomer] = useState<Party | null>(null);
  const [summaryPaid, setSummaryPaid] = useState("");
  const [summaryNote, setSummaryNote] = useState("");
  const [summaryDiscount, setSummaryDiscount] = useState("");

  // ── Oversell dialog ──
  const [overdraw, setOverdraw] = useState<{
    name: string;
    available: number;
    required: number;
  } | null>(null);

  // ── Receipt + success ──
  const [successFlash, setSuccessFlash] = useState(false);
  const [receipt, setReceipt] = useState<{
    lines: ReceiptLine[];
    total: number;
    date: string;
    invoiceNo: string;
  } | null>(null);

  // ── Products from IndexedDB ──
  const all = useLiveQuery(
    () =>
      getDb()
        .products.where("[merchant_id+_deleted]")
        .equals([merchantId, 0])
        .toArray(),
    [merchantId],
  );
  const products = useMemo(
    () => (all ?? []).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    [all],
  );

  const filteredProducts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.name_en?.toLowerCase().includes(needle) ?? false) ||
        (p.barcode?.toLowerCase().includes(needle) ?? false),
    );
  }, [products, q]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, l) => sum + lineTotal(l), 0),
    [cart],
  );
  const discountPct = parseFloat(summaryDiscount) || 0;
  const discountedTotal = discountPct > 0
    ? round2(cartTotal * (1 - discountPct / 100))
    : cartTotal;

  const cartProductIds = useMemo(
    () => new Set(cart.map((l) => l.product_id)),
    [cart],
  );

  // ── Helpers ──
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1500);
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
          price: round2(Number(p.sell_price)),
          discount: 0,
        },
      ];
    });
    showToast(`✅ ${safeDisplay(p.name)}`);
  }

  function updateQty(index: number, qty: number) {
    if (qty <= 0) {
      removeLine(index);
      return;
    }
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, qty } : l)));
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function closeScanner() {
    setScanning(false);
    setScanAfterSheet(false);
    setTorch(false);
  }

  // ── Barcode detection ──
  function onDetected(code: string) {
    const exact = products.find((p) => p.barcode === code);
    if (exact) {
      doAdd(exact);
      // scanner stays open (continuous)
    } else {
      closeScanner();
      setScanAfterSheet(true);
      setUnknownBarcode(code);
      setNewPrice("");
      setNewQty("1");
    }
  }

  function closeUnknownSheet() {
    setUnknownBarcode(null);
    if (scanAfterSheet) {
      setScanAfterSheet(false);
      setScanning(true);
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
      setNewBarcodeProducts((prev) => [...prev, unknownBarcode]);
      setUnknownBarcode(null);
      if (scanAfterSheet) {
        setScanAfterSheet(false);
        setScanning(true);
      }
      void syncAll(merchantId).catch(() => {});
    } finally {
      setSavingNew(false);
    }
  }

  // ── Sale flow ──
  function openSummary() {
    if (cart.length === 0 || saving) return;
    setSummaryOpen(true);
  }

  async function proceedFromSummary() {
    if (busyRef.current) return;
    if (summaryPayment !== "cash" && !summaryCustomer) {
      showToast(s.creditNoCustomer);
      return;
    }
    const db = getDb();
    for (const l of cart) {
      if (!l.product_id) continue;
      const p = await db.products.get(l.product_id);
      if (p && l.qty > Number(p.stock)) {
        setOverdraw({
          name: l.product_name,
          available: Number(p.stock),
          required: l.qty,
        });
        return;
      }
    }
    await doComplete();
  }

  async function doComplete() {
    if (busyRef.current) return;
    busyRef.current = true;
    const oversoldItem = overdraw;
    setOverdraw(null);
    setSummaryOpen(false);
    setSaving(true);
    try {
      const pct = parseFloat(summaryDiscount) || 0;
      const saleLines: CartLine[] = pct > 0
        ? cart.map((l) => ({ ...l, discount: pct }))
        : [...cart];

      const group = await recordSale({
        merchantId,
        currency,
        exchangeRate: 1,
        payment: summaryPayment,
        note: summaryNote.trim() || null,
        lines: saleLines,
        customerId: summaryCustomer?.id ?? null,
        paid: summaryPayment === "partial" ? Number(summaryPaid) || 0 : undefined,
      });

      const lines: ReceiptLine[] = saleLines.map((l) => ({
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
      const total = lines.reduce((sum, l) => sum + l.total, 0);

      const barcodes = [...newBarcodeProducts];
      setCart([]);
      setNewBarcodeProducts([]);
      setSummaryPayment("cash");
      setSummaryCustomer(null);
      setSummaryPaid("");
      setSummaryNote("");
      setSummaryDiscount("");

      void notifySale({ invoiceNo, total, currency, payment: summaryPayment }).catch(() => {});
      if (barcodes.length > 0) {
        void notifyNewProductsBatch(barcodes).catch(() => {});
      }
      if (oversoldItem) {
        void notifyOversell(
          oversoldItem.name,
          oversoldItem.available,
          oversoldItem.required,
        ).catch(() => {});
      }
      void syncAll(merchantId).catch(() => {});

      setSuccessFlash(true);
      setTimeout(() => {
        setSuccessFlash(false);
        setReceipt({ lines, total, date: new Date().toISOString(), invoiceNo });
      }, 2000);
    } catch {
      showToast("حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
  }

  // ── Render ──
  return (
    <div className={styles.page} dir="rtl">

      {/* Toast */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* Success flash */}
      {successFlash && (
        <div className={styles.successFlash}>
          <span className={styles.successIcon}>✅</span>
          <h2 className={styles.successTitle}>
            {(s as Record<string, unknown>).successTitle as string ?? "تم البيع ✅"}
          </h2>
          <p className={styles.successSub}>
            {(s as Record<string, unknown>).successSubtitle as string ?? "سُجّل بنجاح"}
          </p>
        </div>
      )}

      {/* ── 1. HEADER ── */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>{s.title}</h1>
        <Link href="/dashboard" className={styles.backLink}>
          {common.back} ←
        </Link>
      </header>

      {/* ── 2. SCAN AREA ── */}
      <div className={styles.scanArea}>
        {scanning ? (
          <>
            {/* Inline viewfinder */}
            <div className={styles.viewfinder} aria-label="ماسح الباركود">
              <InlineScanner
                className={styles.viewfinderCamera}
                onDetected={onDetected}
                onClose={closeScanner}
                torch={torch}
              />
              {/* Corner brackets */}
              <div className={`${styles.bracket} ${styles.bracketTR}`} aria-hidden="true" />
              <div className={`${styles.bracket} ${styles.bracketTL}`} aria-hidden="true" />
              <div className={`${styles.bracket} ${styles.bracketBR}`} aria-hidden="true" />
              <div className={`${styles.bracket} ${styles.bracketBL}`} aria-hidden="true" />
              {/* Scan line */}
              <div className={styles.scanLine} aria-hidden="true" />
              {/* Hint */}
              <div className={styles.viewfinderHint}>اضغط على الكاميرا للتركيز</div>
              {/* Torch toggle */}
              <button
                type="button"
                className={`${styles.torchBtn}${torch ? ` ${styles.torchBtnOn}` : ""}`}
                onClick={(e) => { e.stopPropagation(); setTorch((t) => !t); }}
                aria-label={torch ? "إيقاف الفلاش" : "تشغيل الفلاش"}
              >
                {/* Flashlight icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M9 3h6l-2 6h5L8 21l2-6H5L9 3z" />
                </svg>
              </button>
            </div>
            {/* Stop button */}
            <button
              type="button"
              className={styles.stopBtn}
              onClick={closeScanner}
            >
              ✕ إيقاف المسح
            </button>
          </>
        ) : (
          /* Idle: full-width navy button */
          <button
            type="button"
            className={styles.scanBtn}
            onClick={() => setScanning(true)}
            aria-label={s.scan}
          >
            {/* Barcode scanner icon */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 9V5a2 2 0 0 1 2-2h2M3 15v4a2 2 0 0 0 2 2h2M21 9V5a2 2 0 0 0-2-2h-2M21 15v4a2 2 0 0 1-2 2h-2M7 8v8M10 8v8M13 8v8M16 8v8" />
            </svg>
            امسح باركود
          </button>
        )}
      </div>

      {/* Offline strip */}
      {!online && (
        <div className={styles.offlineBanner} role="status">
          {syncLabels.offlineHint}
        </div>
      )}

      {/* ── 3. MAIN AREA ── */}
      <div className={styles.main}>

        {/* CART SECTION — only shown when cart has items */}
        {cart.length > 0 && (
          <div className={styles.cartSection}>
            <span className={styles.sectionLabel}>السلة</span>
            {cart.map((l, i) => (
              <div key={i} className={styles.cartItem}>
                {/* Stepper — RTL: [+] first child → right side */}
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepBtnPlus}
                    onClick={() => updateQty(i, l.qty + 1)}
                    aria-label="زيادة"
                  >
                    +
                  </button>
                  <input
                    type="number"
                    className={styles.stepNum}
                    value={l.qty}
                    min={0}
                    step="any"
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(e) => updateQty(i, Number(e.target.value) || 0)}
                    aria-label={s.qty}
                  />
                  <button
                    type="button"
                    className={styles.stepBtnMinus}
                    onClick={() => updateQty(i, l.qty - 1)}
                    aria-label="تقليل"
                  >
                    −
                  </button>
                </div>
                {/* Item info */}
                <div className={styles.cartItemInfo}>
                  <div className={styles.cartName}>{safeDisplay(l.product_name)}</div>
                  <div className={styles.cartTotal}>
                    {nf.format(lineTotal(l))} {currency}
                  </div>
                </div>
                {/* Trash button — last child in RTL → appears on LEFT */}
                <button
                  type="button"
                  className={styles.trashBtn}
                  onClick={() => removeLine(i)}
                  aria-label={`حذف ${l.product_name}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* PRODUCTS SECTION */}
        <div className={styles.productsSection}>
          <div className={styles.productsHeader}>
            <span className={styles.sectionLabel}>المنتجات</span>
            <div className={styles.searchBar}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, color: "var(--muted)" }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className={styles.searchInput}
                type="search"
                placeholder={s.searchProduct}
                aria-label={s.searchProduct}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setQ("")}
                  aria-label={common.cancel}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className={styles.productsList}>
            {filteredProducts.length === 0 ? (
              <div className={styles.productsEmpty}>
                {products.length === 0
                  ? "لا يوجد منتجات — أضف منتجات من قسم المنتجات"
                  : `لا نتائج لـ "${q}"`}
              </div>
            ) : (
              filteredProducts.map((p) => {
                const stock = Number(p.stock);
                const minStock = Number(p.min_stock);
                const out = stock <= 0;
                const low = !out && minStock > 0 && stock <= minStock;
                const inCart = cartProductIds.has(p.id);
                const cartQty = cart.find((l) => l.product_id === p.id)?.qty ?? 0;

                return (
                  <div key={p.id} className={styles.productRow}>
                    {/* [+] or ✓ — first child in RTL → right side */}
                    <button
                      type="button"
                      className={`${styles.addBtn}${inCart ? ` ${styles.addBtnInCart}` : ""}`}
                      onClick={() => { if (!inCart) doAdd(p); }}
                      aria-label={inCart ? `${p.name} في السلة` : `${s.add} ${p.name}`}
                      disabled={inCart}
                    >
                      {inCart ? "✓" : "+"}
                    </button>
                    <div className={styles.productInfo}>
                      <div className={styles.productName}>{safeDisplay(p.name)}</div>
                      <div className={styles.productMeta}>
                        <span className={styles.productPrice}>
                          {nf.format(Number(p.sell_price))} {currency}
                        </span>
                        <span>•</span>
                        <span className={out ? styles.stockOut : low ? styles.stockLow : styles.stockOk}>
                          {nf.format(stock)} متوفر
                        </span>
                        {inCart && (
                          <span className={styles.inCartBadge}>
                            في السلة{cartQty > 1 ? ` (${cartQty})` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── 4. BOTTOM BAR ── */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomMeta}>
          <div className={styles.totalGroup}>
            <div className={styles.totalLabel}>الإجمالي</div>
            <div className={styles.totalAmt}>
              {cart.length > 0 ? `${nf.format(cartTotal)} ${currency}` : "—"}
            </div>
          </div>
          {cart.length > 0 && (
            <span className={styles.itemCountChip}>
              {nf.format(cart.reduce((s, l) => s + l.qty, 0))}{" "}
              {(s as Record<string, unknown>).cartItems as string ?? "عناصر"}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.completeBtn}
          onClick={openSummary}
          disabled={saving || cart.length === 0}
        >
          {saving ? (
            <><Spinner />{s.completing}</>
          ) : (
            <>إتمام البيع <span aria-hidden>←</span></>
          )}
        </button>
      </div>

      {/* ── UNKNOWN BARCODE SHEET ── */}
      {unknownBarcode && (
        <div
          className={styles.backdrop}
          onClick={(e) => { if (e.target === e.currentTarget) closeUnknownSheet(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>{ub?.title ?? "منتج جديد 🆕"}</h2>
            <p className={styles.sheetHint}>{ub?.hint ?? "الباركود غير موجود:"}</p>

            <label className={styles.fieldLabel}>
              {ub?.barcodeLabel ?? "الباركود"}
              <input
                className={styles.inputReadonly}
                readOnly
                value={unknownBarcode}
              />
            </label>

            <div className={styles.fieldRow}>
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
                {ub?.qtyLabel ?? "الكمية بالمخزون"}
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
              <button type="button" className={styles.btnGhost} onClick={closeUnknownSheet}>
                {ub?.cancel ?? common.cancel}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void saveNewProduct()}
                disabled={savingNew || !newPrice}
              >
                {savingNew
                  ? <><Spinner />{ub?.saving ?? "جارٍ..."}</>
                  : (ub?.save ?? "حفظ وأضف للسلة")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SALE SUMMARY SHEET ── */}
      {summaryOpen && (
        <div
          className={styles.summaryBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget) setSummaryOpen(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.summarySheet}>
            <div className={styles.summaryHeader}>
              <h2 className={styles.summaryTitle}>
                {(s as Record<string, unknown>).summarySale as string ?? "ملخص البيع"}
              </h2>
              <button
                type="button"
                className={styles.summaryClose}
                onClick={() => setSummaryOpen(false)}
                aria-label={common.cancel}
              >
                ×
              </button>
            </div>

            <div className={styles.summaryItemsList}>
              {cart.map((l, i) => (
                <div key={i} className={styles.summaryItem}>
                  <span className={styles.siName}>{safeDisplay(l.product_name)}</span>
                  <span className={styles.siQty}>× {nf.format(l.qty)}</span>
                  <span className={styles.siAmt}>{nf.format(lineTotal(l))}</span>
                </div>
              ))}
            </div>

            <hr className={styles.divider} />

            <div className={styles.summaryTotalRow}>
              <span className={styles.summaryTotalLabel}>{s.total}</span>
              <span className={styles.summaryTotalAmt}>
                {nf.format(discountedTotal)} {currency}
              </span>
            </div>
            {discountPct > 0 && (
              <div className={styles.summaryDiscountRow}>
                <span>خصم {discountPct}%</span>
                <span>− {nf.format(round2(cartTotal - discountedTotal))} {currency}</span>
              </div>
            )}

            <label className={styles.fieldLabel}>
              {(s as Record<string, unknown>).summaryDiscount as string ?? "خصم %"}
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                step="any"
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                value={summaryDiscount}
                onChange={(e) => setSummaryDiscount(e.target.value)}
              />
            </label>

            <div>
              <span className={styles.optLabel}>{s.payment}</span>
              <div className={styles.segment}>
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.chip}${summaryPayment === m ? ` ${styles.chipActive}` : ""}`}
                    onClick={() => setSummaryPayment(m)}
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
                value={summaryCustomer}
                onChange={setSummaryCustomer}
                labels={{
                  search: s.searchCustomer,
                  none: s.walkIn,
                  add: tx.party.add,
                  selected: tx.party.selected,
                  change: tx.party.change,
                }}
              />
            </div>

            {summaryPayment === "partial" && (
              <label className={styles.fieldLabel}>
                {s.paidNow} ({currency})
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  dir="ltr"
                  value={summaryPaid}
                  onChange={(e) => setSummaryPaid(e.target.value)}
                />
              </label>
            )}

            {summaryPayment !== "cash" && summaryCustomer && (
              <div className={styles.debtRow}>
                <span className={styles.muted}>{s.remaining}</span>
                <span className={styles.debtAmt}>
                  {nf.format(
                    summaryPayment === "credit"
                      ? discountedTotal
                      : Math.max(0, discountedTotal - (Number(summaryPaid) || 0)),
                  )}{" "}
                  {currency}
                </span>
              </div>
            )}

            <textarea
              className={styles.textarea}
              placeholder={(s as Record<string, unknown>).summaryNote as string ?? "ملاحظة"}
              rows={2}
              value={summaryNote}
              onChange={(e) => setSummaryNote(e.target.value)}
            />

            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => void proceedFromSummary()}
              disabled={saving}
            >
              {saving
                ? <><Spinner />{s.completing}</>
                : ((s as Record<string, unknown>).summaryConfirm as string ?? "تأكيد البيع ✓")}
            </button>
          </div>
        </div>
      )}

      {/* ── OVERSELL DIALOG ── */}
      {overdraw && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.confirmBox}>
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
            <p className={styles.warnQ}>{s.oversellQuestion}</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setOverdraw(null)}>
                {s.oversellNo}
              </button>
              <button
                type="button"
                className={styles.btnWarn}
                onClick={() => void doComplete()}
                disabled={saving}
              >
                {saving ? <><Spinner />{s.completing}</> : s.oversellYes}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT ── */}
      {receipt && (
        <Receipt
          storeName={storeName}
          currency={currency}
          locale={locale}
          dateIso={receipt.date}
          lines={receipt.lines}
          total={receipt.total}
          invoiceNo={receipt.invoiceNo}
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
    </div>
  );
}
