import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BackupScope = "merchant" | "master" | "keepalive";

// Append a backup audit row via the service-role client (bypasses RLS). Logging
// must never throw — a failed log can't be allowed to fail the backup itself.
export async function logBackup(entry: {
  merchant_id?: string | null;
  scope: BackupScope;
  triggeredBy?: string | null;
  status: "success" | "error";
  error?: string | null;
  rows_backed?: number | null;
}): Promise<void> {
  try {
    await createAdminClient()
      .from("backup_logs")
      .insert({
        merchant_id: entry.merchant_id ?? null,
        scope: entry.scope,
        triggered_by: entry.triggeredBy ?? null,
        status: entry.status,
        error: entry.error ? entry.error.slice(0, 1000) : null,
        rows_backed: entry.rows_backed ?? null,
      });
  } catch {
    // Swallow — logging is best-effort.
  }
}
