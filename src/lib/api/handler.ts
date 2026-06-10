import "server-only";
import { authenticateApiKey, type ApiScope, type ApiPrincipal } from "./auth";
import { apiRateLimit } from "@/lib/security/ratelimit";
import { apiError } from "./respond";

export type Gate =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; response: Response };

// One call at the top of every /api/v1 handler: authenticate the key →
// per-key/per-plan rate limit → scope check. Returns the principal or a ready-made
// error Response. (Used as a guard rather than a HOF wrapper so route handlers keep
// Next's native (req, ctx) signature for dynamic params.)
//
// Note: we deliberately do NOT emit a security-log event per failed request — the
// rate limiter is the abuse control, and API_KEY_ABUSE is high-severity (would spam
// the admin Telegram on every probe).
export async function apiGate(
  req: Request,
  requiredScope: ApiScope | null = null,
): Promise<Gate> {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return { ok: false, response: apiError(auth.status, auth.code, auth.message) };
  }
  const { principal } = auth;

  const rl = await apiRateLimit(principal.keyId, principal.plan);
  if (!rl.success) {
    return {
      ok: false,
      response: apiError(429, "rate_limited", "Rate limit exceeded. Slow down.", {
        "retry-after": "60",
        "x-ratelimit-limit": String(rl.limit),
        "x-ratelimit-remaining": "0",
      }),
    };
  }

  if (requiredScope && !principal.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiError(
        403,
        "forbidden_scope",
        `This API key lacks the required '${requiredScope}' scope.`,
      ),
    };
  }

  return { ok: true, principal };
}

// Wrap a handler body so an unexpected throw becomes a JSON 500 (not Next's HTML
// error page). Logs server-side for debugging.
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    console.error("[api/v1] handler error:", e);
    return apiError(500, "server_error", "Unexpected server error.");
  }
}
