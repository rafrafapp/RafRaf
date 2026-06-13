import { z } from "zod";
import { NO_TAGS, sanitizeText } from "./sanitize";

// Common currencies offered in the "add currency" picker (besides the SYP base).
// `other` lets the merchant type any code/name/symbol.
export const CURRENCY_PRESETS = [
  { code: "USD", name_ar: "دولار أمريكي", name_en: "US Dollar", symbol: "$" },
  { code: "EUR", name_ar: "يورو", name_en: "Euro", symbol: "€" },
  { code: "TRY", name_ar: "ليرة تركية", name_en: "Turkish Lira", symbol: "₺" },
  { code: "AED", name_ar: "درهم إماراتي", name_en: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name_ar: "ريال سعودي", name_en: "Saudi Riyal", symbol: "ر.س" },
] as const;

// The base currency every store starts with (seeded on setup, never deletable).
export const BASE_CURRENCY = {
  code: "SYP",
  name_ar: "ليرة سورية",
  name_en: "Syrian Pound",
  symbol: "ل.س",
} as const;

export const currencySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,8}$/)
    .transform((s) => s.toUpperCase()),
  name_ar: z.string().trim().min(1).max(40).regex(NO_TAGS).transform(sanitizeText),
  name_en: z.string().trim().min(1).max(40).regex(NO_TAGS).transform(sanitizeText),
  symbol: z.string().trim().min(1).max(8).regex(NO_TAGS).transform(sanitizeText),
  // SYP per 1 unit of this currency (e.g. USD → 14500). Base is always 1.
  rate_to_base: z.coerce.number().positive().finite(),
  is_active: z.boolean().optional().default(true),
});

export type CurrencyInput = z.infer<typeof currencySchema>;

// Convert an amount in a currency to base (SYP) and back, given rate_to_base.
export function toBase(amount: number, rateToBase: number): number {
  return amount * rateToBase;
}
export function fromBase(amountSyp: number, rateToBase: number): number {
  return rateToBase > 0 ? amountSyp / rateToBase : amountSyp;
}
