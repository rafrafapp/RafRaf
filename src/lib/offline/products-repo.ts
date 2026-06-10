import { getDb, type LocalProduct } from "./db";
import type { ProductInput } from "@/lib/validation/product";

function nowIso(): string {
  return new Date().toISOString();
}

// The product fields the form actually edits. supplier_id / image_url /
// subcategory are intentionally NOT here so an edit preserves whatever the
// server (or a future feature) set on them.
function managedFields(d: ProductInput) {
  return {
    name: d.name,
    name_en: d.name_en ?? null,
    barcode: d.barcode ?? null,
    category: d.category ?? null,
    cost_price: d.cost_price,
    sell_price: d.sell_price,
    stock: d.stock,
    min_stock: d.min_stock,
    unit: d.unit ?? null,
    notes: d.notes ?? null,
    custom_fields: d.custom_fields,
  };
}

// Write-to-IndexedDB-first: create or update a product locally, marked pending.
// The caller triggers a sync afterwards (best-effort; it just waits if offline).
export async function saveProduct(opts: {
  mode: "create" | "edit";
  merchantId: string;
  base?: LocalProduct;
  data: ProductInput;
}): Promise<string> {
  const db = getDb();
  const now = nowIso();

  if (opts.mode === "edit" && opts.base) {
    const rec: LocalProduct = {
      ...opts.base,
      ...managedFields(opts.data),
      updated_at: now,
      _sync: "pending",
      _op: "upsert",
      _deleted: 0,
    };
    await db.products.put(rec);
    return rec.id;
  }

  const rec: LocalProduct = {
    id: crypto.randomUUID(),
    merchant_id: opts.merchantId,
    subcategory: null,
    supplier_id: null,
    image_url: null,
    image_public_id: null,
    ...managedFields(opts.data),
    created_at: now,
    updated_at: now,
    _sync: "pending",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: null,
  };
  await db.products.put(rec);
  return rec.id;
}

// Delete a product. If it was never synced to the server, just drop it locally;
// otherwise leave a tombstone for the sync engine to apply server-side.
export async function deleteProductLocal(id: string): Promise<void> {
  const db = getDb();
  const rec = await db.products.get(id);
  if (!rec) return;

  if (rec._base_updated_at == null) {
    // Created offline and never pushed — nothing on the server to delete.
    await db.products.delete(id);
    return;
  }
  await db.products.update(id, {
    _op: "delete",
    _sync: "pending",
    _deleted: 1,
    updated_at: nowIso(),
  });
}

// Load a single local product. Resolves to null (not undefined) when absent so
// callers can distinguish "not found" from useLiveQuery's "still loading".
export function getLocalProduct(id: string): Promise<LocalProduct | null> {
  return getDb()
    .products.get(id)
    .then((r) => r ?? null);
}

// ---- product images ----------------------------------------------------------

// Stash a picked image locally (offline, or after a failed foreground upload) so
// the sync engine uploads it to Cloudinary on reconnect (pushPendingProductImages).
export async function stashProductImage(
  merchantId: string,
  productId: string,
  blob: Blob,
): Promise<void> {
  await getDb().product_images.put({
    product_id: productId,
    merchant_id: merchantId,
    blob,
    created_at: nowIso(),
  });
}

// Record a successfully (foreground) uploaded image on the product. Marked pending
// so the normal product push persists image_url/image_public_id to the server.
export async function setProductImage(
  productId: string,
  imageUrl: string,
  imagePublicId: string,
): Promise<void> {
  await getDb().products.update(productId, {
    image_url: imageUrl,
    image_public_id: imagePublicId,
    _sync: "pending",
    _op: "upsert",
    updated_at: nowIso(),
  });
}

// Remove a product's image (drops any pending blob + nulls the columns, pending
// push). The caller deletes the old Cloudinary asset (server action).
export async function clearProductImage(productId: string): Promise<void> {
  const db = getDb();
  await db.product_images.delete(productId);
  await db.products.update(productId, {
    image_url: null,
    image_public_id: null,
    _sync: "pending",
    _op: "upsert",
    updated_at: nowIso(),
  });
}
