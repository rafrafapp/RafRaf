"use server";

import { createClient } from "@/lib/supabase/server";
import { isWhatsAppConfigured, sendWhatsApp } from "./whatsapp";
import { debtReminderMessage } from "./messages";

export type ReminderResult = { ok: true } | { error: string };

// Owner-triggered debt reminder to a CUSTOMER. Customers are reached by phone, so
// this uses WhatsApp (Telegram can't message an arbitrary customer — it needs the
// customer to have started the bot). The wa.me link in the UI is the
// no-credentials manual fallback. The customer is read through the RLS-scoped
// server client, so a merchant can only message a customer that belongs to them,
// and the phone/amount come from the DB — never the client.
export async function sendDebtReminder(
  customerId: string,
): Promise<ReminderResult> {
  if (!isWhatsAppConfigured()) return { error: "not_configured" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data: c } = await supabase
    .from("customers")
    .select("name,phone,debt_balance")
    .eq("id", customerId)
    .single();
  if (!c) return { error: "not_found" };
  if (!c.phone) return { error: "no_phone" };
  if (Number(c.debt_balance) <= 0) return { error: "no_debt" };

  const { data: m } = await supabase
    .from("merchants")
    .select("store_name,default_currency")
    .eq("id", user.id)
    .single();

  const ok = await sendWhatsApp(
    c.phone,
    debtReminderMessage({
      name: c.name,
      storeName: m?.store_name ?? "RafRaf",
      amount: Number(c.debt_balance),
      currency: m?.default_currency ?? "SYP",
    }),
  );
  return ok ? { ok: true } : { error: "failed" };
}
