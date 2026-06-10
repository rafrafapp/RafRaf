import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, isOfflineError } from "@/lib/supabase/session";

// The merchant (tenant) record, plus the session identity attached to it.
// This is how "session attaches merchantId, plan, role" is realized: derived
// server-side from the authenticated user + their merchants row, never trusted
// from the client.
export type Merchant = {
  id: string;
  email: string | null;
  store_name: string;
  store_name_en: string | null;
  business_type: string | null;
  phone: string | null;
  logo_url: string | null;
  default_currency: string;
  plan: string;
  role: string;
  custom_settings: Record<string, unknown>;
  google_sheet_id: string | null;
  google_sheet_url: string | null;
  notify_channel: string | null;
  telegram_chat_id: string | null;
  last_active: string | null;
  created_at: string;
};

// The authenticated user, validated against the Supabase Auth server — but
// resilient to connectivity loss: if the Auth server is unreachable, the stored
// JWT keeps the session alive instead of bouncing the user to /login. Only a
// genuine token rejection (expired/invalid) returns null. See getSessionUser.
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  return getSessionUser(supabase);
}

// The current user's merchant row, or null if they haven't completed setup.
// RLS guarantees this can only ever return the caller's own row.
export async function getMerchant(): Promise<Merchant | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("merchants")
    .select("*")
    .maybeSingle<Merchant>();
  return data ?? null;
}

export type MerchantContext =
  | { status: "ok"; merchant: Merchant }
  | { status: "none" }
  | { status: "offline" };

// Like getMerchant, but distinguishes "no row yet → needs setup" from "couldn't
// reach the DB (offline)". Lets pages keep an offline user in the app (using the
// session-derived id, since merchants.id === auth.uid()) instead of bouncing
// them through the setup wizard on a connectivity blip.
export async function getMerchantContext(): Promise<MerchantContext> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .maybeSingle<Merchant>();
  if (data) return { status: "ok", merchant: data };
  if (error && isOfflineError(error)) return { status: "offline" };
  return { status: "none" };
}

// Best-effort heartbeat so the admin dashboard (Phase 10) can show "active today".
export async function touchLastActive(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("merchants")
    .update({ last_active: new Date().toISOString() })
    .eq("id", user.id);
}
