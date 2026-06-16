import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MerchantBackupStatus = {
  status: "success" | "error" | null;
  at: string | null;
  error: string | null;
};

// Latest per-merchant backup result, read from the admin-only `backup_logs` table
// via the service-role client. The query is PINNED to the given merchant id, so it
// is safe to call from the merchant's own Settings page (the caller derives the id
// from the session) as well as from the admin pages.
export async function getMerchantBackupStatus(
  merchantId: string,
): Promise<MerchantBackupStatus> {
  const { data } = await createAdminClient()
    .from("backup_logs")
    .select("status,error,created_at")
    .eq("merchant_id", merchantId)
    .eq("scope", "merchant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ status: string; error: string | null; created_at: string }>();
  if (!data) return { status: null, at: null, error: null };
  return {
    status: (data.status === "success" || data.status === "error"
      ? data.status
      : null) as MerchantBackupStatus["status"],
    at: data.created_at,
    error: data.error,
  };
}
