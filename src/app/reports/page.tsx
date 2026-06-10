import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { ReportsView } from "./ReportsView";

export default async function ReportsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const storeName = merchant
    ? locale === "en" && merchant.store_name_en
      ? merchant.store_name_en
      : merchant.store_name
    : dict.app.name;

  return (
    <ReportsView
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      storeName={storeName}
      locale={locale}
      appName={dict.app.name}
      reports={dict.reports}
      common={dict.common}
      syncLabels={dict.products.sync}
    />
  );
}
