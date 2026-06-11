"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminPath } from "@/lib/security/admin-path";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin, logAdminAction } from "@/lib/security/admin";
import { sanitizeString } from "@/lib/validation/sanitize-html";
import { backupMerchant, backupAllMerchants } from "@/lib/backup/sheets";
import { updateMasterSheet } from "@/lib/backup/master";
import { notifyMerchant } from "@/lib/messaging/dispatch";

// Every action re-verifies superadmin server-side (the route gate is not trusted
// alone) and writes an admin_logs audit entry. Cross-tenant writes go through the
// service-role client.

export type ActionResult = { ok: boolean; error?: string; message?: string };

const PLANS = ["free", "basic", "smart"] as const;
const IMPERSONATE_COOKIE = "rafraf_impersonate";

export async function changePlan(
  merchantId: string,
  plan: string,
): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  if (!(PLANS as readonly string[]).includes(plan)) {
    return { ok: false, error: "invalid_plan" };
  }
  const { error } = await createAdminClient()
    .from("merchants")
    .update({ plan })
    .eq("id", merchantId);
  if (error) return { ok: false, error: "failed" };

  await logAdminAction({
    action: "plan_change",
    actor: admin,
    targetMerchantId: merchantId,
    details: { plan },
  });
  const list = adminPath("/merchants");
  const detail = adminPath(`/merchants/${merchantId}`);
  if (list) revalidatePath(list);
  if (detail) revalidatePath(detail);
  return { ok: true };
}

export async function updateBilling(
  merchantId: string,
  markPaid: boolean,
  notesRaw: string,
): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  const notes = sanitizeString(notesRaw).slice(0, 1000);
  const patch: Record<string, unknown> = { billing_notes: notes || null };
  if (markPaid) patch.last_paid_at = new Date().toISOString();

  const { error } = await createAdminClient()
    .from("merchants")
    .update(patch)
    .eq("id", merchantId);
  if (error) return { ok: false, error: "failed" };

  await logAdminAction({
    action: markPaid ? "billing_mark_paid" : "billing_update",
    actor: admin,
    targetMerchantId: merchantId,
    details: { markPaid },
  });
  const detail = adminPath(`/merchants/${merchantId}`);
  const list = adminPath("/merchants");
  if (detail) revalidatePath(detail);
  if (list) revalidatePath(list);
  return { ok: true };
}

// Impersonation is READ-ONLY (admin-side "view as"): it sets a flag cookie + logs
// start/stop and surfaces a banner on the merchant detail page. It never mints
// the merchant's session, so no destructive action can run under their identity.
export async function startImpersonation(merchantId: string): Promise<void> {
  const admin = await requireSuperadmin();
  const c = await cookies();
  c.set(IMPERSONATE_COOKIE, merchantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60, // 1h, self-expiring
  });
  await logAdminAction({
    action: "impersonation_start",
    actor: admin,
    targetMerchantId: merchantId,
  });
  redirect(adminPath(`/merchants/${merchantId}`) ?? "/dashboard");
}

export async function stopImpersonation(): Promise<void> {
  const admin = await requireSuperadmin();
  const c = await cookies();
  const merchantId = c.get(IMPERSONATE_COOKIE)?.value ?? null;
  c.delete(IMPERSONATE_COOKIE);
  await logAdminAction({
    action: "impersonation_stop",
    actor: admin,
    targetMerchantId: merchantId,
  });
  redirect(adminPath("/merchants") ?? "/dashboard");
}

export async function runMerchantBackup(
  merchantId: string,
): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  const { data } = await createAdminClient()
    .from("merchants")
    .select("id,email,store_name,google_sheet_id,default_currency")
    .eq("id", merchantId)
    .maybeSingle();
  if (!data) return { ok: false, error: "not_found" };

  try {
    const rows = await backupMerchant(data, admin.email ?? "admin");
    await logAdminAction({
      action: "backup_run",
      actor: admin,
      targetMerchantId: merchantId,
      details: { rows },
    });
    const bk = adminPath("/backups");
    if (bk) revalidatePath(bk);
    return { ok: true, message: String(rows) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
}

export async function runAllBackups(): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  try {
    const res = await backupAllMerchants(admin.email ?? "admin");
    await logAdminAction({ action: "backup_run_all", actor: admin, details: res });
    const bk = adminPath("/backups");
    if (bk) revalidatePath(bk);
    return { ok: true, message: `${res.succeeded}/${res.merchants}` };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
}

export async function runMasterUpdate(): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  try {
    const res = await updateMasterSheet();
    await logAdminAction({
      action: "master_update",
      actor: admin,
      details: res,
    });
    const bk = adminPath("/backups");
    if (bk) revalidatePath(bk);
    return { ok: true, message: String(res.merchants) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
}

export async function broadcast(
  messageRaw: string,
  channel: "all" | "telegram",
): Promise<ActionResult> {
  const admin = await requireSuperadmin();
  const message = sanitizeString(messageRaw).slice(0, 1000);
  if (!message) return { ok: false, error: "empty" };

  const { data } = await createAdminClient()
    .from("merchants")
    .select("notify_channel,telegram_chat_id");
  const merchants = data ?? [];

  let sent = 0;
  for (const m of merchants) {
    const ch = (m.notify_channel ?? "telegram") as string;
    if (channel !== "all" && ch !== channel) continue;
    try {
      if (await notifyMerchant(m, message)) sent++;
    } catch {
      // skip a single failed recipient
    }
  }

  await logAdminAction({
    action: "announcement",
    actor: admin,
    details: { channel, sent, total: merchants.length },
  });
  return { ok: true, message: `${sent}/${merchants.length}` };
}
