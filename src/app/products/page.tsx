import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { ProductsView } from "./ProductsView";

// Thin server shell: gate auth + hand the merchant/locale context to the
// offline-first client view, which reads/writes IndexedDB and syncs.
export default async function ProductsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  // Offline: keep the user on the (fully offline-capable) products page using the
  // session-derived id instead of bouncing to /setup.
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <Suspense>
      <ProductsView
        merchantId={merchant?.id ?? user.id}
        currency={merchant?.default_currency ?? "SYP"}
        locale={locale}
        appName={dict.app.name}
        products={dict.products}
        common={dict.common}
      />
    </Suspense>
  );
}
