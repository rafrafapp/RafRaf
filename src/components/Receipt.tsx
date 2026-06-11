"use client";

import type { Locale } from "@/i18n/config";
import { escapeHtml } from "@/lib/validation/sanitize";
import { sanitizeString } from "@/lib/validation/sanitize-html";
import styles from "./transactions.module.css";

export type ReceiptLine = {
  name: string;
  qty: number;
  price: number;
  total: number;
};

type Props = {
  storeName: string;
  currency: string;
  locale: Locale;
  dateIso: string;
  lines: ReceiptLine[];
  total: number;
  labels: {
    title: string;
    print: string;
    share: string;
    thanks: string;
    total: string;
    newSale: string;
  };
  onClose: () => void;
};

const nf = new Intl.NumberFormat("en-US");

// User text destined for the print window's HTML: strip markup, then escape.
const safeHtml = (s: string) => escapeHtml(sanitizeString(s));

// Printable, shareable sale receipt rendered after completing a cart. Print opens
// a self-contained window (no app print-CSS gymnastics); share uses the native
// Web Share sheet (Telegram, SMS, …) with a clipboard fallback — no WhatsApp.
export function Receipt({
  storeName,
  currency,
  locale,
  dateIso,
  lines,
  total,
  labels,
  onClose,
}: Props) {
  const dateStr = new Date(dateIso).toLocaleString(
    locale === "ar" ? "ar" : "en-GB",
  );

  function buildText(): string {
    const sep = "------------------------";
    const body = lines
      .map(
        (l) =>
          `${l.name}  ${nf.format(l.qty)}×${nf.format(l.price)} = ${nf.format(l.total)} ${currency}`,
      )
      .join("\n");
    return [
      storeName,
      dateStr,
      sep,
      body,
      sep,
      `${labels.total}: ${nf.format(total)} ${currency}`,
      labels.thanks,
    ].join("\n");
  }

  async function share() {
    const text = buildText();
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // user dismissed the native share sheet
    }
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard unavailable — nothing more to do */
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=360,height=640");
    if (!w) return;
    const dir = locale === "ar" ? "rtl" : "ltr";
    const rows = lines
      .map(
        (l) =>
          `<tr><td>${safeHtml(l.name)}</td><td class="n">${nf.format(l.qty)}×${nf.format(l.price)}</td><td class="n">${nf.format(l.total)}</td></tr>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(labels.title)}</title>` +
        `<style>body{font-family:system-ui,'Segoe UI','Noto Sans Arabic',sans-serif;padding:12px;max-width:320px;margin:auto}` +
        `h1{font-size:18px;text-align:center;margin:0 0 2px}.d{text-align:center;color:#666;font-size:12px;margin-bottom:8px}` +
        `table{width:100%;border-collapse:collapse;font-size:13px}td{padding:3px 0;border-bottom:1px dashed #ccc}` +
        `.n{text-align:end;white-space:nowrap}.t{display:flex;justify-content:space-between;font-weight:700;margin-top:8px;font-size:15px}` +
        `.th{text-align:center;color:#666;font-size:12px;margin-top:10px}</style></head><body>` +
        `<h1>${safeHtml(storeName)}</h1><div class="d">${escapeHtml(dateStr)}</div>` +
        `<table>${rows}</table>` +
        `<div class="t"><span>${escapeHtml(labels.total)}</span><span>${nf.format(total)} ${safeHtml(currency)}</span></div>` +
        `<div class="th">${escapeHtml(labels.thanks)}</div>` +
        `</body></html>`,
    );
    w.document.close();
    // Trigger print from the opener (bundled JS) rather than an inline script in
    // the new window — the strict CSP would block an inherited inline script.
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      <div className={styles.receipt}>
        <p className={styles.receiptStore}>{storeName}</p>
        <p className={styles.receiptDate}>{dateStr}</p>
        <ul className={styles.receiptLines}>
          {lines.map((l, i) => (
            <li key={i} className={styles.receiptLine}>
              <span>
                {l.name}{" "}
                <span className={styles.receiptLineQty}>
                  ({nf.format(l.qty)}×{nf.format(l.price)})
                </span>
              </span>
              <span>
                {nf.format(l.total)} {currency}
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.receiptTotal}>
          <span>{labels.total}</span>
          <span>
            {nf.format(total)} {currency}
          </span>
        </div>
        <p className={styles.receiptThanks}>{labels.thanks}</p>
        <div className={styles.receiptActions}>
          <button type="button" className={styles.btnGhost} onClick={print}>
            {labels.print}
          </button>
          <button type="button" className={styles.btnGhost} onClick={share}>
            {labels.share}
          </button>
        </div>
        <button type="button" className={styles.btnGo} onClick={onClose}>
          {labels.newSale}
        </button>
      </div>
    </div>
  );
}
