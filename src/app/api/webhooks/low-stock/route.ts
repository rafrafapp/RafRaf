import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMerchant } from "@/lib/messaging/dispatch";
import { lowStockMessage } from "@/lib/messaging/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Instant" low-stock alert. Wire a Supabase Database Webhook on UPDATE of
// public.products → this URL, with header `x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>`.
// Stock is moved by record_transaction during sync, so this fires right after a
// sale syncs. We alert only on the downward CROSSING (was above the threshold,
// now at/below) so a merchant isn't messaged on every decrement while already low.
type ProductRec = {
  merchant_id: string;
  name: string;
  stock: number | string;
  min_stock: number | string;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-webhook-secret") !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { record?: ProductRec; old_record?: ProductRec };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

  const rec = body.record;
  if (!rec) return NextResponse.json({ ok: true, skipped: "no record" });

  const min = num(rec.min_stock);
  const stock = num(rec.stock);
  const wasAbove = body.old_record ? num(body.old_record.stock) > min : true;
  const crossed = min > 0 && stock <= min && wasAbove;
  if (!crossed) return NextResponse.json({ ok: true, skipped: "no crossing" });

  const admin = createAdminClient();
  const { data: m } = await admin
    .from("merchants")
    .select("store_name,phone,notify_channel,telegram_chat_id")
    .eq("id", rec.merchant_id)
    .single();
  let alerted = false;
  if (m)
    alerted = await notifyMerchant(
      m,
      lowStockMessage({ storeName: m.store_name, productName: rec.name, stock }),
    );

  return NextResponse.json({ ok: true, alerted });
}
