// RafRaf is Arabic-first. Arabic is the default locale; English is the fallback.
export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";

// Text direction per locale — drives the <html dir> attribute and RTL-aware CSS.
export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

// Cookie that persists the visitor's locale choice across requests.
export const LOCALE_COOKIE = "rafraf_locale";

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}
