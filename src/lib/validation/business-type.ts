import { z } from "zod";
import { NO_TAGS } from "./sanitize";

// Validation for admin-managed business types (Phase: dynamic business types).
// slug is the value stored in merchants.business_type; it's the stable key, so the
// admin UI locks it on edit (changing it would orphan merchants using the old slug).

export const CUSTOM_FIELD_TYPES = ["text", "number", "date"] as const;

const slug = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/, "lowercase letters, digits and _ only");

const shortName = z.string().trim().min(1).max(80).regex(NO_TAGS);

export const customFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, digits and _ only"),
  type: z.enum(CUSTOM_FIELD_TYPES),
  label_ar: shortName,
  label_en: shortName,
});

export const businessTypeSchema = z.object({
  id: z.string().uuid().optional(),
  slug,
  name_ar: shortName,
  name_en: shortName,
  active: z.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
  custom_fields: z.array(customFieldSchema).max(12).default([]),
});

export type CustomFieldInput = z.infer<typeof customFieldSchema>;
export type BusinessTypeInput = z.infer<typeof businessTypeSchema>;
