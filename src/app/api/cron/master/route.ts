import { NextResponse } from "next/server";
import { updateMasterSheet } from "@/lib/backup/master";
import { logBackup } from "@/lib/backup/logs";
import { authorizeCron } from "@/lib/backup/cron-auth";
import { notifyAdmin } from "@/lib/messaging/dispatch";
import { backupFailureMessage } from "@/lib/messaging/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly (Vercel cron, 03:00 UTC): rebuild the admin-only master rollup sheet.
export async function GET(req: Request) {
  if (!authorizeCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await updateMasterSheet();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = (e as Error)?.message ?? String(e);
    await logBackup({ scope: "master", triggeredBy: "cron", status: "error", error });
    await notifyAdmin(backupFailureMessage({ scope: "master", count: 1 }));
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
