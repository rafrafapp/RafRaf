"use server";

import { randomUUID } from "node:crypto";
import { getUser } from "@/lib/auth/merchant";
import { createClient } from "@/lib/supabase/server";
import { invalidateCache, cacheKeys } from "@/lib/cache/redis";
import { signUpload, destroyImage, type SignedUpload } from "./server";

// Auth-checked Cloudinary actions. The merchant id (= auth.uid()) scopes every
// asset to `rafraf/<merchantId>/…`, so a signature/delete can't touch another
// tenant's images.

export async function createUploadSignature(
  kind: "product" | "logo",
): Promise<SignedUpload | null> {
  const user = await getUser();
  if (!user) return null;
  const folder = kind === "logo" ? "logos" : "products";
  const publicId = `rafraf/${user.id}/${folder}/${kind}_${randomUUID()}`;
  return signUpload(publicId); // null when Cloudinary isn't configured
}

export async function deleteImage(
  publicId: string,
): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user) return { ok: false };
  // Scope guard: only the caller's own folder.
  if (!publicId.startsWith(`rafraf/${user.id}/`)) return { ok: false };
  await destroyImage(publicId);
  return { ok: true };
}

export async function updateStoreLogo(
  logoUrl: string | null,
  logoPublicId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (logoPublicId && !logoPublicId.startsWith(`rafraf/${user.id}/`)) {
    return { ok: false, error: "invalid" };
  }
  if (logoUrl && !/^https:\/\/res\.cloudinary\.com\//.test(logoUrl)) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("merchants")
    .select("logo_public_id")
    .eq("id", user.id)
    .maybeSingle<{ logo_public_id: string | null }>();
  const old = cur?.logo_public_id ?? null;

  const { error } = await supabase
    .from("merchants")
    .update({ logo_url: logoUrl, logo_public_id: logoPublicId })
    .eq("id", user.id);
  if (error) return { ok: false, error: "failed" };
  await invalidateCache(cacheKeys.merchant(user.id));

  if (old && old !== logoPublicId) await destroyImage(old);
  return { ok: true };
}
