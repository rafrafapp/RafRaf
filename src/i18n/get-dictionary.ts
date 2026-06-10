import "server-only";
import type { Locale } from "./config";

// Typed shape of a dictionary, inferred from the Arabic source of truth.
import type ar from "./dictionaries/ar.json";
export type Dictionary = typeof ar;

// Dictionaries are loaded dynamically so each locale's JSON is code-split.
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  ar: () => import("./dictionaries/ar.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default as Dictionary),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
