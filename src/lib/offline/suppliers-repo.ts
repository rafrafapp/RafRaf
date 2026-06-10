import { getDb, type LocalSupplier } from "./db";
import type { SupplierInput } from "@/lib/validation/customer";

function nowIso(): string {
  return new Date().toISOString();
}

// Profile fields only — balance_owed is server-owned (record_transaction RPC),
// like a customer's debt_balance, so an edit must never overwrite it.
function managedFields(d: SupplierInput) {
  return {
    name: d.name,
    phone: d.phone ?? null,
    payment_terms: d.payment_terms ?? null,
  };
}

export async function saveSupplier(opts: {
  mode: "create" | "edit";
  merchantId: string;
  base?: LocalSupplier;
  data: SupplierInput;
}): Promise<string> {
  const db = getDb();
  const now = nowIso();

  if (opts.mode === "edit" && opts.base) {
    const rec: LocalSupplier = {
      ...opts.base,
      ...managedFields(opts.data),
      updated_at: now,
      _sync: "pending",
      _op: "upsert",
      _deleted: 0,
    };
    await db.suppliers.put(rec);
    return rec.id;
  }

  const rec: LocalSupplier = {
    id: crypto.randomUUID(),
    merchant_id: opts.merchantId,
    ...managedFields(opts.data),
    balance_owed: 0,
    created_at: now,
    updated_at: now,
    _sync: "pending",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: null,
  };
  await db.suppliers.put(rec);
  return rec.id;
}

export async function deleteSupplierLocal(id: string): Promise<void> {
  const db = getDb();
  const rec = await db.suppliers.get(id);
  if (!rec) return;
  if (rec._base_updated_at == null) {
    await db.suppliers.delete(id);
    return;
  }
  await db.suppliers.update(id, {
    _op: "delete",
    _sync: "pending",
    _deleted: 1,
    updated_at: nowIso(),
  });
}

export function getLocalSupplier(id: string): Promise<LocalSupplier | null> {
  return getDb()
    .suppliers.get(id)
    .then((r) => r ?? null);
}

// Optimistic, not-pending balance bump (server RPC owns the real delta;
// pullSuppliers reconciles). Mirrors bumpDebt / product bumpStock.
export async function bumpOwed(
  supplierId: string,
  delta: number,
): Promise<void> {
  const db = getDb();
  const s = await db.suppliers.get(supplierId);
  if (s)
    await db.suppliers.update(supplierId, {
      balance_owed: Number(s.balance_owed) + delta,
    });
}
