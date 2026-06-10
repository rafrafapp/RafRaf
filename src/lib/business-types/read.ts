import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProductCustomField } from "@/lib/validation/product";

// Merchant-facing reads of the admin-managed business types (RLS: SELECT to
// authenticated). Used by the setup wizard, the product form shells, and the
// dashboard label. Reads are wrapped so a connectivity blip degrades gracefully
// (empty / null) rather than throwing.

export type BizCustomField = {
  key: string;
  type: "text" | "number" | "date";
  label_ar: string;
  label_en: string;
};

export type BusinessTypeRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  custom_fields: BizCustomField[];
  active: boolean;
  sort: number;
};

const COLS = "id,slug,name_ar,name_en,custom_fields,active,sort";

export async function getActiveBusinessTypes(): Promise<BusinessTypeRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_types")
      .select(COLS)
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("name_ar", { ascending: true });
    return (data ?? []) as BusinessTypeRow[];
  } catch {
    return [];
  }
}

export async function getBusinessTypeBySlug(
  slug: string | null | undefined,
): Promise<BusinessTypeRow | null> {
  if (!slug) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_types")
      .select(COLS)
      .eq("slug", slug)
      .maybeSingle();
    return (data as BusinessTypeRow) ?? null;
  } catch {
    return null;
  }
}

// The store name for a business type in the active locale (falls back to slug).
export function bizTypeName(
  row: Pick<BusinessTypeRow, "name_ar" | "name_en"> | null,
  locale: string,
): string | null {
  if (!row) return null;
  return locale === "ar" ? row.name_ar : row.name_en;
}

// Map a type's custom-field config to the product form's shape, with each label
// resolved to the active locale.
export function resolveCustomFields(
  row: BusinessTypeRow | null,
  locale: string,
): ProductCustomField[] {
  if (!row?.custom_fields) return [];
  return row.custom_fields.map((f) => ({
    key: f.key,
    type: f.type,
    label: locale === "ar" ? f.label_ar : f.label_en,
  }));
}
