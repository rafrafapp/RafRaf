import { z } from "zod";
import type { PaymentMethod } from "@/lib/offline/db";
import { NO_TAGS } from "./sanitize";
import { sanitizeString } from "./sanitize-html";

// Payment methods (debt handling for credit/partial arrives in Phase 5).
export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "credit", "partial"];

// ---- Zod validation for ledger writes (Layer 2, defense in depth) ----------
// The DB also enforces this (RLS + CHECK constraints + the record_transaction
// RPC), but we validate before writing to IndexedDB so bad data never enters.
const qty = z.number().finite().positive().max(1_000_000);
const money = z.number().finite().nonnegative().max(1_000_000_000);
const uuidOrNull = z.string().uuid().nullable();
// Free-text note: strip any markup (null/undefined pass through).
const noteField = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (typeof v === "string" ? sanitizeString(v) : v));
const productName = z.string().min(1).max(300).regex(NO_TAGS);
const paymentField = z.enum(["cash", "credit", "partial"]);

export const cartLineSchema = z.object({
  product_id: uuidOrNull,
  product_name: productName,
  qty,
  price: money,
  discount: z.number().finite().min(0).max(100),
});

export const saleInputSchema = z.object({
  merchantId: z.string().uuid(),
  currency: z.string().min(1).max(10),
  payment: paymentField,
  lines: z.array(cartLineSchema).min(1).max(500),
  customerId: z.string().uuid().nullable().optional(),
  paid: money.optional(),
  note: noteField,
});

export const transactionInputSchema = z.object({
  merchantId: z.string().uuid(),
  type: z.enum(["buy", "return_customer", "return_supplier", "expense"]),
  currency: z.string().min(1).max(10),
  product_id: z.string().uuid().nullable().optional(),
  product_name: productName.nullable().optional(),
  qty: qty.optional(),
  price: money.optional(),
  total: money.optional(),
  note: noteField,
  payment: paymentField.optional(),
  customerId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  paid: money.optional(),
});

export const settlementInputSchema = z.object({
  merchantId: z.string().uuid(),
  amount: money.refine((v) => v > 0, "amount must be positive"),
  currency: z.string().min(1).max(10),
  note: noteField,
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});

// ---- Service transaction types (no inventory, no party) --------------------

export const MOBILE_PROVIDERS = ["syriatel", "mtn", "bth", "other"] as const;
export type MobileProvider = (typeof MOBILE_PROVIDERS)[number];

// Mobile credit (وحدات): amount_sold + optional cost; profit = sold − cost.
export const mobileCreditInputSchema = z.object({
  merchantId: z.string().uuid(),
  provider: z.enum(MOBILE_PROVIDERS),
  amountSold: money.refine((v) => v > 0, "amount must be positive"),
  cost: money.optional(),
  payment: paymentField.optional(),
  currency: z.string().min(1).max(10),
  note: noteField,
});

// Sham Cash (شام كاش): usd × rate + commission. Bounds keep total under the DB cap
// (qty=usd ≤ 1e5, price=rate ≤ 1e6 → total ≤ ~1e11 < 1e12).
export const shamCashInputSchema = z.object({
  merchantId: z.string().uuid(),
  amountUsd: z.number().finite().positive().max(100_000),
  exchangeRate: z.number().finite().positive().max(1_000_000),
  commission: money, // SYP, ≥ 0
  payment: paymentField.optional(),
  currency: z.string().min(1).max(10),
  note: noteField,
});

// Categorized expenses. Labels live in the dictionaries under
// transactions.expenseCategories.<key>.
export const EXPENSE_CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "supplies",
  "transport",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Return direction: goods coming back from a customer, or going back to a
// supplier. Maps to transaction types return_customer / return_supplier.
export const RETURN_KINDS = ["return_customer", "return_supplier"] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];

// Parse a user-entered positive number (qty / price / amount); returns null if
// invalid so the form can show an error.
export function parsePositive(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
