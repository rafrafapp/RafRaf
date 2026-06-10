import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./session";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the Supabase auth session on every request, forwards the rotated
// auth cookies to both the browser and downstream server components, and
// returns the authenticated user so the middleware can apply route gating.
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
): Promise<{ response: NextResponse; user: User | null }> {
  // Forward headers built from the CURRENT request each time, plus any extras
  // (the per-request CSP nonce). Rebuilding on each call means a cookie refresh
  // AND the nonce both reach the downstream render.
  const forward = () => {
    const h = new Headers(request.headers);
    for (const [k, v] of Object.entries(extraRequestHeaders)) h.set(k, v);
    return h;
  };
  let response = NextResponse.next({ request: { headers: forward() } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request: { headers: forward() } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Validates the token with the Auth server and triggers refresh-token rotation
  // when online. Crucially, if the Auth server is *unreachable* (offline), this
  // keeps the user signed in via the stored JWT instead of forcing a logout —
  // only an actual token rejection (401/403) clears the session. (Note: on a
  // network failure the Supabase client never calls setAll, so the existing auth
  // cookies pass through untouched.)
  const user = await getSessionUser(supabase);

  return { response, user };
}

// Read the caller's merchant role (Edge-safe) for the /rafraf-admin gate. Builds
// a read-only client bound to the request's (already-refreshed) auth cookies, so
// RLS lets the user read their own merchants row. Returns null when unknown.
export async function readMerchantRole(
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* read-only: cookies were already rotated by updateSession */
        },
      },
    },
  );
  try {
    const { data } = await supabase
      .from("merchants")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string }>();
    return data?.role ?? null;
  } catch {
    return null;
  }
}
