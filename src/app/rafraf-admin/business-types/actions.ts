"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/lib/security/admin-path";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin, logAdminAction } from "@/lib/security/admin";
import { businessTypeSchema } from "@/lib/validation/business-type";

// Superadmin-only business-type management. Each action re-verifies superadmin and
// writes an admin_logs entry. Writes use the service-role client (business_types
// has no write RLS policy).

export type BtResult = { ok: boolean; error?: string };

export async function saveBusinessType(input: unknown): Promise<BtResult> {
  const admin = await requireSuperadmin();
  const parsed = businessTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const db = createAdminClient();

  if (d.id) {
    // Edit: update everything EXCEPT the slug (the merchant key stays stable, so a
    // type already chosen by merchants is never orphaned).
    const { error } = await db
      .from("business_types")
      .update({
        name_ar: d.name_ar,
        name_en: d.name_en,
        custom_fields: d.custom_fields,
        active: d.active,
        sort: d.sort,
      })
      .eq("id", d.id);
    if (error) return { ok: false, error: "failed" };
    await logAdminAction({
      action: "business_type_update",
      actor: admin,
      details: { slug: d.slug },
    });
  } else {
    const { error } = await db.from("business_types").insert({
      slug: d.slug,
      name_ar: d.name_ar,
      name_en: d.name_en,
      custom_fields: d.custom_fields,
      active: d.active,
      sort: d.sort,
    });
    if (error) {
      return { ok: false, error: error.code === "23505" ? "slug_exists" : "failed" };
    }
    await logAdminAction({
      action: "business_type_create",
      actor: admin,
      details: { slug: d.slug },
    });
  }

  const bt = adminPath("/business-types");
  if (bt) revalidatePath(bt);
  revalidatePath("/setup");
  return { ok: true };
}

export async function toggleBusinessType(
  id: string,
  active: boolean,
): Promise<BtResult> {
  const admin = await requireSuperadmin();
  const { error } = await createAdminClient()
    .from("business_types")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: "failed" };
  await logAdminAction({
    action: "business_type_toggle",
    actor: admin,
    details: { id, active },
  });
  const bt = adminPath("/business-types");
  if (bt) revalidatePath(bt);
  revalidatePath("/setup");
  return { ok: true };
}

export async function deleteBusinessType(
  id: string,
  slug: string,
): Promise<BtResult> {
  const admin = await requireSuperadmin();
  const db = createAdminClient();
  // Refuse to hard-delete a type any merchant is using — deactivate instead.
  const { count } = await db
    .from("merchants")
    .select("id", { count: "exact", head: true })
    .eq("business_type", slug);
  if ((count ?? 0) > 0) return { ok: false, error: "in_use" };

  const { error } = await db.from("business_types").delete().eq("id", id);
  if (error) return { ok: false, error: "failed" };
  await logAdminAction({
    action: "business_type_delete",
    actor: admin,
    details: { slug },
  });
  const bt = adminPath("/business-types");
  if (bt) revalidatePath(bt);
  return { ok: true };
}
