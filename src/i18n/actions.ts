"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Persist the chosen locale in a cookie and re-render the current route so the
// new language + direction take effect.
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
  // Locale affects every route (all read the cookie), so revalidate the whole
  // route tree under the root layout — the landing + /developers included.
  revalidatePath("/", "layout");
}
