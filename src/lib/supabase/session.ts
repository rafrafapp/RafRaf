import type { SupabaseClient, User } from "@supabase/supabase-js";

// Distinguish "couldn't REACH the auth server" (offline / DNS failure /
// connection refused / timeout / 5xx) from "the server REJECTED the token"
// (expired or invalid → 401/403). supabase-js surfaces network failures as an
// AuthRetryableFetchError (status 0), and PostgREST/fetch failures as a
// TypeError("fetch failed" | "Failed to fetch"); a rejected token comes back as
// an AuthApiError with an HTTP status.
export function isOfflineError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    name?: string;
    status?: number;
    code?: string;
    message?: string;
  };

  if (e.name === "AuthRetryableFetchError") return true;
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) {
    return true;
  }

  const code = (e.code ?? "").toUpperCase();
  if (
    [
      "ENOTFOUND",
      "ECONNREFUSED",
      "EAI_AGAIN",
      "ETIMEDOUT",
      "ECONNRESET",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }

  return /fetch failed|failed to fetch|networkerror|network request failed|enotfound|econnrefused|eai_again|timeout|getaddrinfo|und_err/i.test(
    e.message ?? "",
  );
}

// Resolve the authenticated user without logging people out on a connectivity
// blip. getUser() validates the JWT against the Auth server (and rotates the
// refresh token when online). If that call fails *because the server is
// unreachable*, fall back to the JWT already stored in the cookies via
// getSession() (a local, no-network read) so the session survives offline.
// A genuine rejection (expired/invalid token → 401/403) still resolves to null,
// so a real sign-out still works.
export async function getSessionUser(
  supabase: SupabaseClient,
): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (data.user) return data.user; // online and validated

  // Keep the session alive ONLY when the auth server is unreachable (offline).
  // A server *rejection* — 401/403 for an expired, revoked, or deleted-user
  // token — is NOT an offline error, so it falls through to null and the user is
  // properly signed out. This is what makes "delete the user in Supabase" log
  // them out on their next online request.
  if (error && isOfflineError(error)) {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.user ?? null;
  }

  return null;
}
