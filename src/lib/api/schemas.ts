import { z } from "zod";
import { NO_TAGS, sanitizeText } from "@/lib/validation/sanitize";
import { productSchema } from "@/lib/validation/product";

// API request schemas. Product/customer create reuse the app's Zod schemas
// (lib/validation/*); this file adds the transaction body, the PATCH (partial)
// product shape, and list paging. Free-text is cleaned with the regex-only
// sanitizeText (no DOMPurify/jsdom) so the Node API routes never bundle it.

const money = z.number().finite().nonnegative().max(1_000_000_000);
const qty = z.number().finite().positive().max(1_000_000);

export const apiTransactionSchema = z.object({
  type: z.enum([
    "sell",
    "buy",
    "return_customer",
    "return_supplier",
    "expense",
    "debt_payment",
    "supplier_payment",
  ]),
  // Idempotency key. Optional — generated if absent — but callers SHOULD send a
  // stable one so a retried request can't double-record.
  client_uuid: z.string().min(8).max(64).optional(),
  product_id: z.string().uuid().nullable().optional(),
  product_name: z.string().min(1).max(300).regex(NO_TAGS).nullable().optional(),
  qty: qty.optional(),
  price: money.optional(),
  discount: z.number().finite().min(0).max(100).optional(),
  total: money.optional(),
  payment: z.enum(["cash", "credit", "partial"]).optional(),
  currency: z.string().min(1).max(10).optional(),
  customer_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  note: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (typeof v === "string" ? sanitizeText(v) : v)),
  paid: money.optional(),
});
export type ApiTransactionInput = z.infer<typeof apiTransactionSchema>;

// PATCH /products/[id]: every field optional; only provided keys are updated.
export const productPatchSchema = productSchema.partial();

// ?limit=&offset= paging for list endpoints (coerced from query strings).
export const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function parsePaging(url: URL): { limit: number; offset: number } {
  const parsed = pagingSchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  return parsed.success ? parsed.data : { limit: 20, offset: 0 };
}
