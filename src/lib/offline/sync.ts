import { createClient } from "@/lib/supabase/client";
import {
  getDb,
  type LocalProduct,
  type LocalTransaction,
  type LocalCustomer,
  type LocalSupplier,
  type LocalMerchantCurrency,
  type ConflictRecord,
} from "./db";
import { createUploadSignature, deleteImage } from "@/lib/cloudinary/actions";
import {
  uploadSigned,
  buildDeliveryUrl,
  PRODUCT_IMAGE_SIZE,
} from "@/lib/cloudinary/upload-client";

// The server-shaped product (every column, none of the local "_" metadata).
type ServerProduct = Omit<
  LocalProduct,
  "_sync" | "_op" | "_deleted" | "_base_updated_at"
>;

const COLUMNS =
  "id,merchant_id,name,name_en,barcode,category,subcategory,cost_price,sell_price,stock,min_stock,unit,supplier_id,image_url,image_public_id,custom_fields,notes,created_at,updated_at";

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Map a server row into a freshly-synced local record. Numerics are coerced
// because PostgREST can return NUMERIC as a string for large/precise values.
function toLocalSynced(s: ServerProduct): LocalProduct {
  return {
    id: s.id,
    merchant_id: s.merchant_id,
    name: s.name,
    name_en: s.name_en,
    barcode: s.barcode,
    category: s.category,
    subcategory: s.subcategory,
    cost_price: Number(s.cost_price),
    sell_price: Number(s.sell_price),
    stock: Number(s.stock),
    min_stock: Number(s.min_stock),
    unit: s.unit,
    supplier_id: s.supplier_id ?? null,
    image_url: s.image_url ?? null,
    image_public_id: s.image_public_id ?? null,
    custom_fields: s.custom_fields ?? {},
    notes: s.notes,
    created_at: s.created_at,
    updated_at: s.updated_at,
    _sync: "synced",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: s.updated_at,
  };
}

// The columns we send to the server for an upsert (no local metadata, no
// created_at/updated_at — the DB default + trigger own those timestamps).
function toServerRow(p: LocalProduct) {
  return {
    id: p.id,
    merchant_id: p.merchant_id,
    name: p.name,
    name_en: p.name_en,
    barcode: p.barcode,
    category: p.category,
    subcategory: p.subcategory,
    cost_price: p.cost_price,
    sell_price: p.sell_price,
    stock: p.stock,
    min_stock: p.min_stock,
    unit: p.unit,
    supplier_id: p.supplier_id,
    image_url: p.image_url,
    image_public_id: p.image_public_id,
    custom_fields: p.custom_fields,
    notes: p.notes,
  };
}

// Push every locally-pending change to Supabase. The product id is generated on
// the client, so upsert(onConflict:id) is idempotent — a retried push can never
// double-insert. RLS (merchant_id = auth.uid()) is the real authorization gate.
export async function pushPending(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.products
    .where("[merchant_id+_sync]")
    .equals([merchantId, "pending"])
    .toArray();

  for (const p of pending) {
    if (p._op === "delete") {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (!error) await db.products.delete(p.id);
      continue;
    }
    const { data, error } = await supabase
      .from("products")
      .upsert(toServerRow(p), { onConflict: "id" })
      .select(COLUMNS)
      .single();
    if (!error && data) {
      await db.products.put(toLocalSynced(data as ServerProduct));
    }
    // On error (offline / transient) the record stays pending for the next pass.
  }
}

// Upload product images waiting in product_images (picked offline, or a foreground
// upload that failed). For each: signed upload to Cloudinary → set the product's
// image_url/image_public_id (server + local) → delete the old asset → drop the blob.
// Best-effort: a failure leaves the row for the next pass; the product is never
// blocked, and an unconfigured Cloudinary just leaves images pending.
export async function pushPendingProductImages(
  merchantId: string,
): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.product_images
    .where("merchant_id")
    .equals(merchantId)
    .toArray();

  for (const img of pending) {
    const product = await db.products.get(img.product_id);
    if (!product || product._deleted) {
      await db.product_images.delete(img.product_id);
      continue;
    }
    // Wait until the product row exists server-side (pushPending runs first).
    if (product._sync === "pending") continue;

    try {
      const sig = await createUploadSignature("product");
      if (!sig) return; // Cloudinary not configured → leave pending
      const { publicId, version } = await uploadSigned(img.blob, sig);
      const url = buildDeliveryUrl(
        publicId,
        version,
        PRODUCT_IMAGE_SIZE,
        PRODUCT_IMAGE_SIZE,
      );
      const oldPublicId = product.image_public_id;
      const { data, error } = await supabase
        .from("products")
        .update({ image_url: url, image_public_id: publicId })
        .eq("id", product.id)
        .eq("merchant_id", merchantId)
        .select("id")
        .maybeSingle();
      if (error || !data) continue; // leave pending, retry next pass
      await db.products.update(product.id, {
        image_url: url,
        image_public_id: publicId,
      });
      await db.product_images.delete(img.product_id);
      if (oldPublicId && oldPublicId !== publicId) {
        try {
          await deleteImage(oldPublicId);
        } catch {
          /* best-effort */
        }
      }
    } catch {
      // leave pending for the next pass
    }
  }
}

async function recordConflict(
  local: LocalProduct,
  server: ServerProduct,
): Promise<void> {
  const rec: ConflictRecord = {
    id: crypto.randomUUID(),
    merchant_id: local.merchant_id,
    product_id: local.id,
    product_name: local.name,
    local_updated_at: local.updated_at,
    server_updated_at: server.updated_at,
    detected_at: new Date().toISOString(),
  };
  await getDb().conflicts.put(rec);
}

// Pull the server's products into Dexie, reconciling against local state:
// - new / locally-synced rows → overwrite with server (authoritative)
// - locally-pending rows → keep local, unless the server changed since our base
//   (a real conflict): log it and resolve last-write-wins by updated_at
// - locally-synced rows missing from the server → deleted elsewhere → drop
export async function pullProducts(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const { data, error } = await supabase.from("products").select(COLUMNS);
  if (error || !data) return;
  const server = data as ServerProduct[];

  await db.transaction("rw", db.products, db.conflicts, async () => {
    const locals = await db.products
      .where("merchant_id")
      .equals(merchantId)
      .toArray();
    const localById = new Map(locals.map((l) => [l.id, l]));
    const serverIds = new Set<string>();

    for (const s of server) {
      serverIds.add(s.id);
      const local = localById.get(s.id);

      if (!local || local._sync === "synced") {
        await db.products.put(toLocalSynced(s));
        continue;
      }
      if (local._op === "delete") {
        // We intend to delete this; leave the tombstone for push to apply.
        continue;
      }
      // Local pending upsert. If the server is unchanged since our base, keep
      // our edit (it will push). Otherwise it's a conflict.
      if (local._base_updated_at && s.updated_at !== local._base_updated_at) {
        await recordConflict(local, s);
        const serverNewer =
          new Date(s.updated_at).getTime() >
          new Date(local.updated_at).getTime();
        if (serverNewer) {
          await db.products.put(toLocalSynced(s)); // server wins
        } else {
          // Our edit is newer: keep pending but re-base so we don't re-flag.
          await db.products.update(local.id, { _base_updated_at: s.updated_at });
        }
      }
    }

    for (const l of locals) {
      if (!serverIds.has(l.id) && l._sync === "synced") {
        await db.products.delete(l.id);
      }
    }
  });
}

// ---- Transactions (append-only ledger) ------------------------------------

type ServerTransaction = {
  id: string;
  merchant_id: string;
  type: LocalTransaction["type"];
  product_id: string | null;
  product_name: string | null;
  qty: number | string;
  price: number | string;
  total: number | string;
  discount: number | string;
  paid: number | string;
  customer_id: string | null;
  supplier_id: string | null;
  payment: LocalTransaction["payment"];
  currency: string;
  exchange_rate: number | string;
  amount_syp: number | string | null;
  cost_price_snapshot: number | string | null;
  note: string | null;
  group_uuid: string | null;
  client_uuid: string | null;
  created_at: string;
};

const TX_COLUMNS =
  "id,merchant_id,type,product_id,product_name,qty,price,total,discount,paid,customer_id,supplier_id,payment,currency,exchange_rate,amount_syp,cost_price_snapshot,note,group_uuid,client_uuid,created_at";

function toLocalTxSynced(s: ServerTransaction): LocalTransaction {
  const rate = Number(s.exchange_rate ?? 1) || 1;
  return {
    client_uuid: s.client_uuid as string,
    id: s.id,
    merchant_id: s.merchant_id,
    type: s.type,
    product_id: s.product_id,
    product_name: s.product_name,
    qty: Number(s.qty),
    price: Number(s.price),
    total: Number(s.total),
    discount: Number(s.discount),
    paid: Number(s.paid ?? 0),
    customer_id: s.customer_id ?? null,
    supplier_id: s.supplier_id ?? null,
    payment: s.payment,
    currency: s.currency,
    exchange_rate: rate,
    amount_syp: s.amount_syp != null ? Number(s.amount_syp) : Number(s.total) * rate,
    cost_price_snapshot:
      s.cost_price_snapshot != null ? Number(s.cost_price_snapshot) : 0,
    note: s.note,
    group_uuid: s.group_uuid,
    created_at: s.created_at,
    _sync: "synced",
  };
}

// Push pending ledger rows via the atomic record_transaction RPC. client_uuid
// makes each call idempotent server-side, so a retried sync never double-applies
// stock or duplicates a row.
export async function pushPendingTransactions(
  merchantId: string,
): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.transactions
    .where("[merchant_id+_sync]")
    .equals([merchantId, "pending"])
    .sortBy("created_at"); // oldest first

  const moneyOnly = (type: LocalTransaction["type"]) =>
    type === "expense" ||
    type === "debt_payment" ||
    type === "supplier_payment" ||
    type === "mobile_credit" ||
    type === "sham_cash" ||
    type === "sham_cash_void";

  for (const t of pending) {
    const { data, error } = await supabase.rpc("record_transaction", {
      p_type: t.type,
      p_client_uuid: t.client_uuid,
      p_product_id: t.product_id,
      p_product_name: t.product_name,
      p_qty: t.qty,
      p_price: t.price,
      p_discount: t.discount,
      // Money-only types (expense / debt or supplier payment) carry their amount
      // in p_total; product lines let the RPC compute it from qty*price.
      p_total: moneyOnly(t.type) ? t.total : null,
      p_payment: t.payment,
      p_currency: t.currency,
      p_customer_id: t.customer_id,
      p_supplier_id: t.supplier_id,
      p_note: t.note,
      p_group_uuid: t.group_uuid,
      p_paid: t.paid,
      p_exchange_rate: t.exchange_rate ?? 1,
      // Sale-time cost snapshot (offline-accurate); RPC falls back to product cost.
      p_cost_price_snapshot: t.cost_price_snapshot ?? null,
    });
    if (!error && data) {
      const s = data as ServerTransaction;
      const rate = Number(s.exchange_rate ?? 1) || 1;
      await db.transactions.update(t.client_uuid, {
        id: s.id,
        total: Number(s.total),
        paid: Number(s.paid ?? 0),
        exchange_rate: rate,
        amount_syp:
          s.amount_syp != null ? Number(s.amount_syp) : Number(s.total) * rate,
        cost_price_snapshot:
          s.cost_price_snapshot != null ? Number(s.cost_price_snapshot) : 0,
        created_at: s.created_at,
        _sync: "synced",
      });
    }
    // On error (offline / transient) the row stays pending for the next pass.
  }
}

// Pull the most recent ledger rows into Dexie (multi-device / fresh-device
// history). The ledger is immutable, so there's no conflict logic — locally
// pending rows are skipped (they'll push).
export async function pullTransactions(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error || !data) return;
  const server = data as ServerTransaction[];

  await db.transaction("rw", db.transactions, async () => {
    const locals = await db.transactions
      .where("merchant_id")
      .equals(merchantId)
      .toArray();
    const pendingKeys = new Set(
      locals.filter((l) => l._sync === "pending").map((l) => l.client_uuid),
    );
    for (const s of server) {
      if (!s.client_uuid) continue;
      if (pendingKeys.has(s.client_uuid)) continue;
      await db.transactions.put(toLocalTxSynced(s));
    }
  });
}

// ---- Customers & suppliers (Phase 5) ---------------------------------------
//
// Same offline-first contract as products, with one twist: the balance
// (debt_balance / balance_owed) is SERVER-OWNED. It's never included in an
// upsert (so a profile edit can't clobber it) and is always taken from the
// server on pull — exactly how product stock is owned by the ledger RPC.

type ServerCustomer = {
  id: string;
  merchant_id: string;
  name: string;
  phone: string | null;
  neighborhood: string | null;
  telegram_chat_id: string | null;
  debt_balance: number | string;
  created_at: string;
  updated_at: string;
};

type ServerSupplier = {
  id: string;
  merchant_id: string;
  name: string;
  phone: string | null;
  payment_terms: string | null;
  balance_owed: number | string;
  created_at: string;
  updated_at: string;
};

const CUSTOMER_COLUMNS =
  "id,merchant_id,name,phone,neighborhood,telegram_chat_id,debt_balance,created_at,updated_at";
const SUPPLIER_COLUMNS =
  "id,merchant_id,name,phone,payment_terms,balance_owed,created_at,updated_at";

function toLocalCustomerSynced(s: ServerCustomer): LocalCustomer {
  return {
    id: s.id,
    merchant_id: s.merchant_id,
    name: s.name,
    phone: s.phone,
    neighborhood: s.neighborhood,
    telegram_chat_id: s.telegram_chat_id ?? null,
    debt_balance: Number(s.debt_balance),
    created_at: s.created_at,
    updated_at: s.updated_at,
    _sync: "synced",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: s.updated_at,
  };
}

function toLocalSupplierSynced(s: ServerSupplier): LocalSupplier {
  return {
    id: s.id,
    merchant_id: s.merchant_id,
    name: s.name,
    phone: s.phone,
    payment_terms: s.payment_terms,
    balance_owed: Number(s.balance_owed),
    created_at: s.created_at,
    updated_at: s.updated_at,
    _sync: "synced",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: s.updated_at,
  };
}

export async function pushPendingCustomers(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.customers
    .where("[merchant_id+_sync]")
    .equals([merchantId, "pending"])
    .toArray();

  for (const c of pending) {
    if (c._op === "delete") {
      const { error } = await supabase.from("customers").delete().eq("id", c.id);
      if (!error) await db.customers.delete(c.id);
      continue;
    }
    // Note: debt_balance is intentionally omitted — server-owned.
    const { data, error } = await supabase
      .from("customers")
      .upsert(
        {
          id: c.id,
          merchant_id: c.merchant_id,
          name: c.name,
          phone: c.phone,
          neighborhood: c.neighborhood,
          telegram_chat_id: c.telegram_chat_id,
        },
        { onConflict: "id" },
      )
      .select(CUSTOMER_COLUMNS)
      .single();
    if (!error && data)
      await db.customers.put(toLocalCustomerSynced(data as ServerCustomer));
  }
}

export async function pushPendingSuppliers(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.suppliers
    .where("[merchant_id+_sync]")
    .equals([merchantId, "pending"])
    .toArray();

  for (const s of pending) {
    if (s._op === "delete") {
      const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
      if (!error) await db.suppliers.delete(s.id);
      continue;
    }
    const { data, error } = await supabase
      .from("suppliers")
      .upsert(
        {
          id: s.id,
          merchant_id: s.merchant_id,
          name: s.name,
          phone: s.phone,
          payment_terms: s.payment_terms,
        },
        { onConflict: "id" },
      )
      .select(SUPPLIER_COLUMNS)
      .single();
    if (!error && data)
      await db.suppliers.put(toLocalSupplierSynced(data as ServerSupplier));
  }
}

export async function pullCustomers(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS);
  if (error || !data) return;
  const server = data as ServerCustomer[];

  await db.transaction("rw", db.customers, async () => {
    const locals = await db.customers
      .where("merchant_id")
      .equals(merchantId)
      .toArray();
    const localById = new Map(locals.map((l) => [l.id, l]));
    const serverIds = new Set<string>();

    for (const s of server) {
      serverIds.add(s.id);
      const local = localById.get(s.id);
      if (!local || local._sync === "synced") {
        await db.customers.put(toLocalCustomerSynced(s));
        continue;
      }
      if (local._op === "delete") continue; // tombstone awaits push
      // Pending profile edit: always adopt the server's (authoritative) balance;
      // resolve the profile fields last-write-wins on updated_at.
      const serverBalance = Number(s.debt_balance);
      if (local._base_updated_at && s.updated_at !== local._base_updated_at) {
        const serverNewer =
          new Date(s.updated_at).getTime() >
          new Date(local.updated_at).getTime();
        if (serverNewer) await db.customers.put(toLocalCustomerSynced(s));
        else
          await db.customers.update(local.id, {
            debt_balance: serverBalance,
            _base_updated_at: s.updated_at,
          });
      } else {
        await db.customers.update(local.id, { debt_balance: serverBalance });
      }
    }

    for (const l of locals) {
      if (!serverIds.has(l.id) && l._sync === "synced")
        await db.customers.delete(l.id);
    }
  });
}

export async function pullSuppliers(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select(SUPPLIER_COLUMNS);
  if (error || !data) return;
  const server = data as ServerSupplier[];

  await db.transaction("rw", db.suppliers, async () => {
    const locals = await db.suppliers
      .where("merchant_id")
      .equals(merchantId)
      .toArray();
    const localById = new Map(locals.map((l) => [l.id, l]));
    const serverIds = new Set<string>();

    for (const s of server) {
      serverIds.add(s.id);
      const local = localById.get(s.id);
      if (!local || local._sync === "synced") {
        await db.suppliers.put(toLocalSupplierSynced(s));
        continue;
      }
      if (local._op === "delete") continue;
      const serverBalance = Number(s.balance_owed);
      if (local._base_updated_at && s.updated_at !== local._base_updated_at) {
        const serverNewer =
          new Date(s.updated_at).getTime() >
          new Date(local.updated_at).getTime();
        if (serverNewer) await db.suppliers.put(toLocalSupplierSynced(s));
        else
          await db.suppliers.update(local.id, {
            balance_owed: serverBalance,
            _base_updated_at: s.updated_at,
          });
      } else {
        await db.suppliers.update(local.id, { balance_owed: serverBalance });
      }
    }

    for (const l of locals) {
      if (!serverIds.has(l.id) && l._sync === "synced")
        await db.suppliers.delete(l.id);
    }
  });
}

// ---- Merchant currencies (multi-currency) ----------------------------------
//
// Standard offline-first contract (like products): every field is client-owned,
// so it's a plain last-write-wins upsert/delete + LWW pull. No server-owned field.

type ServerCurrency = {
  id: string;
  merchant_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  rate_to_base: number | string;
  is_base: boolean;
  symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const CURRENCY_COLUMNS =
  "id,merchant_id,code,name_ar,name_en,rate_to_base,is_base,symbol,is_active,created_at,updated_at";

function toLocalCurrencySynced(s: ServerCurrency): LocalMerchantCurrency {
  return {
    id: s.id,
    merchant_id: s.merchant_id,
    code: s.code,
    name_ar: s.name_ar,
    name_en: s.name_en,
    rate_to_base: Number(s.rate_to_base),
    is_base: s.is_base,
    symbol: s.symbol,
    is_active: s.is_active,
    created_at: s.created_at,
    updated_at: s.updated_at,
    _sync: "synced",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: s.updated_at,
  };
}

export async function pushPendingCurrencies(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const pending = await db.merchant_currencies
    .where("[merchant_id+_sync]")
    .equals([merchantId, "pending"])
    .toArray();

  for (const c of pending) {
    if (c._op === "delete") {
      const { error } = await supabase
        .from("merchant_currencies")
        .delete()
        .eq("id", c.id);
      if (!error) await db.merchant_currencies.delete(c.id);
      continue;
    }
    const { data, error } = await supabase
      .from("merchant_currencies")
      .upsert(
        {
          id: c.id,
          merchant_id: c.merchant_id,
          code: c.code,
          name_ar: c.name_ar,
          name_en: c.name_en,
          rate_to_base: c.rate_to_base,
          is_base: c.is_base,
          symbol: c.symbol,
          is_active: c.is_active,
        },
        { onConflict: "id" },
      )
      .select(CURRENCY_COLUMNS)
      .single();
    if (!error && data)
      await db.merchant_currencies.put(toLocalCurrencySynced(data as ServerCurrency));
    // A duplicate (merchant_id, code) seeded server-side can reject the insert;
    // it stays pending and is reconciled by the pull below.
  }
}

export async function pullCurrencies(merchantId: string): Promise<void> {
  const db = getDb();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("merchant_currencies")
    .select(CURRENCY_COLUMNS);
  if (error || !data) return;
  const server = data as ServerCurrency[];

  await db.transaction("rw", db.merchant_currencies, async () => {
    const locals = await db.merchant_currencies
      .where("merchant_id")
      .equals(merchantId)
      .toArray();
    const localById = new Map(locals.map((l) => [l.id, l]));
    const serverIds = new Set<string>();

    for (const s of server) {
      serverIds.add(s.id);
      const local = localById.get(s.id);
      if (!local || local._sync === "synced") {
        await db.merchant_currencies.put(toLocalCurrencySynced(s));
        continue;
      }
      if (local._op === "delete") continue; // tombstone awaits push
      if (local._base_updated_at && s.updated_at !== local._base_updated_at) {
        const serverNewer =
          new Date(s.updated_at).getTime() >
          new Date(local.updated_at).getTime();
        if (serverNewer) await db.merchant_currencies.put(toLocalCurrencySynced(s));
        else
          await db.merchant_currencies.update(local.id, {
            _base_updated_at: s.updated_at,
          });
      }
    }

    for (const l of locals) {
      if (!serverIds.has(l.id) && l._sync === "synced")
        await db.merchant_currencies.delete(l.id);
    }
  });
}

// ---- Unified sync ----------------------------------------------------------

// Serialize syncs; if one is requested mid-run, run another pass afterwards so a
// just-saved record isn't left waiting.
let syncing = false;
let rerunRequested = false;

export async function syncAll(merchantId: string): Promise<void> {
  if (isOffline()) return;
  if (syncing) {
    rerunRequested = true;
    return;
  }
  syncing = true;
  try {
    do {
      rerunRequested = false;
      // Order matters:
      //  1) push parties first — a credit-sale ledger row references a
      //     client-generated customer/supplier id (FK), so the party row must
      //     exist server-side before the ledger pushes.
      //  2) push the ledger (record_transaction moves server stock + balances),
      //     then product edits.
      //  3) pull parties + products AFTER the ledger push, so the authoritative
      //     balances/stock the RPC just wrote aren't overwritten by a stale pull.
      await pushPendingCurrencies(merchantId);
      await pushPendingCustomers(merchantId);
      await pushPendingSuppliers(merchantId);
      await pushPendingTransactions(merchantId);
      await pushPending(merchantId);
      await pushPendingProductImages(merchantId);
      await pullCurrencies(merchantId);
      await pullCustomers(merchantId);
      await pullSuppliers(merchantId);
      await pullProducts(merchantId);
      await pullTransactions(merchantId);
    } while (rerunRequested && !isOffline());
  } finally {
    syncing = false;
  }
}
