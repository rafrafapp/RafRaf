import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey, parseBearer } from "./keys";

// API scopes. A key is created read-only or read-write; the read-write set is the
// read set plus the :write scopes.
export type ApiScope =
  | "products:read"
  | "products:write"
  | "transactions:read"
  | "transactions:write"
  | "customers:read"
  | "customers:write";

export const READ_SCOPES: ApiScope[] = [
  "products:read",
  "transactions:read",
  "customers:read",
];
export const WRITE_SCOPES: ApiScope[] = [
  "products:write",
  "transactions:write",
  "customers:write",
];
export const ALL_SCOPES: ApiScope[] = [...READ_SCOPES, ...WRITE_SCOPES];

export type ApiPrincipal = {
  merchantId: string;
  keyId: string;
  scopes: string[];
  plan: string;
};

export type AuthResult =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; status: number; code: string; message: string };

type KeyRow = {
  id: string;
  merchant_id: string;
  scopes: string[] | null;
  revoked: boolean;
  last_used_at: string | null;
  merchants: { plan: string } | null;
};

// Resolve the bearer token to a merchant principal. The token is hashed and looked
// up by the unique key_hash index (service-role read). Tenant scope is the key's
// merchant_id — never anything from the request body.
export async function authenticateApiKey(req: Request): Promise<AuthResult> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Missing or malformed 'Authorization: Bearer rafraf_…' header.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,merchant_id,scopes,revoked,last_used_at,merchants(plan)")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle<KeyRow>();

  if (error || !data) {
    return {
      ok: false,
      status: 401,
      code: "invalid_key",
      message: "Invalid API key.",
    };
  }
  if (data.revoked) {
    return {
      ok: false,
      status: 403,
      code: "revoked_key",
      message: "This API key has been revoked.",
    };
  }

  // Best-effort, throttled last_used_at bump (skip if touched in the last minute).
  const stale =
    !data.last_used_at ||
    Date.now() - new Date(data.last_used_at).getTime() > 60_000;
  if (stale) {
    void admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});
  }

  return {
    ok: true,
    principal: {
      merchantId: data.merchant_id,
      keyId: data.id,
      scopes: data.scopes ?? [],
      plan: data.merchants?.plan ?? "free",
    },
  };
}
