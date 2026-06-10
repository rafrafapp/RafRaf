import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/backup/cron-auth";
import { notifyMerchant } from "@/lib/messaging/dispatch";
import { dailySummaryMessage } from "@/lib/messaging/messages";
import { merchantDailySummary } from "@/lib/messaging/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MerchantRow = {
  id: string;
  store_name: string;
  phone: string | null;
  default_currency: string | null;
  notify_channel: string | null;
  telegram_chat_id: string | null;
};

function yesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Nightly (Vercel cron): send each merchant a short Arabic summary of yesterday
// on their preferred channel (Telegram by default, WhatsApp if chosen).
export async function GET(req: Request) {
  if (!authorizeCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("merchants")
    .select("id,store_name,phone,default_currency,notify_channel,telegram_chat_id");
  const merchants = (data ?? []) as MerchantRow[];
  const day = yesterdayKey();

  let sent = 0;
  let skipped = 0;
  for (const m of merchants) {
    if ((m.notify_channel ?? "telegram") === "off") {
      skipped++;
      continue;
    }
    try {
      const s = await merchantDailySummary(m.id, day);
      const ok = await notifyMerchant(
        m,
        dailySummaryMessage({
          storeName: m.store_name,
          day,
          sales: s.sales,
          netProfit: s.netProfit,
          count: s.count,
          currency: m.default_currency ?? "SYP",
          lowStockCount: s.lowStockCount,
        }),
      );
      if (ok) sent++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return NextResponse.json({ ok: true, day, merchants: merchants.length, sent, skipped });
}
