import type {
  LocalTransaction,
  LocalProduct,
  LocalCustomer,
  LocalSupplier,
} from "@/lib/offline/db";

// A half-open time window [from, to) in epoch ms.
export type ReportRange = { from: number; to: number };

export type SellerStat = {
  key: string;
  name: string;
  qty: number;
  revenue: number;
};
export type CategoryStat = { key: string; label: string; total: number };
export type DayStat = { day: string; total: number }; // day = YYYY-MM-DD (local)
export type PartyStat = { id: string; name: string; amount: number };

export type ReportSummary = {
  // Period totals
  sales: number;
  purchases: number;
  expenses: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  cashIn: number;
  cashOut: number;
  cashFlow: number;
  salesCount: number; // distinct sale invoices
  itemsSold: number;
  debtCollected: number; // debt_payment received in period
  serviceIncome: number; // mobile-credit profit + sham-cash commission
  serviceRevenue: number; // gross of the service transactions
  // Snapshots (as of now, not period-bound)
  receivable: number; // customers owe us
  payable: number; // we owe suppliers
  lowStock: { id: string; name: string; stock: number; min: number }[];
  // Breakdowns (period)
  topSellers: SellerStat[];
  worstSellers: SellerStat[];
  expenseBreakdown: CategoryStat[];
  supplierSpend: PartyStat[];
  topDebtors: PartyStat[];
  trend: DayStat[];
};

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

const DAY_MS = 86400000;

// All reporting metrics for a window, computed from the locally-synced data.
// Pure + side-effect-free so it's trivial to reason about and reuse for export.
export function computeReport(opts: {
  txns: LocalTransaction[];
  products: LocalProduct[];
  customers: LocalCustomer[];
  suppliers: LocalSupplier[];
  range: ReportRange;
}): ReportSummary {
  const { txns, products, customers, suppliers, range } = opts;

  const costById = new Map<string, number>();
  for (const p of products) costById.set(p.id, num(p.cost_price));
  const supplierNameById = new Map<string, string>();
  for (const s of suppliers) supplierNameById.set(s.id, s.name);

  const inRange = txns.filter((t) => {
    const ts = new Date(t.created_at).getTime();
    return ts >= range.from && ts < range.to;
  });

  let sales = 0;
  let purchases = 0;
  let expenses = 0;
  let cogs = 0;
  let cashIn = 0;
  let cashOut = 0;
  let itemsSold = 0;
  let debtCollected = 0;
  let serviceIncome = 0;
  let serviceRevenue = 0;
  const invoiceKeys = new Set<string>();
  const sellers = new Map<string, SellerStat>();
  const expenseCats = new Map<string, CategoryStat>();
  const supplierSpend = new Map<string, PartyStat>();

  for (const t of inRange) {
    const total = num(t.total);
    const paid = num(t.paid);
    const qty = num(t.qty);
    const price = num(t.price);

    switch (t.type) {
      case "sell": {
        sales += total;
        cashIn += paid; // credit sale → paid 0 (cash arrives via debt_payment)
        itemsSold += qty;
        invoiceKeys.add(t.group_uuid ?? t.client_uuid);
        if (t.product_id) cogs += (costById.get(t.product_id) ?? 0) * qty;
        const key = t.product_id ?? `name:${t.product_name ?? "?"}`;
        const s = sellers.get(key) ?? {
          key,
          name: t.product_name ?? "—",
          qty: 0,
          revenue: 0,
        };
        s.qty += qty;
        s.revenue += total;
        sellers.set(key, s);
        break;
      }
      case "buy": {
        purchases += total;
        cashOut += paid;
        if (t.supplier_id) {
          const sp = supplierSpend.get(t.supplier_id) ?? {
            id: t.supplier_id,
            name: supplierNameById.get(t.supplier_id) ?? "—",
            amount: 0,
          };
          sp.amount += total;
          supplierSpend.set(t.supplier_id, sp);
        }
        break;
      }
      case "expense": {
        expenses += total;
        cashOut += total;
        const label = t.product_name ?? t.note ?? "—";
        const key = label;
        const c = expenseCats.get(key) ?? { key, label, total: 0 };
        c.total += total;
        expenseCats.set(key, c);
        break;
      }
      case "debt_payment":
        cashIn += total;
        debtCollected += total;
        break;
      case "return_supplier":
        cashIn += total;
        break;
      case "return_customer":
        cashOut += total;
        break;
      case "supplier_payment":
        cashOut += total;
        break;
      case "mobile_credit": {
        serviceRevenue += total;
        serviceIncome += total - price; // profit = amount_sold − cost
        cashIn += paid;
        break;
      }
      case "sham_cash": {
        serviceRevenue += total;
        serviceIncome += total - qty * price; // commission = total − usd×rate
        cashIn += paid;
        break;
      }
      case "sham_cash_void": {
        // Reversal of a sham_cash row: negate its revenue, commission and the cash
        // that was received (money goes back out).
        serviceRevenue -= total;
        serviceIncome -= total - qty * price;
        cashOut += paid;
        break;
      }
    }
  }

  const grossProfit = sales - cogs;
  const netProfit = grossProfit - expenses + serviceIncome;
  const marginPct = sales > 0 ? (grossProfit / sales) * 100 : 0;

  const sellerList = [...sellers.values()];
  const topSellers = [...sellerList]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const worstSellers = [...sellerList]
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5);

  const expenseBreakdown = [...expenseCats.values()].sort(
    (a, b) => b.total - a.total,
  );
  const supplierSpendList = [...supplierSpend.values()].sort(
    (a, b) => b.amount - a.amount,
  );

  // Snapshots (current balances / stock — not period-bound).
  let receivable = 0;
  const debtors: PartyStat[] = [];
  for (const c of customers) {
    if (c._deleted) continue;
    const d = num(c.debt_balance);
    if (d > 0) {
      receivable += d;
      debtors.push({ id: c.id, name: c.name, amount: d });
    }
  }
  debtors.sort((a, b) => b.amount - a.amount);

  let payable = 0;
  for (const s of suppliers) {
    if (s._deleted) continue;
    payable += Math.max(0, num(s.balance_owed));
  }

  const lowStock = products
    .filter(
      (p) => !p._deleted && num(p.min_stock) > 0 && num(p.stock) <= num(p.min_stock),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      stock: num(p.stock),
      min: num(p.min_stock),
    }))
    .sort((a, b) => a.stock - b.stock);

  // Sales trend by day. For windows ≤ 62 days, emit every day (so gaps show as 0);
  // otherwise only days with sales (keeps the chart readable).
  const byDay = new Map<string, number>();
  for (const t of inRange) {
    if (t.type !== "sell") continue;
    const k = dayKey(new Date(t.created_at).getTime());
    byDay.set(k, (byDay.get(k) ?? 0) + num(t.total));
  }
  const spanDays = Math.ceil((range.to - range.from) / DAY_MS);
  let trend: DayStat[];
  if (spanDays <= 62) {
    trend = [];
    const start = new Date(range.from);
    start.setHours(0, 0, 0, 0);
    for (let ms = start.getTime(); ms < range.to; ms += DAY_MS) {
      const k = dayKey(ms);
      trend.push({ day: k, total: byDay.get(k) ?? 0 });
    }
  } else {
    trend = [...byDay.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  return {
    sales,
    purchases,
    expenses,
    cogs,
    grossProfit,
    netProfit,
    marginPct,
    cashIn,
    cashOut,
    cashFlow: cashIn - cashOut,
    salesCount: invoiceKeys.size,
    itemsSold,
    debtCollected,
    serviceIncome,
    serviceRevenue,
    receivable,
    payable,
    lowStock,
    topSellers,
    worstSellers,
    expenseBreakdown,
    supplierSpend: supplierSpendList,
    topDebtors: debtors.slice(0, 5),
    trend,
  };
}

// Preset windows. "Today" = since local midnight; week/month = rolling 7/30 days.
export function presetRange(preset: "today" | "week" | "month"): ReportRange {
  const now = Date.now();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startToday = start.getTime();
  if (preset === "today") return { from: startToday, to: now };
  if (preset === "week") return { from: startToday - 6 * DAY_MS, to: now };
  return { from: startToday - 29 * DAY_MS, to: now };
}

// Custom range from two yyyy-mm-dd inputs (inclusive of the whole "to" day).
export function customRange(fromDate: string, toDate: string): ReportRange | null {
  if (!fromDate || !toDate) return null;
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(`${toDate}T23:59:59.999`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return { from, to };
}
