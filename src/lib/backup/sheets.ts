import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSheets,
  getDrive,
  ensureTabs,
  writeTab,
  appendRows,
  readColumn,
  isBackupConfigured,
  type Row,
} from "./google";
import { logBackup } from "./logs";

// Per-merchant backup sheet tabs (Arabic, per the product spec).
const TAB_PRODUCTS = "المنتجات";
const TAB_TX = "المعاملات";
const TAB_SUMMARY = "ملخص يومي";
const TAB_ALERTS = "تنبيهات";
const MERCHANT_TABS = [TAB_PRODUCTS, TAB_TX, TAB_SUMMARY, TAB_ALERTS];

const SUMMARY_HEADER: Row = [
  "التاريخ",
  "المبيعات",
  "المشتريات",
  "المصاريف",
  "صافي الربح",
  "عدد المعاملات",
];

type MerchantLite = { id: string; email: string | null; storeName: string };
type MerchantRow = {
  id: string;
  email: string | null;
  store_name: string;
  google_sheet_id: string | null;
  default_currency: string | null;
};
type ProductRow = {
  id: string;
  name: string;
  name_en: string | null;
  barcode: string | null;
  category: string | null;
  cost_price: number | string;
  sell_price: number | string;
  stock: number | string;
  min_stock: number | string;
  unit: string | null;
  updated_at: string;
};
type TxRow = {
  created_at: string;
  type: string;
  product_id: string | null;
  product_name: string | null;
  qty: number | string;
  price: number | string;
  total: number | string;
  paid: number | string;
  discount: number | string;
  payment: string;
  group_uuid: string | null;
  client_uuid: string | null;
  note: string | null;
};
type CustomerRow = { id: string; name: string; debt_balance: number | string };

const n = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

// UTC YYYY-MM-DD for a timestamp / for "yesterday" (the day a 2am cron summarizes).
function dayKeyOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Create a per-merchant spreadsheet with the four tabs and share it view-only
// with the merchant (when we know their email). Returns the id + url to persist.
export async function createMerchantBackupSheet(
  m: MerchantLite,
): Promise<{ sheetId: string; sheetUrl: string } | null> {
  if (!isBackupConfigured()) return null;
  // Consumer service accounts have no Drive storage and CANNOT create files in
  // "My Drive" (403). They can, however, create inside a Shared Drive (storage
  // billed to the org). If RAFRAF_SHARED_DRIVE_ID is set we use that; otherwise
  // we attempt a normal create and degrade gracefully (returning null) when the
  // SA lacks storage — the master sheet still captures this merchant's data.
  const sharedDriveId = process.env.RAFRAF_SHARED_DRIVE_ID?.trim();
  try {
    let sheetId: string;
    let sheetUrl: string;
    if (sharedDriveId) {
      const file = await getDrive().files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `RafRaf — ${m.storeName}`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          parents: [sharedDriveId],
        },
        fields: "id,webViewLink",
      });
      sheetId = file.data.id as string;
      sheetUrl =
        file.data.webViewLink ??
        `https://docs.google.com/spreadsheets/d/${sheetId}`;
      await ensureTabs(sheetId, MERCHANT_TABS);
    } else {
      const created = await getSheets().spreadsheets.create({
        requestBody: {
          properties: { title: `RafRaf — ${m.storeName}` },
          sheets: MERCHANT_TABS.map((title) => ({ properties: { title } })),
        },
        fields: "spreadsheetId,spreadsheetUrl",
      });
      sheetId = created.data.spreadsheetId as string;
      sheetUrl =
        created.data.spreadsheetUrl ??
        `https://docs.google.com/spreadsheets/d/${sheetId}`;
    }

    if (m.email) {
      try {
        await getDrive().permissions.create({
          fileId: sheetId,
          supportsAllDrives: true,
          sendNotificationEmail: false,
          requestBody: { role: "reader", type: "user", emailAddress: m.email },
        });
      } catch {
        // Sharing failure (e.g. invalid email) must not abort provisioning.
      }
    }
    return { sheetId, sheetUrl };
  } catch {
    return null;
  }
}

function summarizeDay(
  txns: TxRow[],
  costById: Map<string, number>,
  day: string,
) {
  let sales = 0;
  let purchases = 0;
  let expenses = 0;
  let cogs = 0;
  const invoices = new Set<string>();
  for (const t of txns) {
    if (dayKeyOf(t.created_at) !== day) continue;
    const total = n(t.total);
    if (t.type === "sell") {
      sales += total;
      if (t.product_id) cogs += (costById.get(t.product_id) ?? 0) * n(t.qty);
      invoices.add(t.group_uuid ?? t.client_uuid ?? t.created_at);
    } else if (t.type === "buy") purchases += total;
    else if (t.type === "expense") expenses += total;
  }
  return {
    sales,
    purchases,
    expenses,
    netProfit: sales - cogs - expenses,
    count: invoices.size,
  };
}

// Back up one merchant into their sheet: snapshot products + ledger (overwrite,
// so re-runs never duplicate), append yesterday's daily summary (once per date),
// and refresh the alerts tab. Creates the sheet on first run. Throws on failure
// so the caller can log it.
export async function backupMerchant(
  merchant: MerchantRow,
  triggeredBy: string,
): Promise<number> {
  console.log(
    `[backup] Starting backup for merchant: ${merchant.id} (${merchant.store_name})`,
  );
  const admin = createAdminClient();

  let sheetId = merchant.google_sheet_id;
  console.log(`[backup] Sheet ID: ${sheetId ?? "(none — will attempt to create)"}`);
  if (!sheetId) {
    const made = await createMerchantBackupSheet({
      id: merchant.id,
      email: merchant.email,
      storeName: merchant.store_name,
    });
    if (!made) {
      console.error(
        `[backup] Sheet unavailable for merchant ${merchant.id} — service account has no Drive storage (set RAFRAF_SHARED_DRIVE_ID, link a sheet in admin, or rely on the master sheet)`,
      );
      throw new Error(
        "per-merchant sheet unavailable (service account has no Drive storage — set RAFRAF_SHARED_DRIVE_ID, or rely on the master sheet)",
      );
    }
    sheetId = made.sheetId;
    console.log(`[backup] Created sheet ${sheetId} for merchant ${merchant.id}`);
    await admin
      .from("merchants")
      .update({ google_sheet_id: made.sheetId, google_sheet_url: made.sheetUrl })
      .eq("id", merchant.id);
  }
  try {
    await ensureTabs(sheetId, MERCHANT_TABS);
    console.log(`[backup] Auth successful — tabs ensured for ${merchant.id}`);
  } catch (e) {
    console.error(
      `[backup] Auth/tabs failed for ${merchant.id}:`,
      (e as Error)?.message ?? e,
    );
    throw e;
  }

  const currency = merchant.default_currency ?? "SYP";

  const { data: prodData } = await admin
    .from("products")
    .select(
      "id,name,name_en,barcode,category,cost_price,sell_price,stock,min_stock,unit,updated_at",
    )
    .eq("merchant_id", merchant.id)
    .order("name");
  const products = (prodData ?? []) as ProductRow[];
  const costById = new Map(products.map((p) => [p.id, n(p.cost_price)]));

  console.log(
    `[backup] Writing products (${products.length}) for ${merchant.id}...`,
  );
  const productRows: Row[] = products.map((p) => [
    p.name,
    p.name_en ?? "",
    p.barcode ?? "",
    p.category ?? "",
    n(p.cost_price),
    n(p.sell_price),
    n(p.stock),
    n(p.min_stock),
    p.unit ?? "",
    p.updated_at ?? "",
  ]);
  await writeTab(
    sheetId,
    TAB_PRODUCTS,
    ["الاسم", "English", "الباركود", "الفئة", "التكلفة", "البيع", "المخزون", "حد التنبيه", "الوحدة", "آخر تحديث"],
    productRows,
  );

  const { data: txData } = await admin
    .from("transactions")
    .select(
      "created_at,type,product_id,product_name,qty,price,total,paid,discount,payment,group_uuid,client_uuid,note",
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(10000);
  const txns = (txData ?? []) as TxRow[];

  console.log(
    `[backup] Writing transactions (${txns.length}) for ${merchant.id}...`,
  );
  const txRows: Row[] = txns.map((t) => [
    t.created_at,
    t.type,
    t.product_name ?? "",
    n(t.qty),
    n(t.price),
    n(t.total),
    n(t.paid),
    n(t.discount),
    t.payment ?? "",
    t.note ?? "",
  ]);
  await writeTab(
    sheetId,
    TAB_TX,
    ["التاريخ", "النوع", "المنتج", "الكمية", "السعر", "الإجمالي", "المدفوع", "الخصم", "الدفع", "ملاحظة"],
    txRows,
  );

  // Daily summary: keep a growing one-row-per-day log; add yesterday once.
  const day = yesterdayKey();
  const existingDates = await readColumn(sheetId, TAB_SUMMARY, "A");
  if (existingDates.length === 0)
    await appendRows(sheetId, TAB_SUMMARY, [SUMMARY_HEADER]);
  if (!existingDates.includes(day)) {
    const sum = summarizeDay(txns, costById, day);
    await appendRows(sheetId, TAB_SUMMARY, [
      [day, sum.sales, sum.purchases, sum.expenses, sum.netProfit, sum.count],
    ]);
  }

  // Alerts: current low-stock + customers in debt.
  const { data: custData } = await admin
    .from("customers")
    .select("id,name,debt_balance")
    .eq("merchant_id", merchant.id);
  const customers = (custData ?? []) as CustomerRow[];
  const alertRows: Row[] = [];
  for (const p of products) {
    if (n(p.min_stock) > 0 && n(p.stock) <= n(p.min_stock))
      alertRows.push(["مخزون منخفض", p.name, `${n(p.stock)} / ${n(p.min_stock)}`]);
  }
  for (const c of customers) {
    if (n(c.debt_balance) > 0)
      alertRows.push(["دين مستحق", c.name, `${n(c.debt_balance)} ${currency}`]);
  }
  await writeTab(sheetId, TAB_ALERTS, ["النوع", "الاسم", "التفاصيل"], alertRows);

  const rowsBacked = productRows.length + txRows.length;
  await logBackup({
    merchant_id: merchant.id,
    scope: "merchant",
    triggeredBy,
    status: "success",
    rows_backed: rowsBacked,
  });
  console.log(`[backup] Done for merchant ${merchant.id}: ${rowsBacked} rows`);
  return rowsBacked;
}

// Back up every merchant. A merchant with no linked sheet is SKIPPED (not failed)
// when we also can't auto-create one — a consumer service account has 0 Drive
// storage, so nothing can be created there. One merchant's failure is logged and
// skipped so it can't block the rest of the run.
export async function backupAllMerchants(triggeredBy: string): Promise<{
  merchants: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  failures: { store: string; error: string }[];
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("merchants")
    .select("id,email,store_name,google_sheet_id,default_currency");
  const merchants = (data ?? []) as MerchantRow[];
  // Auto-creation only works inside a Shared Drive; otherwise an unlinked merchant
  // has nowhere to back up to.
  const canCreate = Boolean(process.env.RAFRAF_SHARED_DRIVE_ID?.trim());

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { store: string; error: string }[] = [];
  for (const m of merchants) {
    if (!m.google_sheet_id && !canCreate) {
      skipped++;
      continue;
    }
    try {
      await backupMerchant(m, triggeredBy);
      succeeded++;
    } catch (e) {
      failed++;
      const error = (e as Error)?.message ?? String(e);
      failures.push({ store: m.store_name, error });
      await logBackup({
        merchant_id: m.id,
        scope: "merchant",
        triggeredBy,
        status: "error",
        error,
      });
    }
  }
  return {
    merchants: merchants.length,
    attempted: succeeded + failed,
    succeeded,
    failed,
    skipped,
    failures,
  };
}
