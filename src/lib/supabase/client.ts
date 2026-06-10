import { createBrowserClient } from "@supabase/ssr";

// Browser (client-component) Supabase client. Uses the public anon key only —
// RLS is what actually protects data here, never the key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
