"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/merchant";
import { generateApiKey } from "@/lib/api/keys";
import { READ_SCOPES, ALL_SCOPES } from "@/lib/api/auth";
import { NO_TAGS } from "@/lib/validation/sanitize";

// API-key management for the owner. Runs as the authenticated merchant via the
// SSR client, so the api_keys owner RLS policies (merchant_id = auth.uid()) enforce
// scope — no service role here. The plaintext key is returned ONCE on creation and
// never stored (only its SHA-256 hash + display prefix live in the DB).

export type ApiKeyRow = {
  id: string;
  label: string | null;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  last_used_at: string | null;
  created_at: string;
};

const KEY_COLS = "id,label,prefix,scopes,revoked,last_used_at,created_at";

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .select(KEY_COLS)
    .order("created_at", { ascending: false });
  return (data ?? []) as ApiKeyRow[];
}

export type CreateResult =
  | { ok: true; plaintext: string; key: ApiKeyRow }
  | { ok: false; error: string };

export async function createApiKey(
  labelRaw: string,
  readOnly: boolean,
): Promise<CreateResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const label = (labelRaw ?? "").trim().slice(0, 60);
  if (label && !NO_TAGS.test(label)) return { ok: false, error: "invalid_label" };

  const { full, hash, prefix } = generateApiKey();
  const scopes = readOnly ? READ_SCOPES : ALL_SCOPES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      merchant_id: user.id, // = auth.uid(); RLS WITH CHECK enforces this
      key_hash: hash,
      prefix,
      scopes,
      label: label || null,
    })
    .select(KEY_COLS)
    .single();

  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/settings");
  return { ok: true, plaintext: full, key: data as ApiKeyRow };
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  // RLS update-own + the id filter scope this to the caller's own key.
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked: true })
    .eq("id", id);
  revalidatePath("/settings");
  return { ok: !error };
}
