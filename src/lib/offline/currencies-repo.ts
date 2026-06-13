import { getDb, type LocalMerchantCurrency } from "./db";
import { BASE_CURRENCY, type CurrencyInput } from "@/lib/validation/currency";

function nowIso(): string {
  return new Date().toISOString();
}

// Editable fields. `code` + `is_base` are set only at creation (immutable after).
function managedFields(d: CurrencyInput) {
  return {
    name_ar: d.name_ar,
    name_en: d.name_en,
    symbol: d.symbol,
    rate_to_base: d.rate_to_base,
    is_active: d.is_active ?? true,
  };
}

// Write-to-IndexedDB-first: create or update a currency locally, marked pending.
export async function saveCurrency(opts: {
  mode: "create" | "edit";
  merchantId: string;
  base?: LocalMerchantCurrency;
  data: CurrencyInput;
}): Promise<string> {
  const db = getDb();
  const now = nowIso();

  if (opts.mode === "edit" && opts.base) {
    const rec: LocalMerchantCurrency = {
      ...opts.base,
      ...managedFields(opts.data),
      // base currency's rate is locked to 1
      rate_to_base: opts.base.is_base ? 1 : opts.data.rate_to_base,
      updated_at: now,
      _sync: "pending",
      _op: "upsert",
      _deleted: 0,
    };
    await db.merchant_currencies.put(rec);
    return rec.id;
  }

  const rec: LocalMerchantCurrency = {
    id: crypto.randomUUID(),
    merchant_id: opts.merchantId,
    code: opts.data.code,
    ...managedFields(opts.data),
    is_base: false,
    created_at: now,
    updated_at: now,
    _sync: "pending",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: null,
  };
  await db.merchant_currencies.put(rec);
  return rec.id;
}

// Delete a currency (never the base). Never-synced rows drop locally; otherwise a
// tombstone is left for the sync engine.
export async function deleteCurrencyLocal(id: string): Promise<void> {
  const db = getDb();
  const rec = await db.merchant_currencies.get(id);
  if (!rec || rec.is_base) return; // base is never deletable
  if (rec._base_updated_at == null) {
    await db.merchant_currencies.delete(id);
    return;
  }
  await db.merchant_currencies.update(id, {
    _op: "delete",
    _sync: "pending",
    _deleted: 1,
    updated_at: nowIso(),
  });
}

// All non-deleted currencies for a merchant (base first, then by code).
export async function getLocalCurrencies(
  merchantId: string,
): Promise<LocalMerchantCurrency[]> {
  const rows = await getDb()
    .merchant_currencies.where("[merchant_id+_deleted]")
    .equals([merchantId, 0])
    .toArray();
  return rows.sort((a, b) =>
    a.is_base === b.is_base ? a.code.localeCompare(b.code) : a.is_base ? -1 : 1,
  );
}

export async function getBaseCurrency(
  merchantId: string,
): Promise<LocalMerchantCurrency | null> {
  const rows = await getLocalCurrencies(merchantId);
  return rows.find((c) => c.is_base) ?? null;
}

// Ensure the SYP base currency exists locally (idempotent). Used as a safety net
// so transaction forms always have at least the base available offline, even
// before the first pull. The unique (merchant_id, code) index dedupes on sync.
export async function ensureBaseCurrency(merchantId: string): Promise<void> {
  const db = getDb();
  const existing = await db.merchant_currencies
    .where("[merchant_id+_deleted]")
    .equals([merchantId, 0])
    .toArray();
  if (existing.some((c) => c.is_base || c.code === BASE_CURRENCY.code)) return;
  const now = nowIso();
  await db.merchant_currencies.put({
    id: crypto.randomUUID(),
    merchant_id: merchantId,
    code: BASE_CURRENCY.code,
    name_ar: BASE_CURRENCY.name_ar,
    name_en: BASE_CURRENCY.name_en,
    symbol: BASE_CURRENCY.symbol,
    rate_to_base: 1,
    is_base: true,
    is_active: true,
    created_at: now,
    updated_at: now,
    _sync: "pending",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: null,
  });
}
