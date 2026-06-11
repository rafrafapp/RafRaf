"use server";

import { createClient } from "@/lib/supabase/server";
import { isTelegramConfigured, sendTelegram } from "./telegram";
import { debtReminderMessage } from "./messages";

export type ReminderResult = { ok: true } | { error: string };

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
