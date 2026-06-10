import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role admin client. BYPASSES Row Level Security — use ONLY in trusted
// server contexts (cron backups, admin actions, security logging). It must
// never be imported into a client component or shipped to the browser.
//
// The `server-only` import above makes any accidental client import a build
// error, and the key is read from a non-public env var so it can never leak
// into the bundle.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server-only).",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
