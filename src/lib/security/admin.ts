import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/session";
import { logSecurityEvent } from "@/lib/security/events";

// The superadmin identity, derived server-side from the session + merchants.role
// (never trusted from the client). Mirrors how getMerchant derives tenant context.
export type AdminUser = { id: string; email: string | null };

// Returns the current user IFF they are a superadmin, else null. Authoritative:
// reads merchants.role under RLS (the user's own row). This is the app-level
// counterpart to is_superadmin() in the DB.
export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return null;
  const { data } = await supabase
    .from("merchants")
    .select("role,email")
    .eq("id", user.id)
    .maybeSingle<{ role: string; email: string | null }>();
  if (!data || data.role !== "superadmin") return null;
  return { id: user.id, email: data.email ?? user.email ?? null };
}

// Guard for admin pages and server actions — defense in depth on top of the
// middleware gate. Logs the denial and redirects non-superadmins away. Returns
// the verified admin (TS narrows: redirect() never returns).
export async function requireSuperadmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    await logSecurityEvent("ADMIN_ACCESS_DENIED", { message: "server_guard" });
    redirect("/dashboard");
  }
  return admin;
}

// Append a superadmin action to the audit trail (admin_logs). Service-role write
// (the table is admin-only RLS). Best-effort — never breaks the action.
export async function logAdminAction(entry: {
  action: string;
  actor: AdminUser;
  targetMerchantId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createAdminClient()
      .from("admin_logs")
      .insert({
        action: entry.action,
        actor_id: entry.actor.id,
        actor_email: entry.actor.email,
        target_merchant_id: entry.targetMerchantId ?? null,
        details: entry.details ?? {},
        ip,
      });
  } catch {
    // swallow — auditing must not break the operation it observes
  }
}
