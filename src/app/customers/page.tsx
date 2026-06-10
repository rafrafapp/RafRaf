import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { CustomersView } from "./CustomersView";

export default async function CustomersPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <CustomersView
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      locale={locale}
      appName={dict.app.name}
      customers={dict.customers}
      common={dict.common}
      sync={dict.products.sync}
    />
  );
}
