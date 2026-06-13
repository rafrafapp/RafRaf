import Dexie, { type Table } from "dexie";

// Local sync state for a record. "pending" = there's a local change not yet on
// the server; "synced" = it matches the server as of the last pull/push.
export type SyncState = "pending" | "synced";
export type SyncOp = "upsert" | "delete";

// A product as stored in IndexedDB: every server column (so push/pull round-trip
// without losing fields the UI doesn't edit yet, e.g. supplier_id) plus local
// sync metadata (the "_"-prefixed fields, never sent to the server).
export interface LocalProduct {
  id: string; // client-generated UUID for offline creates → also the dedupe key
  merchant_id: string;
  name: string;
  name_en: string | null;
  barcode: string | null;
  category: string | null;
  subcategory: string | null;
  cost_price: number;
  sell_price: number;
  stock: number;
  min_stock: number;
  unit: string | null;
  supplier_id: string | null;
  image_url: string | null;
  image_public_id: string | null; // Cloudinary public_id (for replace/delete)
  custom_fields: Record<string, string | number>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  _sync: SyncState;
  _op: SyncOp;
  _deleted: 0 | 1; // tombstone for offline deletes (hidden from the list)
  // The server updated_at this local row was last reconciled against. Lets the
  // pull detect "server changed since our edit" precisely, despite clock skew.
  _base_updated_at: string | null;
}

// A logged conflict: the pull found the server changed a record that also had a
// local pending edit. Surfaced to the owner; resolution is last-write-wins.
export interface ConflictRecord {
  id: string;
  merchant_id: string;
  product_id: string;
  product_name: string;
  local_updated_at: string;
  server_updated_at: string;
  detected_at: string;
}

// A product image awaiting upload to Cloudinary, kept in its own store so product
// push/pull never has to carry a Blob. Created when an image is picked offline (or
// a foreground upload failed); consumed by pushPendingProductImages on sync, which
// uploads it, sets the product's image_url/image_public_id, then deletes this row.
export interface LocalProductImage {
  product_id: string; // PK = the product's local id
  merchant_id: string;
  blob: Blob;
  created_at: string;
}

export type TxType =
  | "sell"
  | "buy"
  | "return_customer"
  | "return_supplier"
  | "expense"
  | "debt_payment" // customer pays down their debt (Phase 5)
  | "supplier_payment" // store pays a supplier (Phase 5)
  | "mobile_credit" // phone-credit sale (وحدات) — service income, no stock
  | "sham_cash" // Sham Cash transfer (شام كاش) — service income, no stock
  | "sham_cash_void"; // reversal/cancel of a sham_cash row (money-only)

export type PaymentMethod = "cash" | "credit" | "partial";

// A ledger row as stored in IndexedDB. Keyed by client_uuid (client-generated)
// so it has a stable local id before the server assigns `id` on sync, and that
// same client_uuid is the server-side dedup key. The ledger is append-only, so
// there's no _op/_deleted — only pending vs synced. group_uuid ties the lines of
// one multi-item cart into a single invoice. customer_id/supplier_id link a row
// to a party (Phase 5); paid is the amount received now (debt = total - paid).
export interface LocalTransaction {
  client_uuid: string; // PK + dedup key
  id: string | null; // server id, assigned on sync
  merchant_id: string;
  type: TxType;
  product_id: string | null;
  product_name: string | null;
  qty: number;
  price: number;
  total: number;
  discount: number;
  paid: number;
  customer_id: string | null;
  supplier_id: string | null;
  payment: PaymentMethod;
  currency: string; // the transaction's currency code (reused as currency_code)
  // Multi-currency: the rate (base/SYP per 1 unit of `currency`) at the moment of
  // the transaction, and the SYP-equivalent (= total × exchange_rate). Snapshotted
  // so historical reports use the rate that was true when the sale happened.
  exchange_rate: number;
  amount_syp: number;
  note: string | null;
  group_uuid: string | null;
  created_at: string;
  _sync: SyncState;
}

// A customer as stored in IndexedDB: profile fields are client-owned (edited
// offline, pushed via upsert), but debt_balance is SERVER-OWNED — only the
// record_transaction RPC writes it, and the pull always takes the server value
// (exactly like product stock). Keyed by a client-generated id = dedupe key.
export interface LocalCustomer {
  id: string;
  merchant_id: string;
  name: string;
  phone: string | null;
  neighborhood: string | null;
  telegram_chat_id: string | null; // optional — enables Telegram debt reminders
  debt_balance: number; // server-authoritative (+ = owes the store)
  created_at: string;
  updated_at: string;
  _sync: SyncState;
  _op: SyncOp;
  _deleted: 0 | 1;
  _base_updated_at: string | null;
}

// A supplier as stored in IndexedDB. balance_owed is server-owned like a
// customer's debt_balance (+ = the store owes the supplier).
export interface LocalSupplier {
  id: string;
  merchant_id: string;
  name: string;
  phone: string | null;
  payment_terms: string | null;
  balance_owed: number; // server-authoritative
  created_at: string;
  updated_at: string;
  _sync: SyncState;
  _op: SyncOp;
  _deleted: 0 | 1;
  _base_updated_at: string | null;
}

// A merchant currency as stored in IndexedDB. Unlike product stock / party
// balances, EVERY field here is client-owned (the merchant edits the rate, symbol,
// active flag) — so it syncs last-write-wins like a product, no server-owned field.
// `code` + `is_base` are immutable after creation. `rate_to_base` = base (SYP) per
// 1 unit of this currency; the base currency (SYP) always has rate 1.
export interface LocalMerchantCurrency {
  id: string;
  merchant_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  rate_to_base: number;
  is_base: boolean;
  symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  _sync: SyncState;
  _op: SyncOp;
  _deleted: 0 | 1;
  _base_updated_at: string | null;
}

class RafRafDB extends Dexie {
  products!: Table<LocalProduct, string>;
  conflicts!: Table<ConflictRecord, string>;
  transactions!: Table<LocalTransaction, string>;
  customers!: Table<LocalCustomer, string>;
  suppliers!: Table<LocalSupplier, string>;
  product_images!: Table<LocalProductImage, string>;
  merchant_currencies!: Table<LocalMerchantCurrency, string>;

  constructor() {
    super("rafraf");
    this.version(1).stores({
      // Indexed fields only; the full record is stored regardless.
      products:
        "id, merchant_id, _sync, _deleted, category, barcode, updated_at, [merchant_id+_deleted], [merchant_id+_sync]",
      conflicts: "id, merchant_id, product_id, detected_at",
    });
    // v2 adds the append-only transactions ledger (Phase 4).
    this.version(2).stores({
      transactions:
        "client_uuid, id, merchant_id, type, group_uuid, _sync, created_at, [merchant_id+_sync], [merchant_id+created_at], [merchant_id+group_uuid]",
    });
    // v3 adds customers + suppliers (Phase 5) and indexes the ledger's party
    // columns so a profile's transaction history reads straight from Dexie.
    this.version(3).stores({
      transactions:
        "client_uuid, id, merchant_id, type, group_uuid, customer_id, supplier_id, _sync, created_at, [merchant_id+_sync], [merchant_id+created_at], [merchant_id+group_uuid], [merchant_id+customer_id], [merchant_id+supplier_id]",
      customers:
        "id, merchant_id, _sync, _deleted, updated_at, [merchant_id+_deleted], [merchant_id+_sync]",
      suppliers:
        "id, merchant_id, _sync, _deleted, updated_at, [merchant_id+_deleted], [merchant_id+_sync]",
    });
    // v4 adds the product_images store — Blobs of product images picked offline (or
    // when a foreground upload failed), awaiting upload to Cloudinary on sync.
    this.version(4).stores({
      product_images: "product_id, merchant_id",
    });
    // v5 adds merchant_currencies (multi-currency) — mirrored + synced like products.
    this.version(5).stores({
      merchant_currencies:
        "id, merchant_id, _sync, _deleted, code, updated_at, [merchant_id+_deleted], [merchant_id+_sync]",
    });
  }
}

// Lazy singleton: the Dexie instance is only constructed in the browser, so the
// module is safe to import from client components that also render on the server.
let _db: RafRafDB | null = null;

export function getDb(): RafRafDB {
  if (!_db) _db = new RafRafDB();
  return _db;
}

// Wipe all local data. Called on logout so the next user on this device/browser
// can never see the previous merchant's cached inventory (security).
export async function clearLocalData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await getDb().delete();
  } finally {
    _db = null;
  }
}
