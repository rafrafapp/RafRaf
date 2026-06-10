import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductInput } from "@/lib/validation/product";
import type { CustomerInput } from "@/lib/validation/customer";
import type { ApiTransactionInput } from "./schemas";

// The ONLY place /api/v1 touches the database. Uses the service-role client
// (RLS-bypassing), so EVERY accessor pins the query to the caller's merchantId —
// this is the single chokepoint that enforces tenant isolation for the API.
// merchantId always comes from the authenticated key, never the request body.

const PRODUCT_COLS =
  "id,name,name_en,barcode,category,subcategory,cost_price,sell_price,stock,min_stock,unit,custom_fields,notes,created_at,updated_at";
const TX_COLS =
  "id,type,product_id,product_name,qty,price,total,discount,paid,payment,currency,customer_id,supplier_id,note,client_uuid,group_uuid,created_at";
const CUSTOMER_COLS = "id,name,phone,neighborhood,debt_balance,created_at,updated_at";

// Strip characters that are meaningful in a PostgREST filter string before using a
// user term in an .or(...) search (defense in depth; the merchant_id .eq is ANDed
// on top regardless, so isolation can't be escaped — this just avoids breakage).
function safeLike(q: string): string {
  return q.replace(/[,()%*:.\\]/g, "").trim().slice(0, 80);
}

// ---- products ----
export async function listProducts(
  merchantId: string,
  opts: { limit: number; offset: number; q?: string | null; category?: string | null },
) {
  let query = createAdminClient()
    .from("products")
    .select(PRODUCT_COLS)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.q) {
    const s = safeLike(opts.q);
    if (s) query = query.or(`name.ilike.%${s}%,name_en.ilike.%${s}%,barcode.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProduct(merchantId: string, id: string) {
  const { data } = await createAdminClient()
    .from("products")
    .select(PRODUCT_COLS)
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function createProduct(merchantId: string, input: ProductInput) {
  const { data, error } = await createAdminClient()
    .from("products")
    .insert({ ...input, merchant_id: merchantId })
    .select(PRODUCT_COLS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(
  merchantId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data } = await createAdminClient()
    .from("products")
    .update(patch)
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .select(PRODUCT_COLS)
    .maybeSingle();
  return data ?? null;
}

export async function deleteProduct(merchantId: string, id: string) {
  const { data } = await createAdminClient()
    .from("products")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return data ?? null;
}

export async function lowStockAlerts(merchantId: string) {
  const { data, error } = await createAdminClient()
    .from("products")
    .select("id,name,name_en,barcode,stock,min_stock,unit")
    .eq("merchant_id", merchantId)
    .limit(1000);
  if (error) throw error;
  return (data ?? []).filter(
    (p) => Number(p.stock) <= Number(p.min_stock ?? 0),
  );
}

// ---- transactions ----
export async function listTransactions(
  merchantId: string,
  opts: {
    limit: number;
    offset: number;
    type?: string | null;
    from?: string | null;
    to?: string | null;
  },
) {
  let query = createAdminClient()
    .from("transactions")
    .select(TX_COLS)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (opts.type) query = query.eq("type", opts.type);
  if (opts.from) query = query.gte("created_at", opts.from);
  if (opts.to) query = query.lte("created_at", opts.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Atomic + idempotent record via the service-role-only wrapper RPC, which records
// the transaction AS merchantId (stock/ledger/balances all handled in one place).
export async function recordTransaction(
  merchantId: string,
  body: ApiTransactionInput,
  clientUuid: string,
) {
  const { data, error } = await createAdminClient().rpc("api_record_transaction", {
    p_merchant_id: merchantId,
    p_type: body.type,
    p_client_uuid: clientUuid,
    p_product_id: body.product_id ?? null,
    p_product_name: body.product_name ?? null,
    p_qty: body.qty ?? 0,
    p_price: body.price ?? 0,
    p_discount: body.discount ?? 0,
    p_total: body.total ?? null,
    p_payment: body.payment ?? "cash",
    p_currency: body.currency ?? "SYP",
    p_customer_id: body.customer_id ?? null,
    p_supplier_id: body.supplier_id ?? null,
    p_note: body.note ?? null,
    p_group_uuid: null,
    p_paid: body.paid ?? null,
  });
  if (error) throw error;
  return data;
}

// ---- customers ----
export async function listCustomers(
  merchantId: string,
  opts: { limit: number; offset: number; q?: string | null },
) {
  let query = createAdminClient()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (opts.q) {
    const s = safeLike(opts.q);
    if (s) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCustomer(merchantId: string, id: string) {
  const { data } = await createAdminClient()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function createCustomer(merchantId: string, input: CustomerInput) {
  // debt_balance is server-owned (the RPC writes it) — never set from the API.
  const { data, error } = await createAdminClient()
    .from("customers")
    .insert({
      merchant_id: merchantId,
      name: input.name,
      phone: input.phone,
      neighborhood: input.neighborhood,
    })
    .select(CUSTOMER_COLS)
    .single();
  if (error) throw error;
  return data;
}
