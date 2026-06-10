import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { DashboardView } from "./DashboardView";

// Thin server shell: auth gate + merchant context + dictionary. The dashboard UI
// is a client component that reads live, offline-first data from IndexedDB.
export default async function DashboardPage() {
  if (!(await getUser())) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  // Offline: the server shell can't fetch the merchant row, so send the user to the
  // offline-capable products page (unchanged behaviour).
  if (ctx.status === "offline") redirect("/products");
  const merchant = ctx.merchant;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  const storeName =
    locale === "en" && merchant.store_name_en
      ? merchant.store_name_en
      : merchant.store_name;

  return (
    <DashboardView
      merchantId={merchant.id}
      currency={merchant.default_currency}
      storeName={storeName}
      logoUrl={merchant.logo_url}
      locale={locale}
      dashboard={dict.dashboard}
      common={dict.common}
      sync={dict.products.sync}
    />
  );
}
