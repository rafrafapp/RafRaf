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

// A Telegram chat id (numeric; may be negative for groups). Optional — the owner
// pastes it in to enable automatic debt reminders to that customer.
const telegramChatId = z
  .string()
  .trim()
  .max(40)
  .regex(/^-?\d{1,32}$/)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NO_TAGS),
  phone,
  neighborhood: shortText(200),
  telegram_chat_id: telegramChatId,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NO_TAGS),
  phone,
  payment_terms: shortText(200),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
