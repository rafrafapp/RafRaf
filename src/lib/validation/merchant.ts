import { z } from "zod";
import { NO_TAGS, PHONE_RE } from "./sanitize";

// Business types and currencies are constrained both here (input) and in the DB
// (CHECK constraints) — defense in depth.
export const BUSINESS_TYPES = [
  "grocery",
  "fashion",
  "pharmacy",
  "hardware",
  "electronics",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const CURRENCIES = ["SYP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Notification channels (Phase 8). Telegram is the default/primary; WhatsApp is
// the secondary; 'off' disables merchant notifications. Mirrored by the
// merchants_notify_channel_check DB constraint.
export const NOTIFY_CHANNELS = ["telegram", "whatsapp", "off"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const notificationSettingsSchema = z.object({
  notify_channel: z.enum(NOTIFY_CHANNELS),
  telegram_chat_id: z
    .string()
    .trim()
    .max(40)
    .regex(/^-?\d{1,32}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const storeSetupSchema = z.object({
  store_name: z.string().trim().min(1).max(120).regex(NO_TAGS),
  store_name_en: z
    .string()
    .trim()
    .max(120)
    .regex(NO_TAGS)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  // Slug of an admin-managed business type (see business_types). Validated against
  // active rows in createStore — no longer a fixed enum.
  business_type: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  default_currency: z.enum(CURRENCIES),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(PHONE_RE)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  logo_url: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});

export type StoreSetupInput = z.infer<typeof storeSetupSchema>;
