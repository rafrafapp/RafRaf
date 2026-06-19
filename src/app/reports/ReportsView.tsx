"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay, type TutorialStep } from "@/components/Tutorial/TutorialOverlay";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { useCurrencies, symbolFor } from "@/lib/offline/useCurrencies";
import {
  computeReport,
  presetRange,
  customRange,
  type ReportRange,
} from "@/lib/reports/compute";
import { PageHeader } from "@/components/PageHeader";
import { escapeHtml, safeDisplay } from "@/lib/validation/sanitize";
import { sanitizeString } from "@/lib/validation/sanitize-html";
import t from "@/components/transactions.module.css";
import s from "./reports.module.css";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type Preset = "today" | "week" | "month" | "custom";

type Props = {
  merchantId: string;
  currency: string;
  storeName: string;
  locale: Locale;
  appName: string;
  reports: Dictionary["reports"];
  common: Dictionary["common"];
  syncLabels: Dictionary["products"]["sync"];
};

const REPORTS_STEPS: TutorialStep[] = [
  { target: "#date-selector", title_ar: "اختر الفترة", text_ar: "شوف تقارير اليوم أو الأسبوع أو الشهر أو فترة مخصصة", position: "bottom" },
  { target: "#stats-cards", title_ar: "ملخص المبيعات", text_ar: "مبيعاتك وأرباحك ومصاريفك لهالفترة", position: "bottom" },
  { target: "#sales-chart", title_ar: "حركة المبيعات", text_ar: "رسم بياني يظهر مبيعاتك يوم بيوم", position: "top" },
  { target: "#export-btns", title_ar: "تصدير التقارير", text_ar: "حمّل تقريرك كـ PDF أو Excel", position: "top" },
];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
}

// User text destined for the PDF print window's HTML: strip markup, then escape.
const safeHtml = (str: string) => escapeHtml(sanitizeString(str));

export function ReportsView({
  merchantId,
  currency,
  storeName,
  locale,
  reports: r,
  common,
  syncLabels,
}: Props) {
  const tutorial = useTutorial("reports");
  const { online } = useSync(merchantId);
  const { currencies, base } = useCurrencies(merchantId);
  const baseSym = base?.symbol ?? currency;
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const rawTxns = useLiveQuery(
    () => getDb().transactions.where("merchant_id").equals(merchantId).toArray(),
    [merchantId],
  );
  const products =
    useLiveQuery(
      () =>
        getDb().products.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
      [merchantId],
      [],
    ) ?? [];
  const customers =
    useLiveQuery(
      () =>
        getDb().customers.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
      [merchantId],
      [],
    ) ?? [];
  const suppliers =
    useLiveQuery(
      () =>
        getDb().suppliers.where("[merchant_id+_deleted]").equals([merchantId, 0]).toArray(),
      [merchantId],
      [],
    ) ?? [];

  const loading = rawTxns === undefined;
  const txns = rawTxns ?? [];

  const range: ReportRange = useMemo(() => {
    if (preset === "custom") return customRange(from, to) ?? presetRange("today");
    return presetRange(preset);
  }, [preset, from, to]);

  const report = useMemo(
    () => computeReport({ txns, products, customers, suppliers, range }),
    [txns, products, customers, suppliers, range],
  );

  // All money figures are in base (SYP).
  const money = (v: number) => `${nf.format(v)} ${baseSym}`;
  const rangeText = r.rangeText
    .replace("{from}", fmtDate(range.from))
    .replace("{to}", fmtDate(range.to));

  // Chart stats: best day, daily average, whether there's any data at all.
  const trendTotal = report.trend.reduce((sum, d) => sum + d.total, 0);
  const trendAvg = report.trend.length
    ? trendTotal / report.trend.length
    : 0;
  const bestDay = report.trend.reduce<{ day: string; total: number } | null>(
    (best, d) => (best && best.total >= d.total ? best : { day: d.day, total: d.total }),
    null,
  );
  const trendHasData = report.trend.some((d) => d.total > 0);
  // Compact money for the value-on-bar + Y axis (e.g. 1.5M).
  const cf = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const ddmm = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
  // Arabic/EN short weekday name (السبت…) — no digits, so plain locale is fine.
  const weekday = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(
      locale === "ar" ? "ar" : "en",
      { weekday: "short" },
    );
  // Cap the chart to the most recent 7 days so bars stay wide/readable; the
  // summary below still reflects the full period.
  const chartTrend =
    report.trend.length > 7 ? report.trend.slice(-7) : report.trend;
  const chartMax = Math.max(1, ...chartTrend.map((d) => d.total));

  // ---- Exports -------------------------------------------------------------
  function summaryPairs(): [string, string][] {
    const m = r.summary;
    return [
      [m.sales, money(report.sales)],
      [m.purchases, money(report.purchases)],
      [m.expenses, money(report.expenses)],
      [m.cogs, money(report.cogs)],
      [m.grossProfit, money(report.grossProfit)],
      [m.netProfit, money(report.netProfit)],
      [m.margin, `${nf.format(report.marginPct)}%`],
      [m.cashIn, money(report.cashIn)],
      [m.cashOut, money(report.cashOut)],
      [m.cashFlow, money(report.cashFlow)],
      [m.salesCount, nf.format(report.salesCount)],
      [m.itemsSold, nf.format(report.itemsSold)],
      [m.debtCollected, money(report.debtCollected)],
      [m.serviceIncome, money(report.serviceIncome)],
      [m.receivable, money(report.receivable)],
      [m.payable, money(report.payable)],
    ];
  }

  const heading = r.reportHeading.replace("{store}", storeName);
  const fileBase = `rafraf-report-${fmtDate(range.from)}_${fmtDate(range.to)}`;

  // Styled Excel via an HTML-table workbook (.xls): Excel renders inline CSS, so we
  // get a dark branded header, alternating row colours and proper headers — with no
  // extra dependency. User text is escaped (safeHtml).
  function downloadExcel() {
    setExporting("excel");
    try {
      const dir = locale === "ar" ? "rtl" : "ltr";
      const th = (txt: string, span = 1) =>
        `<td colspan="${span}" style="background:#0e7c66;color:#fff;font-weight:700;padding:8px 10px;border:1px solid #0b5f4e;">${escapeHtml(txt)}</td>`;
      const sec = (txt: string, span = 2) =>
        `<tr><td colspan="${span}" style="background:#1f2937;color:#fff;font-weight:700;padding:7px 10px;">${escapeHtml(txt)}</td></tr>`;
      const cell = (txt: string, i: number, num = false) =>
        `<td style="padding:6px 10px;border:1px solid #e5e7eb;background:${i % 2 ? "#f3f4f6" : "#ffffff"};${num ? "text-align:end;mso-number-format:'\\#\\,\\#\\#0';" : ""}">${txt}</td>`;

      let body = "";
      // Branding title
      body += `<tr><td colspan="3" style="background:#0b1326;color:#4edea3;font-size:20px;font-weight:800;padding:12px 10px;">رف رف — RafRaf</td></tr>`;
      body += `<tr><td colspan="3" style="font-size:15px;font-weight:700;padding:8px 10px;">${escapeHtml(heading)}</td></tr>`;
      body += `<tr><td colspan="3" style="color:#6b7280;padding:4px 10px;">${escapeHtml(rangeText)}</td></tr>`;
      body += `<tr><td colspan="3" style="height:8px;"></td></tr>`;
      // Summary
      body += `<tr>${th(r.metric)}${th(r.value)}</tr>`;
      summaryPairs().forEach(([k, v], i) => {
        body += `<tr>${cell(escapeHtml(k), i)}${cell(escapeHtml(v), i, true)}</tr>`;
      });
      // Sales by currency
      if (report.byCurrency.length) {
        body += sec(r.sections.byCurrency);
        report.byCurrency.forEach((x, i) => {
          body += `<tr>${cell(`${escapeHtml(symbolFor(currencies, x.code))} ${nf.format(x.total)} (${escapeHtml(x.code)})`, i)}${cell(`${nf.format(x.totalSyp)} ${escapeHtml(baseSym)}`, i, true)}</tr>`;
        });
        body += `<tr>${cell(escapeHtml(r.grandTotalSyp), 1)}${cell(`${nf.format(report.sales)} ${escapeHtml(baseSym)}`, 1, true)}</tr>`;
      }
      // Top sellers
      if (report.topSellers.length) {
        body += sec(r.sections.topSellers, 3);
        body += `<tr>${th(r.metric)}${th(r.qty)}${th(r.revenue)}</tr>`;
        report.topSellers.forEach((x, i) => {
          body += `<tr>${cell(safeHtml(x.name), i)}${cell(nf.format(x.qty), i, true)}${cell(nf.format(x.revenue), i, true)}</tr>`;
        });
      }
      // Expenses
      if (report.expenseBreakdown.length) {
        body += sec(r.sections.expenses);
        report.expenseBreakdown.forEach((x, i) => {
          body += `<tr>${cell(safeHtml(x.label), i)}${cell(nf.format(x.total), i, true)}</tr>`;
        });
      }
      // Low stock
      if (report.lowStock.length) {
        body += sec(r.sections.lowStock);
        report.lowStock.forEach((x, i) => {
          body += `<tr>${cell(safeHtml(x.name), i)}${cell(nf.format(x.stock), i, true)}</tr>`;
        });
      }

      const html =
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head>` +
        `<body><table dir="${dir}" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">${body}</table></body></html>`;
      const blob = new Blob(["﻿" + html], {
        type: "application/vnd.ms-excel;charset=utf-8;",
      });
      triggerDownload(blob, `${fileBase}.xls`);
    } finally {
      setExporting(null);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Inner HTML for the printable/PDF report — light, branded, self-contained (hex
  // colours only so html2canvas never chokes on modern colour functions).
  function reportNodeHtml(): string {
    const dir = locale === "ar" ? "rtl" : "ltr";
    const sumRows = summaryPairs()
      .map(
        ([k, v]) =>
          `<tr><td>${escapeHtml(k)}</td><td class="n">${escapeHtml(v)}</td></tr>`,
      )
      .join("");
    const sellerRows = report.topSellers
      .map(
        (x) =>
          `<tr><td>${safeHtml(x.name)}</td><td class="n">${nf.format(x.qty)}</td><td class="n">${nf.format(x.revenue)}</td></tr>`,
      )
      .join("");
    const expenseRows = report.expenseBreakdown
      .map(
        (x) =>
          `<tr><td>${safeHtml(x.label)}</td><td class="n">${nf.format(x.total)}</td></tr>`,
      )
      .join("");
    const currencyRows = report.byCurrency
      .map(
        (x) =>
          `<tr><td>${escapeHtml(symbolFor(currencies, x.code))} ${nf.format(x.total)} (${escapeHtml(x.code)})</td><td class="n">${nf.format(x.totalSyp)} ${escapeHtml(baseSym)}</td></tr>`,
      )
      .join("");
    const showCurrencies =
      report.byCurrency.length > 1 ||
      (report.byCurrency[0] && report.byCurrency[0].code !== "SYP");
    const h = escapeHtml(r.reportHeading.replace("{store}", sanitizeString(storeName)));
    return (
      `<div dir="${dir}" style="font-family:'Segoe UI','Noto Sans Arabic',Arial,sans-serif;color:#111827;">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0e7c66;padding-bottom:10px;margin-bottom:16px;">` +
      `<div><div style="font-size:24px;font-weight:800;color:#0e7c66;">رف رف — RafRaf</div>` +
      `<div style="font-size:15px;font-weight:700;margin-top:2px;">${h}</div>` +
      `<div style="color:#6b7280;font-size:13px;">${escapeHtml(rangeText)}</div></div></div>` +
      `<h2 style="font-size:15px;margin:14px 0 6px;color:#0e7c66;">${escapeHtml(r.title)}</h2>` +
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">${sumRows}</table>` +
      (showCurrencies
        ? `<h2 style="font-size:15px;margin:18px 0 6px;color:#0e7c66;">${escapeHtml(r.sections.byCurrency)}</h2>` +
          `<table style="width:100%;border-collapse:collapse;font-size:13px;">${currencyRows}` +
          `<tr><td><strong>${escapeHtml(r.grandTotalSyp)}</strong></td><td class="n"><strong>${nf.format(report.sales)} ${escapeHtml(baseSym)}</strong></td></tr></table>`
        : "") +
      (sellerRows
        ? `<h2 style="font-size:15px;margin:18px 0 6px;color:#0e7c66;">${escapeHtml(r.sections.topSellers)}</h2>` +
          `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr><th>${escapeHtml(r.metric)}</th><th class="n">${escapeHtml(r.qty)}</th><th class="n">${escapeHtml(r.revenue)}</th></tr>${sellerRows}</table>`
        : "") +
      (expenseRows
        ? `<h2 style="font-size:15px;margin:18px 0 6px;color:#0e7c66;">${escapeHtml(r.sections.expenses)}</h2>` +
          `<table style="width:100%;border-collapse:collapse;font-size:13px;">${expenseRows}</table>`
        : "") +
      `<div style="margin-top:24px;color:#9ca3af;font-size:11px;text-align:center;">رف رف — الرف الرقمي لكل تاجر</div>` +
      `</div>`
    );
  }

  // Direct PDF download (no print dialog) via html2canvas → jsPDF. Falls back to a
  // print window if the libraries fail to load.
  async function downloadPdf() {
    setExporting("pdf");
    let node: HTMLDivElement | null = null;
    try {
      const [{ default: jsPDF }, h2c] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = h2c.default;
      node = document.createElement("div");
      node.style.cssText =
        "position:fixed;left:-10000px;top:0;width:760px;padding:28px;background:#ffffff;z-index:-1;";
      node.innerHTML = reportNodeHtml();
      node
        .querySelectorAll("td,th")
        .forEach((el) => {
          (el as HTMLElement).style.cssText +=
            "padding:5px 6px;border-bottom:1px solid #e5e7eb;text-align:start;";
        });
      node.querySelectorAll(".n").forEach((el) => {
        (el as HTMLElement).style.textAlign = "end";
        (el as HTMLElement).style.whiteSpace = "nowrap";
      });
      document.body.appendChild(node);

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      let position = 0;
      let heightLeft = imgH;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${fileBase}.pdf`);
    } catch {
      legacyPrintPdf();
    } finally {
      if (node && node.parentNode) node.parentNode.removeChild(node);
      setExporting(null);
    }
  }

  // Fallback only: open a print window (used if jsPDF/html2canvas fail to load).
  function legacyPrintPdf() {
    const dir = locale === "ar" ? "rtl" : "ltr";
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    w.document.write(
      `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title>` +
        `<style>body{font-family:system-ui,'Segoe UI','Noto Sans Arabic',sans-serif;padding:24px;max-width:720px;margin:auto;color:#111}` +
        `h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:13px}` +
        `td,th{padding:5px 4px;border-bottom:1px solid #e2e2e2;text-align:start}.n{text-align:end;white-space:nowrap}</style></head><body>` +
        reportNodeHtml() +
        `</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const periods: { key: Preset; label: string }[] = [
    { key: "today", label: r.periods.today },
    { key: "week", label: r.periods.week },
    { key: "month", label: r.periods.month },
    { key: "custom", label: r.periods.custom },
  ];

  function card(label: string, value: string, tone?: "good" | "bad") {
    const cls =
      tone === "good" ? s.statGood : tone === "bad" ? s.statBad : undefined;
    return (
      <div className={`${t.stat} ${cls ?? ""}`}>
        <span className={t.statLabel}>{label}</span>
        <span className={t.statValue}>{value}</span>
      </div>
    );
  }

  return (
    <main className={t.main} style={{ maxWidth: "80rem" }}>
      <PageHeader title={r.title} backHref="/dashboard" backLabel={common.back} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: "0.25rem" }}>
        <button type="button" onClick={tutorial.reset} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
          ؟ شرح التطبيق
        </button>
      </div>

      {!online && <p className={t.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={s.controls} id="date-selector">
        <div className={t.filters}>
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`${t.chip} ${preset === p.key ? t.chipActive : ""}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className={s.customRow}>
            <label className={s.dateField}>
              {r.from}
              <input
                className={s.dateInput}
                type="date"
                dir="ltr"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className={s.dateField}>
              {r.to}
              <input
                className={s.dateInput}
                type="date"
                dir="ltr"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className={s.exportRow} id="export-btns">
          <button
            type="button"
            className={t.btnGhost}
            onClick={downloadPdf}
            disabled={exporting !== null}
          >
            {exporting === "pdf" ? `${r.exportPdf}…` : r.exportPdf}
          </button>
          <button
            type="button"
            className={t.btnGhost}
            onClick={downloadExcel}
            disabled={exporting !== null}
          >
            {exporting === "excel" ? `${r.exportExcel}…` : r.exportExcel}
          </button>
        </div>
      </div>

      {loading ? (
        <p className={t.count}>{common.loading}</p>
      ) : (
        <>
          <section className={s.grid} id="stats-cards">
            {card(r.summary.sales, money(report.sales), "good")}
            {card(
              r.summary.netProfit,
              money(report.netProfit),
              report.netProfit >= 0 ? "good" : "bad",
            )}
            {card(r.summary.margin, `${nf.format(report.marginPct)}%`)}
            {card(
              r.summary.cashFlow,
              money(report.cashFlow),
              report.cashFlow >= 0 ? "good" : "bad",
            )}
            {card(r.summary.purchases, money(report.purchases))}
            {card(r.summary.expenses, money(report.expenses), "bad")}
            {card(r.summary.salesCount, nf.format(report.salesCount))}
            {card(r.summary.itemsSold, nf.format(report.itemsSold))}
            {card(r.summary.debtCollected, money(report.debtCollected), "good")}
            {card(r.summary.serviceIncome, money(report.serviceIncome), "good")}
          </section>

          {/* Sales by currency (only when more than just the base was used) */}
          {(report.byCurrency.length > 1 ||
            (report.byCurrency[0] && report.byCurrency[0].code !== "SYP")) && (
            <section className={s.section}>
              <h2 className={s.sectionTitle}>{r.sections.byCurrency}</h2>
              <ul className={s.rows}>
                {report.byCurrency.map((x) => (
                  <li key={x.code} className={s.rowItem}>
                    <span className={s.rowName}>
                      {symbolFor(currencies, x.code)} {nf.format(x.total)} ({x.code})
                    </span>
                    <span className={s.rowMeta}>
                      = {nf.format(x.totalSyp)} {baseSym}
                    </span>
                  </li>
                ))}
                <li className={s.rowItem}>
                  <span className={s.rowName}>
                    <strong>{r.grandTotalSyp}</strong>
                  </span>
                  <span className={s.rowValue}>
                    <strong>{money(report.sales)}</strong>
                  </span>
                </li>
              </ul>
            </section>
          )}

          {/* Trend */}
          <section className={s.section} id="sales-chart">
            <h2 className={s.sectionTitle}>{r.sections.trend}</h2>
            {!trendHasData ? (
              <div className={s.chartEmpty}>
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 3v18h18" />
                  <path d="M7 15l3-3 3 2 4-5" />
                </svg>
                <p>{r.chart.noSales}</p>
              </div>
            ) : (
              <>
                {/* Legend */}
                <div className={s.legend}>
                  <span className={s.legendItem}>
                    <span className={`${s.legendDot} ${s.legendSales}`} />
                    {r.chart.legendSales}
                  </span>
                  {trendAvg > 0 && (
                    <span className={s.legendItem}>
                      <span className={`${s.legendDot} ${s.legendAvg}`} />
                      {r.chart.legendAvg}
                    </span>
                  )}
                </div>

                <div className={s.chartWrap}>
                  {/* Y axis (amounts in base currency) */}
                  <div className={s.yAxis}>
                    <span>
                      {cf.format(chartMax)} {baseSym}
                    </span>
                    <span>{cf.format(chartMax / 2)}</span>
                    <span>0</span>
                  </div>
                  <div className={s.chart}>
                    {/* Average reference line */}
                    {trendAvg > 0 && trendAvg <= chartMax && (
                      <div
                        className={s.avgLine}
                        style={{ bottom: `${(trendAvg / chartMax) * 100}%` }}
                        title={`${r.chart.average}: ${money(trendAvg)}`}
                      />
                    )}
                    {chartTrend.map((d) => {
                      const isMax = d.total > 0 && d.total === chartMax;
                      return (
                        <div key={d.day} className={s.col}>
                          {d.total > 0 && (
                            <span className={s.colVal}>{cf.format(d.total)}</span>
                          )}
                          <span
                            className={s.colTrack}
                            tabIndex={0}
                            role="img"
                            aria-label={`${ddmm(d.day)} · ${money(d.total)} · ${nf.format(d.count)} ${r.chart.invoices}`}
                          >
                            <span
                              className={`${s.colBar} ${isMax ? s.colBarMax : ""}`}
                              style={{
                                height: `${Math.max(2, (d.total / chartMax) * 100)}%`,
                              }}
                            />
                            <span className={s.tooltip}>
                              <strong>{weekday(d.day)} · {ddmm(d.day)}</strong>
                              <span>{money(d.total)}</span>
                              <span>
                                {nf.format(d.count)} {r.chart.invoices}
                              </span>
                            </span>
                          </span>
                          <span className={s.colDay}>{weekday(d.day)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary */}
                <div className={s.chartSummary}>
                  <div className={s.chartStat}>
                    <span className={s.chartStatLabel}>{r.chart.highest}</span>
                    <span className={s.chartStatValue}>
                      {bestDay && bestDay.total > 0
                        ? `${ddmm(bestDay.day)} · ${money(bestDay.total)}`
                        : "—"}
                    </span>
                  </div>
                  <div className={s.chartStat}>
                    <span className={s.chartStatLabel}>{r.chart.average}</span>
                    <span className={s.chartStatValue}>{money(trendAvg)}</span>
                  </div>
                  <div className={s.chartStat}>
                    <span className={s.chartStatLabel}>{r.chart.total}</span>
                    <span className={s.chartStatValue}>{money(trendTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          <div className={s.cols}>
            {/* Top sellers */}
            <section className={s.section}>
              <h2 className={s.sectionTitle}>{r.sections.topSellers}</h2>
              {report.topSellers.length === 0 ? (
                <p className={t.count}>{r.empty}</p>
              ) : (
                <ul className={s.rows}>
                  {report.topSellers.map((x) => (
                    <li key={x.key} className={s.rowItem}>
                      <span className={s.rowName}>{safeDisplay(x.name)}</span>
                      <span className={s.rowMeta}>
                        {nf.format(x.qty)} · {money(x.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Worst sellers (only meaningful when there are >5 sellers) */}
            {report.topSellers.length >= 5 && (
              <section className={s.section}>
                <h2 className={s.sectionTitle}>{r.sections.worstSellers}</h2>
                <ul className={s.rows}>
                  {report.worstSellers.map((x) => (
                    <li key={x.key} className={s.rowItem}>
                      <span className={s.rowName}>{safeDisplay(x.name)}</span>
                      <span className={s.rowMeta}>
                        {nf.format(x.qty)} · {money(x.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Expense breakdown */}
            <section className={s.section}>
              <h2 className={s.sectionTitle}>{r.sections.expenses}</h2>
              {report.expenseBreakdown.length === 0 ? (
                <p className={t.count}>{r.empty}</p>
              ) : (
                <ul className={s.rows}>
                  {report.expenseBreakdown.map((x) => (
                    <li key={x.key} className={s.rowItem}>
                      <span className={s.rowName}>{safeDisplay(x.label)}</span>
                      <span className={s.rowValue}>{money(x.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Supplier spend */}
            {report.supplierSpend.length > 0 && (
              <section className={s.section}>
                <h2 className={s.sectionTitle}>{r.sections.supplierSpend}</h2>
                <ul className={s.rows}>
                  {report.supplierSpend.map((x) => (
                    <li key={x.id} className={s.rowItem}>
                      <span className={s.rowName}>{safeDisplay(x.name)}</span>
                      <span className={s.rowValue}>{money(x.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Snapshots: debt + low stock (as of now) */}
          <div className={s.cols}>
            <section className={s.section}>
              <h2 className={s.sectionTitle}>{r.sections.debtors}</h2>
              <p className={s.snapshotNote}>{r.snapshot}</p>
              <div className={s.grid}>
                {card(r.summary.receivable, money(report.receivable), "good")}
                {card(r.summary.payable, money(report.payable), "bad")}
              </div>
              {report.topDebtors.length > 0 && (
                <ul className={s.rows}>
                  {report.topDebtors.map((x) => (
                    <li key={x.id}>
                      <Link href={`/customers/${x.id}`} className={s.rowItem}>
                        <span className={s.rowName}>{safeDisplay(x.name)}</span>
                        <span className={s.rowValue}>{money(x.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={s.section}>
              <h2 className={s.sectionTitle}>{r.sections.lowStock}</h2>
              <p className={s.snapshotNote}>{r.snapshot}</p>
              {report.lowStock.length === 0 ? (
                <p className={t.count}>{r.empty}</p>
              ) : (
                <ul className={s.rows}>
                  {report.lowStock.map((x) => (
                    <li key={x.id}>
                      <Link href={`/products/${x.id}/edit`} className={s.rowItem}>
                        <span className={s.rowName}>{safeDisplay(x.name)}</span>
                        <span className={s.rowMeta}>
                          {nf.format(x.stock)} / {nf.format(x.min)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
      {tutorial.show && (
        <TutorialOverlay
          steps={REPORTS_STEPS}
          onComplete={tutorial.onComplete}
          onSkip={tutorial.onSkip}
        />
      )}
    </main>
  );
}
