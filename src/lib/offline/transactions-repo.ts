import {
  getDb,
  type LocalTransaction,
  type TxType,
  type PaymentMethod,
} from "./db";
import { bumpDebt } from "./customers-repo";
import { bumpOwed } from "./suppliers-repo";
import {
  saleInputSchema,
  transactionInputSchema,
  settlementInputSchema,
  mobileCreditInputSchema,
  shamCashInputSchema,
} from "@/lib/validation/transaction";

// One line of a sale cart.
export type CartLine = {
  product_id: string | null;
  product_name: string;
  qty: number;
  price: number;
  discount: number; // percent (0–100)
};

function nowIso(): string {
  return new Date().toISOString();
}

function lineTotal(line: CartLine): number {
  return line.qty * line.price * (1 - (line.discount || 0) / 100);
}

// Spread an invoice-level "paid now" across its lines so each row carries its own
// paid amount and the server's per-row debt deltas (total - paid) still sum to
// the invoice's debt. The last line absorbs the remainder so the parts sum
// exactly to `paid` regardless of float rounding.
function distributePaid(lineTotals: number[], paid: number): number[] {
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return lineTotals.map(() => 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < lineTotals.length; i++) {
    if (i === lineTotals.length - 1) {
      out.push(paid - acc);
    } else {
      const part = (paid * lineTotals[i]) / sum;
      out.push(part);
      acc += part;
    }
  }
  return out;
}

// Adjust a product's local stock optimistically WITHOUT marking it pending — the
// stock change is owned by the ledger row (record_transaction on the server), so
// we must not also push it as a product upsert (that would double-count).
async function bumpStock(productId: string, delta: number): Promise<void> {
  const db = getDb();
  const p = await db.products.get(productId);
  if (p) await db.products.update(productId, { stock: Number(p.stock) + delta });
}

// Record a sale cart: one group_uuid, one ledger row per line, stock decremented
// optimistically. When a customer is linked and the sale isn't fully paid, the
// unpaid remainder is added to their debt (optimistically; the RPC owns the real
// delta). Returns the group_uuid (the invoice id) for the receipt.
export async function recordSale(opts: {
  merchantId: string;
  currency: string;
  exchangeRate?: number; // base (SYP) per 1 unit of `currency`; default 1
  payment: PaymentMethod;
  note?: string | null;
  lines: CartLine[];
  customerId?: string | null;
  paid?: number; // amount received now; used for "partial"
}): Promise<string> {
  saleInputSchema.parse(opts); // validate before touching IndexedDB
  const db = getDb();
  const group = crypto.randomUUID();
  const now = nowIso();
  const rate = opts.exchangeRate ?? 1;
  const customerId = opts.customerId ?? null;

  const totals = opts.lines.map(lineTotal);
  const invoiceTotal = totals.reduce((a, b) => a + b, 0);
  const paidNow =
    opts.payment === "cash"
      ? invoiceTotal
      : opts.payment === "credit"
        ? 0
        : Math.max(0, Math.min(opts.paid ?? 0, invoiceTotal));
  const paidPerLine = distributePaid(totals, paidNow);

  await db.transaction("rw", db.transactions, db.products, db.customers, async () => {
    for (let i = 0; i < opts.lines.length; i++) {
      const line = opts.lines[i];
      const tx: LocalTransaction = {
        client_uuid: crypto.randomUUID(),
        id: null,
        merchant_id: opts.merchantId,
        type: "sell",
        product_id: line.product_id,
        product_name: line.product_name,
        qty: line.qty,
        price: line.price,
        total: totals[i],
        discount: line.discount || 0,
        paid: paidPerLine[i],
        customer_id: customerId,
        supplier_id: null,
        payment: opts.payment,
        currency: opts.currency,
        exchange_rate: rate,
        amount_syp: totals[i] * rate,
        note: opts.note ?? null,
        group_uuid: group,
        created_at: now,
        _sync: "pending",
      };
      await db.transactions.put(tx);
      if (line.product_id) await bumpStock(line.product_id, -line.qty);
    }
    // Optimistic debt (tracked in base SYP): the unpaid remainder × rate.
    if (customerId) {
      const debtDelta = (invoiceTotal - paidNow) * rate;
      if (debtDelta !== 0) await bumpDebt(customerId, debtDelta);
    }
  });

  return group;
}

// Record a single non-sale, non-payment ledger row (buy / return / expense) with
// the matching optimistic stock + party-balance movements.
export async function recordTransaction(opts: {
  merchantId: string;
  type: Exclude<TxType, "sell" | "debt_payment" | "supplier_payment">;
  currency: string;
  exchangeRate?: number; // base (SYP) per 1 unit of `currency`; default 1
  product_id?: string | null;
  product_name?: string | null;
  qty?: number;
  price?: number;
  total?: number; // expense amount
  note?: string | null;
  payment?: PaymentMethod;
  customerId?: string | null;
  supplierId?: string | null;
  paid?: number; // amount paid now (buy on credit/partial)
}): Promise<void> {
  transactionInputSchema.parse(opts);
  const db = getDb();
  const rate = opts.exchangeRate ?? 1;
  const qty = opts.qty ?? 0;
  const price = opts.price ?? 0;
  const total = opts.type === "expense" ? (opts.total ?? 0) : qty * price;
  const payment = opts.payment ?? "cash";
  const paid =
    opts.type === "expense"
      ? total
      : payment === "cash"
        ? total
        : payment === "credit"
          ? 0
          : Math.max(0, Math.min(opts.paid ?? 0, total));
  const customerId = opts.customerId ?? null;
  const supplierId = opts.supplierId ?? null;

  const stockDelta =
    opts.type === "buy" || opts.type === "return_customer"
      ? qty
      : opts.type === "return_supplier"
        ? -qty
        : 0;

  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: opts.type,
    product_id: opts.product_id ?? null,
    product_name: opts.product_name ?? null,
    qty,
    price,
    total,
    discount: 0,
    paid,
    customer_id: customerId,
    supplier_id: supplierId,
    payment,
    currency: opts.currency,
    exchange_rate: rate,
    amount_syp: total * rate,
    note: opts.note ?? null,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };

  await db.transaction(
    "rw",
    db.transactions,
    db.products,
    db.customers,
    db.suppliers,
    async () => {
      await db.transactions.put(tx);
      if (opts.product_id && stockDelta !== 0)
        await bumpStock(opts.product_id, stockDelta);
      // Party balances (mirror the RPC), tracked in base SYP (× rate): buy on
      // credit raises what we owe the supplier; a customer return lowers the
      // customer's debt; a supplier return lowers what we owe.
      if (supplierId && opts.type === "buy") {
        const owed = (total - paid) * rate;
        if (owed !== 0) await bumpOwed(supplierId, owed);
      }
      if (customerId && opts.type === "return_customer")
        await bumpDebt(customerId, -total * rate);
      if (supplierId && opts.type === "return_supplier")
        await bumpOwed(supplierId, -total * rate);
    },
  );
}

// Record a debt settlement: a customer pays down their balance (debt_payment) or
// the store pays a supplier (supplier_payment). Money-only ledger rows; the
// balance is decremented optimistically and reconciled by the RPC on sync.
export async function recordDebtPayment(opts: {
  merchantId: string;
  customerId: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  note?: string | null;
}): Promise<void> {
  settlementInputSchema.parse(opts);
  const db = getDb();
  const rate = opts.exchangeRate ?? 1;
  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: "debt_payment",
    product_id: null,
    product_name: null,
    qty: 0,
    price: 0,
    total: opts.amount,
    discount: 0,
    paid: opts.amount,
    customer_id: opts.customerId,
    supplier_id: null,
    payment: "cash",
    currency: opts.currency,
    exchange_rate: rate,
    amount_syp: opts.amount * rate,
    note: opts.note ?? null,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };
  await db.transaction("rw", db.transactions, db.customers, async () => {
    await db.transactions.put(tx);
    await bumpDebt(opts.customerId, -opts.amount * rate);
  });
}

export async function recordSupplierPayment(opts: {
  merchantId: string;
  supplierId: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  note?: string | null;
}): Promise<void> {
  settlementInputSchema.parse(opts);
  const db = getDb();
  const rate = opts.exchangeRate ?? 1;
  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: "supplier_payment",
    product_id: null,
    product_name: null,
    qty: 0,
    price: 0,
    total: opts.amount,
    discount: 0,
    paid: opts.amount,
    customer_id: null,
    supplier_id: opts.supplierId,
    payment: "cash",
    currency: opts.currency,
    exchange_rate: rate,
    amount_syp: opts.amount * rate,
    note: opts.note ?? null,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };
  await db.transaction("rw", db.transactions, db.suppliers, async () => {
    await db.transactions.put(tx);
    await bumpOwed(opts.supplierId, -opts.amount * rate);
  });
}

// ---- Service transactions (no inventory, no party) -------------------------
// Money-only ledger rows; the RPC treats them like an expense (total from p_total).

// Mobile credit (وحدات): provider → product_name, cost → price, amount_sold → total;
// profit = total − price (derived in history/reports).
export async function recordMobileCredit(opts: {
  merchantId: string;
  provider: string;
  amountSold: number;
  cost?: number;
  payment?: PaymentMethod;
  currency: string;
  note?: string | null;
}): Promise<void> {
  mobileCreditInputSchema.parse(opts);
  const db = getDb();
  const payment = opts.payment ?? "cash";
  const total = opts.amountSold;
  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: "mobile_credit",
    product_id: null,
    product_name: opts.provider, // provider key; UI maps to a localized label
    qty: 0,
    price: opts.cost ?? 0,
    total,
    discount: 0,
    paid: payment === "cash" ? total : 0,
    customer_id: null,
    supplier_id: null,
    payment,
    currency: opts.currency,
    exchange_rate: 1,
    amount_syp: total,
    note: opts.note ?? null,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };
  await db.transactions.put(tx);
}

// Sham Cash (شام كاش): usd → qty, rate → price, total_syp = usd×rate + commission →
// total; commission = total − qty×price (derived).
export async function recordShamCash(opts: {
  merchantId: string;
  amountUsd: number;
  exchangeRate: number;
  commission: number;
  payment?: PaymentMethod;
  currency: string;
  note?: string | null;
}): Promise<void> {
  shamCashInputSchema.parse(opts);
  const db = getDb();
  const payment = opts.payment ?? "cash";
  const total = opts.amountUsd * opts.exchangeRate + opts.commission;
  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: "sham_cash",
    product_id: null,
    product_name: null,
    qty: opts.amountUsd,
    price: opts.exchangeRate,
    total,
    discount: 0,
    paid: payment === "cash" ? total : 0,
    customer_id: null,
    supplier_id: null,
    payment,
    currency: opts.currency,
    exchange_rate: 1,
    amount_syp: total,
    note: opts.note ?? null,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };
  await db.transactions.put(tx);
}

// Marker stored in a void row's note so the UI can tell which sham_cash rows are
// already cancelled (the ledger is append-only — a void is a reversing row, not a
// delete). Format: `${VOID_NOTE_PREFIX}${original client_uuid}`.
export const VOID_NOTE_PREFIX = "void:";

// Cancel/void a Sham Cash transaction: append a reversing money-only row
// (sham_cash_void) carrying the SAME amounts (total/qty/price/paid ≥ 0, so the
// DB CHECKs hold) — the reports negate it (reversing revenue, commission and the
// cash received). Mirrors how a return reverses a sale.
export async function recordShamCashVoid(opts: {
  merchantId: string;
  original: LocalTransaction;
}): Promise<void> {
  const o = opts.original;
  if (o.type !== "sham_cash") throw new Error("not a sham_cash transaction");
  const db = getDb();
  const tx: LocalTransaction = {
    client_uuid: crypto.randomUUID(),
    id: null,
    merchant_id: opts.merchantId,
    type: "sham_cash_void",
    product_id: null,
    product_name: o.product_name,
    qty: o.qty,
    price: o.price,
    total: o.total,
    discount: 0,
    paid: o.paid,
    customer_id: null,
    supplier_id: null,
    payment: o.payment,
    currency: o.currency,
    exchange_rate: o.exchange_rate ?? 1,
    amount_syp: o.amount_syp ?? o.total,
    note: `${VOID_NOTE_PREFIX}${o.client_uuid}`,
    group_uuid: null,
    created_at: nowIso(),
    _sync: "pending",
  };
  await db.transactions.put(tx);
}

// All line items of one invoice (for the grouped receipt view), oldest first.
export function getInvoiceLines(group: string): Promise<LocalTransaction[]> {
  return getDb()
    .transactions.where("group_uuid")
    .equals(group)
    .sortBy("created_at");
}

// Fetch one invoice/entry by its id — a group_uuid (multi-line sale) or a single
// row's client_uuid — scoped to the merchant. Oldest line first.
export async function getInvoice(
  merchantId: string,
  id: string,
): Promise<LocalTransaction[]> {
  const db = getDb();
  const group = await db.transactions.where("group_uuid").equals(id).toArray();
  let rows = group;
  if (rows.length === 0) {
    const single = await db.transactions.get(id);
    rows = single ? [single] : [];
  }
  return rows
    .filter((t) => t.merchant_id === merchantId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Sequential per-merchant invoice numbers for SELL invoices, ranked by the
// invoice's earliest line date (ascending) → group_uuid → number (1-based).
// Derived from the loaded ledger, so it's stable as long as history is synced.
export function buildInvoiceNumbers(
  rows: LocalTransaction[],
): Map<string, number> {
  const earliest = new Map<string, string>();
  for (const t of rows) {
    if (t.type !== "sell" || !t.group_uuid) continue;
    const cur = earliest.get(t.group_uuid);
    if (!cur || t.created_at < cur) earliest.set(t.group_uuid, t.created_at);
  }
  const ordered = [...earliest.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const map = new Map<string, number>();
  ordered.forEach(([g], i) => map.set(g, i + 1));
  return map;
}

// "#0001" style display id (empty string for a non-numbered entry).
export function formatInvoiceNo(n: number | undefined | null): string {
  return n ? `#${String(n).padStart(4, "0")}` : "";
}

// A party's ledger (newest first) for the profile timeline. Keyed off the
// [merchant_id+customer_id] / [merchant_id+supplier_id] compound indexes.
export async function getCustomerLedger(
  merchantId: string,
  customerId: string,
): Promise<LocalTransaction[]> {
  const rows = await getDb()
    .transactions.where("[merchant_id+customer_id]")
    .equals([merchantId, customerId])
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getSupplierLedger(
  merchantId: string,
  supplierId: string,
): Promise<LocalTransaction[]> {
  const rows = await getDb()
    .transactions.where("[merchant_id+supplier_id]")
    .equals([merchantId, supplierId])
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// The date the customer's CURRENT outstanding debt began, computed from their
// ledger: walk oldest→newest tracking the running balance and remember the date
// it last crossed from ≤0 to >0. Returns null if they currently owe nothing.
// Powers "debt aging" (days outstanding) without per-invoice lot tracking.
export function customerDebtStart(ledger: LocalTransaction[]): string | null {
  const events = [...ledger].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  let balance = 0;
  let start: string | null = null;
  for (const t of events) {
    // debt_balance is tracked in base SYP, so age it in SYP too (× the rate at
    // time of the transaction).
    const rate = Number(t.exchange_rate ?? 1) || 1;
    const delta =
      (t.type === "sell"
        ? Number(t.total) - Number(t.paid)
        : t.type === "return_customer" || t.type === "debt_payment"
          ? -Number(t.total)
          : 0) * rate;
    if (delta === 0) continue;
    const prev = balance;
    balance += delta;
    if (prev <= 0 && balance > 0) start = t.created_at;
    else if (balance <= 0) start = null;
  }
  return balance > 0 ? start : null;
}
