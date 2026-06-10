import { z } from "zod";
import { NO_TAGS, PHONE_RE } from "./sanitize";

// Profile-only schemas. Balances (debt_balance / balance_owed) are never set
// from a form — the record_transaction RPC owns them — so they're absent here.

const phone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || PHONE_RE.test(v), { message: "invalid_phone" });

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(NO_TAGS)
    .optional()
    .transform((v) => (v ? v : null));

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NO_TAGS),
  phone,
  neighborhood: shortText(200),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NO_TAGS),
  phone,
  payment_terms: shortText(200),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

// Strip a phone to the digits WhatsApp expects (drops spaces, dashes, a leading
// "+" / "00"). Returns null when there aren't enough digits to dial.
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d.length >= 6 ? d : null;
}
