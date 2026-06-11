import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBackupConfigured } from "@/lib/backup/google";
import { isTelegramConfigured } from "@/lib/messaging/telegram";
import { parseAllowedIps } from "@/lib/security/admin-ip";

// Cross-tenant reads for the admin dashboard. These use the SERVICE-ROLE client
// (bypasses RLS) and must ONLY be called from admin routes that have already
// passed requireSuperadmin()/the middleware gate. They are server-only, so they
// can never be reached from the browser.

export type AdminMerchant = {
  id: string;
  store_name: string;
  store_name_en: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  role: string;
  default_currency: string;
  business_type: string | null;
  last_active: string | null;
  created_at: string;
  billing_notes: string | null;
  last_paid_at: string | null;
};

export type OverviewMetrics = {
  merchants: number;
  activeToday: number;
  active7d: number;
  products: number;
  transactions: number;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  outstandingDebt: number;
  owedToSuppliers: number;
  recent: AdminMerchant[];
};

const num = (v: unknown): number => Number(v ?? 0) || 0;

const MERCHANT_COLS =
  "id,store_name,store_name_en,email,phone,plan,role,default_currency,business_type,last_active,created_at,billing_notes,last_paid_at";

export async function listMerchants(): Promise<AdminMerchant[]> {
  const { data } = await createAdminClient()
    .from("merchants")
    .select(MERCHANT_COLS)
    .order("created_at", { ascending: false });
  return (data ?? []) as AdminMerchant[];
}

export async function getMerchant(id: string): Promise<AdminMerchant | null> {
  const { data } = await createAdminClient()
    .from("merchants")
    .select(MERCHANT_COLS)
    .eq("id", id)
    .maybeSingle();
  return (data as AdminMerchant) ?? null;
}

export async function getOverview(): Promise<OverviewMetrics> {
  const admin = createAdminClient();

  const merchants = await listMerchants();
  const now = Date.now();
  const startToday = new Date();
  startToday.setUTCHours(0, 0, 0, 0);
  const activeToday = merchants.filter(
    (m) => m.last_active && new Date(m.last_active) >= startToday,
  ).length;
  const active7d = merchants.filter(
    (m) =>
      m.last_active &&
      now - new Date(m.last_active).getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;

  const [{ count: products }, { count: transactions }, txAgg, custAgg, supAgg] =
    await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }),
      admin.from("transactions").select("id", { count: "exact", head: true }),
      admin.from("transactions").select("type,total").limit(100000),
      admin.from("customers").select("debt_balance").limit(100000),
      admin.from("suppliers").select("balance_owed").limit(100000),
    ]);

  let totalSales = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;
  for (const t of (txAgg.data ?? []) as { type: string; total: unknown }[]) {
    if (t.type === "sell") totalSales += num(t.total);
    else if (t.type === "buy") totalPurchases += num(t.total);
    else if (t.type === "expense") totalExpenses += num(t.total);
  }
  const outstandingDebt = ((custAgg.data ?? []) as { debt_balance: unknown }[])
    .map((c) => num(c.debt_balance))
    .reduce((s, v) => s + Math.max(0, v), 0);
  const owedToSuppliers = ((supAgg.data ?? []) as { balance_owed: unknown }[])
    .map((s) => num(s.balance_owed))
    .reduce((s, v) => s + Math.max(0, v), 0);

  return {
    merchants: merchants.length,
    activeToday,
    active7d,
    products: products ?? 0,
    transactions: transactions ?? 0,
    totalSales,
    totalPurchases,
    totalExpenses,
    outstandingDebt,
    owedToSuppliers,
    recent: merchants.slice(0, 8),
  };
}

export type MerchantDetail = {
  merchant: AdminMerchant;
  products: number;
  transactions: number;
  customers: number;
  suppliers: number;
  outstandingDebt: number;
  recentTx: {
    id: string;
    type: string;
    product_name: string | null;
    total: number;
    created_at: string;
  }[];
};

export async function getMerchantDetail(
  id: string,
): Promise<MerchantDetail | null> {
  const merchant = await getMerchant(id);
  if (!merchant) return null;
  const admin = createAdminClient();

  const [pc, tc, cc, sc, debt, recent] = await Promise.all([
    admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", id),
    admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", id),
    admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", id),
    admin
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", id),
    admin.from("customers").select("debt_balance").eq("merchant_id", id),
    admin
      .from("transactions")
      .select("id,type,product_name,total,created_at")
      .eq("merchant_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const outstandingDebt = ((debt.data ?? []) as { debt_balance: unknown }[])
    .map((c) => num(c.debt_balance))
    .reduce((s, v) => s + Math.max(0, v), 0);

  return {
    merchant,
    products: pc.count ?? 0,
    transactions: tc.count ?? 0,
    customers: cc.count ?? 0,
    suppliers: sc.count ?? 0,
    outstandingDebt,
    recentTx: ((recent.data ?? []) as MerchantDetail["recentTx"]).map((t) => ({
      ...t,
      total: num(t.total),
    })),
  };
}

export type BackupStatus = {
  merchantId: string;
  storeName: string;
  status: string | null;
  at: string | null;
  error: string | null;
};

export async function getBackupStatuses(): Promise<{
  perMerchant: BackupStatus[];
  failures: {
    id: string;
    merchant_id: string | null;
    scope: string | null;
    status: string | null;
    error: string | null;
    created_at: string;
  }[];
}> {
  const admin = createAdminClient();
  const merchants = await listMerchants();
  const nameById = new Map(merchants.map((m) => [m.id, m.store_name]));

  const { data: logs } = await admin
    .from("backup_logs")
    .select("id,merchant_id,scope,status,error,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = logs ?? [];

  // Latest "merchant"-scope run per merchant.
  const latest = new Map<string, BackupStatus>();
  for (const l of rows as {
    merchant_id: string | null;
    scope: string | null;
    status: string | null;
    error: string | null;
    created_at: string;
  }[]) {
    if (l.scope !== "merchant" || !l.merchant_id) continue;
    if (latest.has(l.merchant_id)) continue;
    latest.set(l.merchant_id, {
      merchantId: l.merchant_id,
      storeName: nameById.get(l.merchant_id) ?? l.merchant_id,
      status: l.status,
      at: l.created_at,
      error: l.error,
    });
  }
  const perMerchant: BackupStatus[] = merchants.map(
    (m) =>
      latest.get(m.id) ?? {
        merchantId: m.id,
        storeName: m.store_name,
        status: null,
        at: null,
        error: null,
      },
  );

  const failures = (
    rows as {
      id: string;
      merchant_id: string | null;
      scope: string | null;
      status: string | null;
      error: string | null;
      created_at: string;
    }[]
  )
    .filter((l) => l.status === "error")
    .slice(0, 50);

  return { perMerchant, failures };
}

export type SecurityLog = {
  id: string;
  type: string;
  severity: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_id: string | null;
  created_at: string;
};

export async function getSecurityLogs(limit = 100): Promise<SecurityLog[]> {
  const { data } = await createAdminClient()
    .from("security_logs")
    .select("id,type,severity,details,ip,user_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SecurityLog[];
}

export type AdminLog = {
  id: string;
  action: string;
  actor_email: string | null;
  target_merchant_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

export async function getAdminLogs(limit = 100): Promise<AdminLog[]> {
  const { data } = await createAdminClient()
    .from("admin_logs")
    .select("id,action,actor_email,target_merchant_id,details,ip,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AdminLog[];
}

export type AdminBusinessType = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  custom_fields: {
    key: string;
    type: "text" | "number" | "date";
    label_ar: string;
    label_en: string;
  }[];
  active: boolean;
  sort: number;
  created_at: string;
};

export async function listBusinessTypes(): Promise<AdminBusinessType[]> {
  const { data } = await createAdminClient()
    .from("business_types")
    .select("id,slug,name_ar,name_en,custom_fields,active,sort,created_at")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as AdminBusinessType[];
}

export type SystemHealth = {
  db: boolean;
  backup: boolean;
  masterSheet: boolean;
  telegram: boolean;
  rateLimit: boolean;
  adminAllowlist: number;
  lastBackupAt: string | null;
};

export async function getSystemHealth(): Promise<SystemHealth> {
  const admin = createAdminClient();
  let db = false;
  let lastBackupAt: string | null = null;
  try {
    const { error } = await admin
      .from("merchants")
      .select("id", { count: "exact", head: true });
    db = !error;
  } catch {
    db = false;
  }
  try {
    const { data } = await admin
      .from("backup_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();
    lastBackupAt = data?.created_at ?? null;
  } catch {
    lastBackupAt = null;
  }

  return {
    db,
    backup: isBackupConfigured(),
    masterSheet: !!process.env.RAFRAF_MASTER_SHEET_ID,
    telegram: isTelegramConfigured(),
    rateLimit: !!process.env.UPSTASH_REDIS_REST_URL,
    adminAllowlist: parseAllowedIps(process.env.ADMIN_ALLOWED_IPS).length,
    lastBackupAt,
  };
}
