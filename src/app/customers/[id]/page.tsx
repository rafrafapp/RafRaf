import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { CustomerView } from "../CustomerView";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const { id } = await params;
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const storeName = merchant
    ? locale === "en" && merchant.store_name_en
      ? merchant.store_name_en
      : merchant.store_name
    : dict.app.name;

  return (
    <CustomerView
      id={id}
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      storeName={storeName}
      locale={locale}
      appName={dict.app.name}
      customers={dict.customers}
      common={dict.common}
      tx={dict.transactions}
      sync={dict.products.sync}
    />
  );
}
