"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  storeSetupSchema,
  notificationSettingsSchema,
} from "@/lib/validation/merchant";
import { createMerchantBackupSheet } from "@/lib/backup/sheets";
import { sendWelcomeEmail } from "@/lib/email/notify";
import { getBusinessTypeBySlug } from "@/lib/business-types/read";

export type SetupState = { error?: string };

export async function createStore(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = storeSetupSchema.safeParse({
    store_name: formData.get("store_name"),
    store_name_en: formData.get("store_name_en"),
    business_type: formData.get("business_type"),
    default_currency: formData.get("default_currency"),
    phone: formData.get("phone"),
    logo_url: formData.get("logo_url"),
  });
  if (!parsed.success) return { error: "invalid" };

  // The business type must be an active, admin-managed type (dynamic now).
  const bizType = await getBusinessTypeBySlug(parsed.data.business_type);
  if (!bizType || !bizType.active) return { error: "invalid" };

  // Insert the tenant row. id defaults to auth.uid(); RLS WITH CHECK enforces
  // that a user can only create their own row. We never trust a client id.
  const { error } = await supabase.from("merchants").insert({
    id: user.id,
    email: user.email ?? null,
    store_name: parsed.data.store_name,
    store_name_en: parsed.data.store_name_en ?? null,
    business_type: parsed.data.business_type,
    default_currency: parsed.data.default_currency,
    phone: parsed.data.phone ?? null,
    logo_url: parsed.data.logo_url ?? null,
    offers_mobile_credit: formData.get("offers_mobile_credit") === "on",
    last_active: new Date().toISOString(),
  });

  if (error) {
    // 23505 = unique_violation → the row already exists (double submit / retry).
    if (error.code === "23505") redirect("/dashboard");
    return { error: "failed" };
  }

  // Seed the SYP base currency (multi-currency). Idempotent via the unique
  // (merchant_id, code) index; best-effort so it never blocks onboarding.
  try {
    await supabase.from("merchant_currencies").insert({
      merchant_id: user.id,
      code: "SYP",
      name_ar: "ليرة سورية",
      name_en: "Syrian Pound",
      rate_to_base: 1,
      is_base: true,
      symbol: "ل.س",
    });
  } catch {
    // swallow — backfilled/retried elsewhere
  }

  // Best-effort backup-sheet provisioning. Never block onboarding on it — if it
  // fails (or Google isn't configured), the nightly cron creates the sheet on the
  // merchant's first backup run.
  try {
    const sheet = await createMerchantBackupSheet({
      id: user.id,
      email: user.email ?? null,
      storeName: parsed.data.store_name,
    });
    if (sheet) {
      await supabase
        .from("merchants")
        .update({
          google_sheet_id: sheet.sheetId,
          google_sheet_url: sheet.sheetUrl,
        })
        .eq("id", user.id);
    }
  } catch {
    // Swallow — provisioning is retried by the cron.
  }

  // Best-effort welcome email via Resend. No-op until RESEND_* is configured, never
  // throws, and never blocks onboarding. (Auth emails — confirm/reset — are sent by
  // Supabase over Resend SMTP, not here.)
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    await sendWelcomeEmail({
      to: user.email,
      storeName: parsed.data.store_name,
      appUrl: host ? `${proto}://${host}/dashboard` : undefined,
    });
  } catch {
    // swallow
  }

  redirect("/dashboard");
}

// Update the merchant's notification preferences (channel + Telegram chat id).
// RLS (merchant_update_own, id = auth.uid()) scopes the write to the caller.
export async function updateNotificationSettings(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const parsed = notificationSettingsSchema.safeParse({
    notify_channel: formData.get("notify_channel"),
    telegram_chat_id: formData.get("telegram_chat_id"),
  });
  if (!parsed.success) return { error: "invalid" };

  const { error } = await supabase
    .from("merchants")
    .update({
      notify_channel: parsed.data.notify_channel,
      telegram_chat_id: parsed.data.telegram_chat_id,
      offers_mobile_credit: formData.get("offers_mobile_credit") === "on",
    })
    .eq("id", user.id);
  if (error) return { error: "failed" };
  return { ok: true };
}
