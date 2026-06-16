import { NextResponse } from "next/server";
import { backupAllMerchants } from "@/lib/backup/sheets";
import { authorizeCron } from "@/lib/backup/cron-auth";
import { notifyAdmin } from "@/lib/messaging/dispatch";
import { backupDailySummaryMessage } from "@/lib/messaging/messages";

// googleapis needs the Node runtime (not edge); never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly (Vercel cron, 02:00 UTC): snapshot every merchant's products + ledger,
// append the daily summary, refresh alerts. Per-merchant failures are logged and
// skipped inside backupAllMerchants.
export async function GET(req: Request) {
  if (!authorizeCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await backupAllMerchants("cron");
    // Always send the daily digest to the admin (success count + per-merchant
    // failures); best-effort, no-op when no admin chat id is set.
    await notifyAdmin(backupDailySummaryMessage(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? String(e) },
      { status: 500 },
    );
  }
}
