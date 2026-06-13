"use client";

import type { Locale } from "@/i18n/config";
import type { LocalMerchantCurrency } from "@/lib/offline/db";

// A plain currency <select> (the caller wraps it in its own label markup). Lists
// the merchant's active currencies; the merchant's base is first.
export function CurrencySelect({
  currencies,
  value,
  onChange,
  locale,
  className,
  disabled,
}: {
  currencies: LocalMerchantCurrency[];
  value: string;
  onChange: (code: string) => void;
  locale: Locale;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={className}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      dir="ltr"
      aria-label="currency"
    >
      {currencies.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {locale === "ar" ? c.name_ar : c.name_en} ({c.symbol})
        </option>
      ))}
    </select>
  );
}
