import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTabs, writeTab, type Row } from "./google";
import { logBackup } from "./logs";

const MASTER_TABS = [
  "Overview",
  "All Merchants",
  "All Products",
  "All Transactions",
  "Failed Backups",
  "Revenue Tracker",
];

type MerchantRow = {
  id: string;
  store_name: string;
  plan: string | null;
  role: string | null;
  default_currency: string | null;
  google_sheet_url: string | null;
  last_active: string | null;
  created_at: string;
};
type ProductRow = {
  merchant_id: string;
  name: string;
  category: string | null;
  cost_price: number | string;
  sell_price: number | string;
  stock: number | string;
};
type TxRow = {
  merchant_id: string;
  created_at: string;
  type: string;
  product_name: string | null;
  qty: number | string;
  total: number | string;
  payment: string;
};
type FailRow = {
  created_at: string;
  merchant_id: string | null;
  scope: string;
  error: string | null;
};

const n = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

// Rebuild the admin-only master sheet (owned by the service account, shared with
// no one): a cross-tenant rollup. Overwrites each tab, so it's idempotent.
export async function updateMasterSheet(): Promise<{ merchants: number }> {
  const masterId = process.env.RAFRAF_MASTER_SHEET_ID;
  if (!masterId) {
    throw new Error(
      "RAFRAF_MASTER_SHEET_ID is not set — create the master sheet first.",
    );
  }
  const admin = createAdminClient();
  await ensureTabs(masterId, MASTER_TABS);

  const { data: mData } = await admin
    .from("merchants")
    .select(
      "id,store_name,plan,role,default_currency,google_sheet_url,last_active,created_at",
    )
    .order("created_at");
  const merchants = (mData ?? []) as MerchantRow[];
  const nameById = new Map(merchants.map((m) => [m.id, m.store_name]));

  const { data: pData } = await admin
    .from("products")
    .select("merchant_id,name,category,cost_price,sell_price,stock")
    .limit(20000);
  const products = (pData ?? []) as ProductRow[];

  const { data: tData } = await admin
    .from("transactions")
    .select("merchant_id,created_at,type,product_name,qty,total,payment")
    .order("created_at", { ascending: false })
    .limit(20000);
  const txns = (tData ?? []) as TxRow[];

  const { data: fData } = await admin
    .from("backup_logs")
    .select("created_at,merchant_id,scope,error")
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(500);
  const fails = (fData ?? []) as FailRow[];

  // ---- Overview ----
  let totalSales = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;
  const revByMerchant = new Map<string, number>();
  for (const t of txns) {
    const total = n(t.total);
    if (t.type === "sell") {
      totalSales += total;
      revByMerchant.set(t.merchant_id, (revByMerchant.get(t.merchant_id) ?? 0) + total);
    } else if (t.type === "buy") totalPurchases += total;
    else if (t.type === "expense") totalExpenses += total;
  }
  const overview: Row[] = [
    ["Merchants", merchants.length],
    ["Products", products.length],
    ["Transactions", txns.length],
    ["Total sales", totalSales],
    ["Total purchases", totalPurchases],
    ["Total expenses", totalExpenses],
    ["Generated at", new Date().toISOString()],
  ];
  await writeTab(masterId, "Overview", ["Metric", "Value"], overview);

  // ---- All Merchants ----
  await writeTab(
    masterId,
    "All Merchants",
    ["Store", "Plan", "Role", "Currency", "Sheet", "Last active", "Created"],
    merchants.map((m) => [
      m.store_name,
      m.plan ?? "",
      m.role ?? "",
      m.default_currency ?? "",
      m.google_sheet_url ?? "",
      m.last_active ?? "",
      m.created_at,
    ]),
  );

  // ---- All Products ----
  await writeTab(
    masterId,
    "All Products",
    ["Store", "Product", "Category", "Cost", "Sell", "Stock"],
    products.map((p) => [
      nameById.get(p.merchant_id) ?? p.merchant_id,
      p.name,
      p.category ?? "",
      n(p.cost_price),
      n(p.sell_price),
      n(p.stock),
    ]),
  );

  // ---- All Transactions ----
  await writeTab(
    masterId,
    "All Transactions",
    ["Date", "Store", "Type", "Product", "Qty", "Total", "Payment"],
    txns.map((t) => [
      t.created_at,
      nameById.get(t.merchant_id) ?? t.merchant_id,
      t.type,
      t.product_name ?? "",
      n(t.qty),
      n(t.total),
      t.payment ?? "",
    ]),
  );

  // ---- Failed Backups ----
  await writeTab(
    masterId,
    "Failed Backups",
    ["Date", "Store", "Scope", "Error"],
    fails.map((f) => [
      f.created_at,
      f.merchant_id ? (nameById.get(f.merchant_id) ?? f.merchant_id) : "",
      f.scope,
      f.error ?? "",
    ]),
  );

  // ---- Revenue Tracker ----
  const revRows: Row[] = [...revByMerchant.entries()]
    .map(([id, rev]) => [nameById.get(id) ?? id, rev] as Row)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  await writeTab(masterId, "Revenue Tracker", ["Store", "Sales"], revRows);

  await logBackup({
    scope: "master",
    triggeredBy: "cron",
    status: "success",
    rows_backed: merchants.length,
  });
  return { merchants: merchants.length };
}
