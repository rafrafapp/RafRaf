"use server";

import { createClient } from "@/lib/supabase/server";
import { isTelegramConfigured, sendTelegram } from "./telegram";
import { notifyMerchant } from "./dispatch";
import { debtReminderMessage, oversellMessage } from "./messages";
import { sanitizeText } from "@/lib/validation/sanitize";

export type ReminderResult = { ok: true } | { error: string };

// Alert the merchant (on their own Telegram) that a sale was completed despite
// insufficient stock. Best-effort and fire-and-forget from the client; the
// merchant + chat id come from the RLS-scoped session, never the client.
export async function notifyOversell(
  productName: string,
  available: number,
  required: number,
): Promise<{ ok: boolean }> {
  try {
    if (!isTelegramConfigured()) return { ok: false };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { data: m } = await supabase
      .from("merchants")
      .select("store_name,notify_channel,telegram_chat_id")
      .eq("id", user.id)
      .single();
    if (!m) return { ok: false };

    const ok = await notifyMerchant(m, oversellMessage({
      storeName: m.store_name ?? "RafRaf",
      productName: sanitizeText(String(productName)).slice(0, 80),
      available: Number(available) || 0,
      required: Number(required) || 0,
    }));
    return { ok };
  } catch {
    return { ok: false };
  }
}

// Owner-triggered debt reminder to a CUSTOMER, sent over Telegram. The customer
// must have linked their Telegram (the owner pastes the customer's chat id into
// the profile — they get it by sending /start to the store's bot). The customer
// is read through the RLS-scoped server client, so a merchant can only message a
// customer that belongs to them, and the chat id / amount come from the DB —
// never the client.
export async function sendDebtReminder(
  customerId: string,
): Promise<ReminderResult> {
  if (!isTelegramConfigured()) return { error: "not_configured" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data: c } = await supabase
    .from("customers")
    .select("name,telegram_chat_id,debt_balance")
    .eq("id", customerId)
    .single();
  if (!c) return { error: "not_found" };
  if (!c.telegram_chat_id) return { error: "no_telegram" };
  if (Number(c.debt_balance) <= 0) return { error: "no_debt" };

  const { data: m } = await supabase
    .from("merchants")
    .select("store_name,default_currency")
    .eq("id", user.id)
    .single();

  const ok = await sendTelegram(
    c.telegram_chat_id,
    debtReminderMessage({
      name: c.name,
      storeName: m?.store_name ?? "RafRaf",
      amount: Number(c.debt_balance),
      currency: m?.default_currency ?? "SYP",
    }),
  );
  return ok ? { ok: true } : { error: "failed" };
}
