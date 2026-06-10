"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import {
  computeReport,
  presetRange,
  customRange,
  type ReportRange,
} from "@/lib/reports/compute";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SyncBadge } from "@/components/SyncBadge";
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
  appName,
  reports: r,
  common,
  syncLabels,
}: Props) {
  const { online, syncing, sync } = useSync(merchantId);
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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

  const money = (v: number) => `${nf.format(v)} ${currency}`;
  const rangeText = r.rangeText
    .replace("{from}", fmtDate(range.from))
    .replace("{to}", fmtDate(range.to));

  const trendMax = Math.max(1, ...report.trend.map((d) => d.total));

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

  function downloadExcel() {
    const rows: string[][] = [];
    rows.push([r.reportHeading.replace("{store}", storeName)]);
    rows.push([rangeText]);
    rows.push([]);
    rows.push([r.metric, r.value]);
    for (const [k, v] of summaryPairs()) rows.push([k, v]);
    rows.push([]);
    rows.push([r.sections.topSellers, r.qty, r.revenue]);
    for (const x of report.topSellers)
      rows.push([x.name, nf.format(x.qty), nf.format(x.revenue)]);
    rows.push([]);
    rows.push([r.sections.expenses, r.amount]);
    for (const x of report.expenseBreakdown) rows.push([x.label, nf.format(x.total)]);
    rows.push([]);
    rows.push([r.sections.lowStock]);
    for (const x of report.lowStock) rows.push([x.name, nf.format(x.stock)]);

    const esc = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = "﻿" + rows.map((row) => row.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rafraf-report-${fmtDate(range.from)}_${fmtDate(range.to)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
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
    const heading = escapeHtml(r.reportHeading.replace("{store}", sanitizeString(storeName)));
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return;
    w.document.write(
      `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${heading}</title><style>` +
        `body{font-family:system-ui,'Segoe UI','Noto Sans Arabic',sans-serif;padding:24px;max-width:720px;margin:auto;color:#111}` +
        `h1{font-size:20px;margin:0 0 2px}.r{color:#666;font-size:13px;margin-bottom:16px}` +
        `h2{font-size:15px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:13px}` +
        `td,th{padding:5px 4px;border-bottom:1px solid #e2e2e2;text-align:start}.n{text-align:end;white-space:nowrap}` +
        `</style></head><body>` +
        `<h1>${heading}</h1><div class="r">${escapeHtml(rangeText)}</div>` +
        `<h2>${escapeHtml(r.title)}</h2><table>${sumRows}</table>` +
        (sellerRows
          ? `<h2>${escapeHtml(r.sections.topSellers)}</h2><table><tr><th>${escapeHtml(r.metric)}</th><th class="n">${escapeHtml(r.qty)}</th><th class="n">${escapeHtml(r.revenue)}</th></tr>${sellerRows}</table>`
          : "") +
        (expenseRows
          ? `<h2>${escapeHtml(r.sections.expenses)}</h2><table>${expenseRows}</table>`
          : "") +
        `</body></html>`,
    );
    w.document.close();
    // Print from the opener (bundled JS); an inline script in the new window
    // would be blocked by the inherited strict CSP.
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
      <header className={t.header}>
        <Link href="/dashboard" className={t.logo}>
          {appName}
        </Link>
        <div className={t.headerActions}>
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

      <div className={t.titleRow}>
        <div>
          <h1 className={t.title}>{r.title}</h1>
          <p className={t.subtitle}>
            {r.subtitle} · {rangeText}
          </p>
        </div>
        <Link href="/dashboard" className={t.back}>
          {common.cancel}
        </Link>
      </div>

      {!online && <p className={t.offlineHint}>{syncLabels.offlineHint}</p>}

      <div className={s.controls}>
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

        <div className={s.exportRow}>
          <button type="button" className={t.btnGhost} onClick={downloadPdf}>
            {r.exportPdf}
          </button>
          <button type="button" className={t.btnGhost} onClick={downloadExcel}>
            {r.exportExcel}
          </button>
        </div>
      </div>

      {loading ? (
        <p className={t.count}>{common.loading}</p>
      ) : (
        <>
          <section className={s.grid}>
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

          {/* Trend */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>{r.sections.trend}</h2>
            {report.trend.length === 0 ? (
              <p className={t.count}>{r.empty}</p>
            ) : (
              <div className={s.chart}>
                {report.trend.map((d) => {
                  const isMax = d.total > 0 && d.total === trendMax;
                  return (
                    <div key={d.day} className={s.col}>
                      <span className={s.colTrack}>
                        <span
                          className={`${s.colBar} ${isMax ? s.colBarMax : ""}`}
                          style={{ height: `${Math.max(2, (d.total / trendMax) * 100)}%` }}
                          title={`${d.day} · ${money(d.total)}`}
                        />
                      </span>
                      {report.trend.length <= 16 && (
                        <span className={s.colDay}>{d.day.slice(8)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
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
    </main>
  );
}
