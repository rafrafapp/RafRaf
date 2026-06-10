import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DaySummary = {
  sales: number;
  netProfit: number;
  count: number;
  lowStockCount: number;
};

type TxRow = {
  type: string;
  product_id: string | null;
  qty: number | string;
  total: number | string;
  group_uuid: string | null;
  client_uuid: string | null;
};
type ProdRow = {
  id: string;
  cost_price: number | string;
  stock: number | string;
  min_stock: number | string;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

// Compute one merchant's summary for a UTC calendar day (YYYY-MM-DD). Net profit
// uses the product's current cost_price for COGS (same approximation as the
// in-app reports). Read cross-tenant via the service-role client.
export async function merchantDailySummary(
  merchantId: string,
  day: string,
): Promise<DaySummary> {
  const admin = createAdminClient();
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;

  const { data: txData } = await admin
    .from("transactions")
    .select("type,product_id,qty,total,group_uuid,client_uuid")
    .eq("merchant_id", merchantId)
    .gte("created_at", start)
    .lte("created_at", end);
  const txns = (txData ?? []) as TxRow[];

  const { data: prodData } = await admin
    .from("products")
    .select("id,cost_price,stock,min_stock")
    .eq("merchant_id", merchantId);
  const products = (prodData ?? []) as ProdRow[];
  const costById = new Map(products.map((p) => [p.id, num(p.cost_price)]));

  let sales = 0;
  let cogs = 0;
  let expenses = 0;
  const invoices = new Set<string>();
  for (const t of txns) {
    const total = num(t.total);
    if (t.type === "sell") {
      sales += total;
      if (t.product_id) cogs += (costById.get(t.product_id) ?? 0) * num(t.qty);
      invoices.add(t.group_uuid ?? t.client_uuid ?? "");
    } else if (t.type === "expense") expenses += total;
  }

  const lowStockCount = products.filter(
    (p) => num(p.min_stock) > 0 && num(p.stock) <= num(p.min_stock),
  ).length;

  return {
    sales,
    netProfit: sales - cogs - expenses,
    count: invoices.size,
    lowStockCount,
  };
}
