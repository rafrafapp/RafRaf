"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { useCurrencies, symbolFor } from "@/lib/offline/useCurrencies";
import {
  getInvoice,
  buildInvoiceNumbers,
  formatInvoiceNo,
} from "@/lib/offline/transactions-repo";
import { safeDisplay } from "@/lib/validation/sanitize";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BackButton } from "@/components/BackButton";
import { Receipt, type ReceiptLine } from "@/components/Receipt";
import styles from "@/components/transactions.module.css";

const nf = new Intl.NumberFormat("en-US");

type Props = {
  id: string;
  merchantId: string;
  storeName: string;
  currency: string;
  locale: Locale;
  appName: string;
  tx: Dictionary["transactions"];
  common: Dictionary["common"];
};

export function InvoiceView({
  id,
  merchantId,
  storeName,
  locale,
  appName,
  tx,
  common,
}: Props) {
  useSync(merchantId);
  const { currencies, base } = useCurrencies(merchantId);
  const [showReceipt, setShowReceipt] = useState(false);

  const rows = useLiveQuery(() => getInvoice(merchantId, id), [merchantId, id]);
  const allRows =
    useLiveQuery(
      () => getDb().transactions.where("merchant_id").equals(merchantId).toArray(),
      [merchantId],
      [],
    ) ?? [];

  const lines = rows ?? [];
  const first = lines[0];
  const customer = useLiveQuery(
    () => (first?.customer_id ? getDb().customers.get(first.customer_id) : undefined),
    [first?.customer_id],
  );
  const supplier = useLiveQuery(
    () => (first?.supplier_id ? getDb().suppliers.get(first.supplier_id) : undefined),
    [first?.supplier_id],
  );

  const types = tx.types as Record<string, string>;
  const payments = tx.payments as Record<string, string>;
  const s = tx.sell;
  const loading = rows === undefined;

  const total = lines.reduce((sum, l) => sum + Number(l.total), 0);
  const paid = lines.reduce((sum, l) => sum + Number(l.paid), 0);
  const remaining = total - paid;
  // Multi-currency: this invoice's own currency + the snapshotted rate.
  const txCur = first?.currency ?? "SYP";
  const txRate = Number(first?.exchange_rate ?? 1) || 1;
  const cur = symbolFor(currencies, txCur);
  const baseSym = base?.symbol ?? "ل.س";
  const isBaseTx = txRate === 1;
  const totalSyp = total * txRate;
  const isSell = first?.type === "sell";
  const group = first?.group_uuid ?? null;
  const invoiceNo = group
    ? formatInvoiceNo(buildInvoiceNumbers(allRows).get(group))
    : "";
  const dateStr = first
    ? new Date(first.created_at).toLocaleString(locale === "ar" ? "ar" : "en-GB")
    : "";

  const receiptLines: ReceiptLine[] = lines
    .filter((l) => l.product_id || l.product_name)
    .map((l) => ({
      name: l.product_name ?? "",
      qty: l.qty,
      price: l.price,
      total: Number(l.total),
    }));

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <span className={styles.logo}>{appName}</span>
        <div className={styles.headerActions}>
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: common.arabic, english: common.english }}
          />
        </div>
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{tx.receipt.title}</h1>
        <BackButton label={common.back} fallback="/transactions" />
      </div>

      {loading ? (
        <p className={styles.count}>{common.loading}</p>
      ) : lines.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{tx.list.emptyFiltered}</p>
        </div>
      ) : (
        <div className={styles.invoiceCard}>
          <div className={styles.invoiceHead}>
            <div>
              <div className={styles.invoiceNoBig}>
                {invoiceNo || types[first.type]}
              </div>
              <div className={styles.invoiceDate}>{dateStr}</div>
            </div>
            <span className={`${styles.txBadge}`}>{types[first.type]}</span>
          </div>

          <div className={styles.invoiceMetaGrid}>
            <span className={styles.invoiceMetaKey}>{s.payment}</span>
            <span className={styles.invoiceMetaVal}>
              {payments[first.payment] ?? first.payment}
            </span>
            {customer && (
              <>
                <span className={styles.invoiceMetaKey}>{s.customer}</span>
                <span className={styles.invoiceMetaVal}>
                  {safeDisplay(customer.name)}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </span>
              </>
            )}
            {supplier && (
              <>
                <span className={styles.invoiceMetaKey}>{tx.buy.supplier}</span>
                <span className={styles.invoiceMetaVal}>
                  {safeDisplay(supplier.name)}
                  {supplier.phone ? ` · ${supplier.phone}` : ""}
                </span>
              </>
            )}
            <span className={styles.invoiceMetaKey}>{s.items}</span>
            <span className={styles.invoiceMetaVal}>{nf.format(lines.length)}</span>
            {!isBaseTx && (
              <>
                <span className={styles.invoiceMetaKey}>{tx.currency}</span>
                <span className={styles.invoiceMetaVal}>{txCur}</span>
                <span className={styles.invoiceMetaKey}>{tx.rateLabel}</span>
                <span className={styles.invoiceMetaVal}>
                  1 {txCur} = {nf.format(txRate)} {baseSym}
                </span>
              </>
            )}
          </div>

          <ul className={styles.invoiceLines}>
            {lines.map((l) => (
              <li key={l.client_uuid} className={styles.invoiceLine}>
                <span className={styles.invoiceLineName}>
                  {safeDisplay(l.product_name ?? types[l.type])}{" "}
                  {(l.qty > 0 || l.price > 0) && (
                    <span className={styles.invoiceLineQty}>
                      ({nf.format(l.qty)} × {nf.format(l.price)})
                    </span>
                  )}
                </span>
                <span>
                  {nf.format(Number(l.total))} {cur}
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.invoiceTotalRow}>
            <span>{s.total}</span>
            <span>
              {nf.format(total)} {cur}
            </span>
          </div>
          {!isBaseTx && (
            <div className={styles.invoiceTotalRow}>
              <span className={styles.invoiceMetaKey}>{tx.inBase}</span>
              <span className={styles.invoiceMetaKey}>
                ≈ {nf.format(totalSyp)} {baseSym}
              </span>
            </div>
          )}

          {paid > 0 && paid < total && (
            <div className={styles.invoiceMetaGrid}>
              <span className={styles.invoiceMetaKey}>{s.paidNow}</span>
              <span className={styles.invoiceMetaVal}>
                {nf.format(paid)} {cur}
              </span>
              <span className={styles.invoiceMetaKey}>{s.remaining}</span>
              <span className={styles.invoiceMetaVal}>
                {nf.format(remaining)} {cur}
              </span>
            </div>
          )}

          {first.note && (
            <div className={styles.invoiceNote}>{safeDisplay(first.note)}</div>
          )}

          {isSell && receiptLines.length > 0 && (
            <button
              type="button"
              className={styles.btnGo}
              onClick={() => setShowReceipt(true)}
            >
              {tx.receipt.print}
            </button>
          )}
        </div>
      )}

      {showReceipt && first && (
        <Receipt
          storeName={storeName}
          currency={cur}
          locale={locale}
          dateIso={first.created_at}
          lines={receiptLines}
          total={total}
          invoiceNo={invoiceNo}
          sypTotal={isBaseTx ? null : totalSyp}
          baseSymbol={baseSym}
          labels={{
            title: tx.receipt.title,
            print: tx.receipt.print,
            share: tx.receipt.share,
            thanks: tx.receipt.thanks,
            total: tx.receipt.total,
            newSale: tx.receipt.close,
          }}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </main>
  );
}
