import { z } from "zod";
import { NO_TAGS, BARCODE_RE, sanitizeText } from "./sanitize";

// Stock units offered in the product form. Constrained here (input) and surfaced
// as a <select>; the DB column stays free-text so CSV import (Phase 2 later) can
// stay forgiving about messy real-world values.
export const PRODUCT_UNITS = ["piece", "kg", "liter", "box", "carton"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

// Per-business-type extra fields persisted into products.custom_fields (JSONB).
// The field DEFINITIONS are now admin-managed in the `business_types` table (see
// lib/business-types/read.ts) rather than hardcoded here. `ProductCustomField`
// carries the label already resolved to the active locale; the product form
// renders one input per field.
export type CustomFieldType = "text" | "number" | "date";
export type ProductCustomField = {
  key: string;
  type: CustomFieldType;
  label: string;
};

// Optional name-ish text: trim, max length, and reject angle brackets (tag
// injection). Empty → "not provided".
const optionalName = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(NO_TAGS)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

// Optional free text (notes): strip any markup rather than reject.
const optionalNotes = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? sanitizeText(v) : undefined));

// Money/quantity fields arrive from FormData as strings; coerce then bound to a
// sane non-negative range. "" coerces to 0, which is the desired default.
const quantity = z.coerce
  .number()
  .min(0)
  .max(1_000_000_000_000)
  .default(0);

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NO_TAGS),
  name_en: optionalName(200),
  barcode: z
    .string()
    .trim()
    .max(120)
    .regex(BARCODE_RE)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  category: optionalName(120),
  subcategory: optionalName(120),
  cost_price: quantity,
  sell_price: quantity,
  stock: quantity,
  min_stock: quantity,
  unit: z
    .enum(PRODUCT_UNITS)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  notes: optionalNotes(2000),
  // The action assembles this from only the keys valid for the merchant's
  // business type, so a flat record of primitives is all we need to validate.
  // String values are sanitized (markup stripped) as defense in depth.
  custom_fields: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .default({})
    .transform((rec) => {
      const out: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(rec)) {
        out[k] = typeof v === "string" ? sanitizeText(v) : v;
      }
      return out;
    }),
});

export type ProductInput = z.infer<typeof productSchema>;
