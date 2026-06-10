import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logBackup } from "@/lib/backup/logs";
import { authorizeCron } from "@/lib/backup/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every 5 days (Vercel cron): a trivial DB touch so the Supabase free-tier project
// isn't paused for inactivity. Logged so the admin can see it's alive.
export async function GET(req: Request) {
  if (!authorizeCron(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { error } = await createAdminClient()
      .from("merchants")
      .select("id")
      .limit(1);
    if (error) throw error;
    await logBackup({ scope: "keepalive", triggeredBy: "cron", status: "success" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = (e as Error)?.message ?? String(e);
    await logBackup({ scope: "keepalive", triggeredBy: "cron", status: "error", error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
