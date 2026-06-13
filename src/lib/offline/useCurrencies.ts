"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type LocalMerchantCurrency } from "./db";

export type CurrencyView = {
  currencies: LocalMerchantCurrency[]; // active + base, base first
  all: LocalMerchantCurrency[]; // includes inactive (for Settings)
  base: LocalMerchantCurrency | null;
};

// Live, offline-first read of the merchant's currencies. `currencies` is the set a
// transaction form should offer (active + the base); `all` includes inactive ones
// for the Settings manager.
export function useCurrencies(merchantId: string): CurrencyView {
  const all =
    useLiveQuery(
      () =>
        getDb()
          .merchant_currencies.where("[merchant_id+_deleted]")
          .equals([merchantId, 0])
          .toArray(),
      [merchantId],
      [],
    ) ?? [];

  const sorted = [...all].sort((a, b) =>
    a.is_base === b.is_base ? a.code.localeCompare(b.code) : a.is_base ? -1 : 1,
  );
  const currencies = sorted.filter((c) => c.is_active || c.is_base);
  const base = sorted.find((c) => c.is_base) ?? null;
  return { currencies, all: sorted, base };
}

// Resolve the rate_to_base for a currency code from a currency list (default 1).
export function rateFor(
  currencies: LocalMerchantCurrency[],
  code: string,
): number {
  const c = currencies.find((x) => x.code === code);
  return c ? Number(c.rate_to_base) || 1 : 1;
}

export function symbolFor(
  currencies: LocalMerchantCurrency[],
  code: string,
): string {
  return currencies.find((x) => x.code === code)?.symbol ?? code;
}
