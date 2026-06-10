import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { SuppliersView } from "./SuppliersView";

export default async function SuppliersPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <SuppliersView
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      locale={locale}
      appName={dict.app.name}
      suppliers={dict.suppliers}
      common={dict.common}
      sync={dict.products.sync}
    />
  );
}
