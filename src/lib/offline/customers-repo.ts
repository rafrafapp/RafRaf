import { getDb, type LocalCustomer } from "./db";
import type { CustomerInput } from "@/lib/validation/customer";

function nowIso(): string {
  return new Date().toISOString();
}

// The fields a form actually edits. debt_balance is intentionally NOT here — it
// is server-owned (only the record_transaction RPC writes it), so an edit must
// never overwrite it. Mirrors products-repo's managedFields (stock is similar).
function managedFields(d: CustomerInput) {
  return {
    name: d.name,
    phone: d.phone ?? null,
    neighborhood: d.neighborhood ?? null,
  };
}

// Write-to-IndexedDB-first: create or update a customer locally, marked pending.
export async function saveCustomer(opts: {
  mode: "create" | "edit";
  merchantId: string;
  base?: LocalCustomer;
  data: CustomerInput;
}): Promise<string> {
  const db = getDb();
  const now = nowIso();

  if (opts.mode === "edit" && opts.base) {
    const rec: LocalCustomer = {
      ...opts.base,
      ...managedFields(opts.data),
      updated_at: now,
      _sync: "pending",
      _op: "upsert",
      _deleted: 0,
    };
    await db.customers.put(rec);
    return rec.id;
  }

  const rec: LocalCustomer = {
    id: crypto.randomUUID(),
    merchant_id: opts.merchantId,
    ...managedFields(opts.data),
    debt_balance: 0,
    created_at: now,
    updated_at: now,
    _sync: "pending",
    _op: "upsert",
    _deleted: 0,
    _base_updated_at: null,
  };
  await db.customers.put(rec);
  return rec.id;
}

// Delete a customer. Never-synced rows drop locally; otherwise leave a tombstone
// for the sync engine to apply server-side.
export async function deleteCustomerLocal(id: string): Promise<void> {
  const db = getDb();
  const rec = await db.customers.get(id);
  if (!rec) return;
  if (rec._base_updated_at == null) {
    await db.customers.delete(id);
    return;
  }
  await db.customers.update(id, {
    _op: "delete",
    _sync: "pending",
    _deleted: 1,
    updated_at: nowIso(),
  });
}

export function getLocalCustomer(id: string): Promise<LocalCustomer | null> {
  return getDb()
    .customers.get(id)
    .then((r) => r ?? null);
}

// Optimistically adjust a customer's debt locally WITHOUT marking it pending —
// the authoritative delta is owned by the record_transaction RPC, and
// pullCustomers reconciles the real balance after sync (same contract as product
// stock). Skips rows that don't exist (e.g. a "walk-in" with no customer).
export async function bumpDebt(
  customerId: string,
  delta: number,
): Promise<void> {
  const db = getDb();
  const c = await db.customers.get(customerId);
  if (c)
    await db.customers.update(customerId, {
      debt_balance: Number(c.debt_balance) + delta,
    });
}
