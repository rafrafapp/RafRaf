"use client";

import { useState } from "react";
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
  invoiceNo?: string;
  // When the sale is in a non-base currency, the SYP-equivalent total + base symbol.
  sypTotal?: number | null;
  baseSymbol?: string;
  labels: {
    title: string;
    print: string;
    share: string;
    pdf: string;
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
  invoiceNo,
  sypTotal,
  baseSymbol,
  labels,
  onClose,
}: Props) {
  const [pdfBusy, setPdfBusy] = useState(false);
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
      ...(invoiceNo ? [invoiceNo] : []),
      dateStr,
      sep,
      body,
      sep,
      `${labels.total}: ${nf.format(total)} ${currency}`,
      ...(sypTotal != null
        ? [`≈ ${nf.format(sypTotal)} ${baseSymbol ?? ""}`]
        : []),
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
        `<h1>${safeHtml(storeName)}</h1>${invoiceNo ? `<div class="d">${escapeHtml(invoiceNo)}</div>` : ""}<div class="d">${escapeHtml(dateStr)}</div>` +
        `<table>${rows}</table>` +
        `<div class="t"><span>${escapeHtml(labels.total)}</span><span>${nf.format(total)} ${safeHtml(currency)}</span></div>` +
        (sypTotal != null
          ? `<div class="th">≈ ${nf.format(sypTotal)} ${safeHtml(baseSymbol ?? "")}</div>`
          : "") +
        `<div class="th">${escapeHtml(labels.thanks)}</div>` +
        `</body></html>`,
    );
    w.document.close();
    // Trigger print from the opener (bundled JS) rather than an inline script in
    // the new window — the strict CSP would block an inherited inline script.
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  // Direct PDF download (no print dialog). Renders the invoice to a clean A4-width
  // node (inline hex styles so html2canvas never chokes), then lays it onto an
  // **A4 portrait** page scaled to fit the width with 15mm margins, splitting
  // across pages for long invoices. Never cuts content on mobile.
  async function downloadPdf() {
    setPdfBusy(true);
    let node: HTMLDivElement | null = null;
    try {
      const [{ default: jsPDF }, h2c] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = h2c.default;
      const dir = locale === "ar" ? "rtl" : "ltr";
      const cell =
        "padding:8px 4px;border-bottom:1px solid #e2e8f0;font-size:15px;";
      const numCell = `${cell}text-align:end;white-space:nowrap;`;
      const rows = lines
        .map(
          (l) =>
            `<tr><td style="${cell}">${safeHtml(l.name)}</td><td style="${numCell}">${nf.format(l.qty)}×${nf.format(l.price)}</td><td style="${numCell}">${nf.format(l.total)}</td></tr>`,
        )
        .join("");
      // A4-proportioned width (px) so scaling to the page reads like a document.
      node = document.createElement("div");
      node.setAttribute("dir", dir);
      node.style.cssText =
        "position:fixed;left:-10000px;top:0;width:720px;padding:28px;background:#ffffff;color:#111827;font-family:'Segoe UI','Noto Sans Arabic',Arial,sans-serif;z-index:-1;";
      node.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px;">` +
        `<div style="font-size:26px;font-weight:800;color:#1e3a8a;">${safeHtml(storeName)}</div>` +
        `<div style="text-align:end;">${invoiceNo ? `<div style="font-size:18px;font-weight:700;color:#1e3a8a;">${escapeHtml(invoiceNo)}</div>` : ""}<div style="color:#666;font-size:13px;">${escapeHtml(dateStr)}</div></div>` +
        `</div>` +
        `<table style="width:100%;border-collapse:collapse;">${rows}</table>` +
        `<div style="display:flex;justify-content:space-between;font-weight:700;margin-top:14px;font-size:18px;border-top:2px solid #1e3a8a;padding-top:10px;"><span>${escapeHtml(labels.total)}</span><span>${nf.format(total)} ${safeHtml(currency)}</span></div>` +
        (sypTotal != null
          ? `<div style="text-align:end;color:#666;font-size:13px;margin-top:4px;">≈ ${nf.format(sypTotal)} ${safeHtml(baseSymbol ?? "")}</div>`
          : "") +
        `<div style="text-align:center;color:#1e3a8a;font-size:13px;margin-top:18px;">${escapeHtml(labels.thanks)}</div>`;
      document.body.appendChild(node);

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const data = canvas.toDataURL("image/jpeg", 0.92);

      // A4 portrait, 15mm margins, fit-to-width, multi-page.
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "p" });
      const margin = 15;
      const contentW = 210 - margin * 2; // 180mm
      const contentH = 297 - margin * 2; // 267mm
      const imgW = contentW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      pdf.addImage(data, "JPEG", margin, margin, imgW, imgH);
      heightLeft -= contentH;
      while (heightLeft > 0) {
        pdf.addPage();
        const pos = margin - (imgH - heightLeft);
        pdf.addImage(data, "JPEG", margin, pos, imgW, imgH);
        heightLeft -= contentH;
      }
      const idPart = (invoiceNo || "receipt").replace(/\s+/g, "");
      pdf.save(`rafraf-invoice-${idPart}.pdf`);
    } catch {
      // Fall back to the print window if the PDF libs fail to load.
      print();
    } finally {
      if (node && node.parentNode) node.parentNode.removeChild(node);
      setPdfBusy(false);
    }
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
        {invoiceNo && <p className={styles.receiptDate}>{invoiceNo}</p>}
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
        {sypTotal != null && (
          <p className={styles.receiptDate}>
            ≈ {nf.format(sypTotal)} {baseSymbol}
          </p>
        )}
        <p className={styles.receiptThanks}>{labels.thanks}</p>
        <div className={styles.receiptActions}>
          <button type="button" className={styles.btnGhost} onClick={print}>
            {labels.print}
          </button>
          <button type="button" className={styles.btnGhost} onClick={share}>
            {labels.share}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => void downloadPdf()}
            disabled={pdfBusy}
          >
            {pdfBusy ? `${labels.pdf}…` : `📄 ${labels.pdf}`}
          </button>
        </div>
        <button type="button" className={styles.btnGo} onClick={onClose}>
          {labels.newSale}
        </button>
      </div>
    </div>
  );
}
