import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { InvoiceView } from "./InvoiceView";

export default async function InvoiceDetailPage({
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

  return (
    <InvoiceView
      id={id}
      merchantId={merchant?.id ?? user.id}
      storeName={merchant?.store_name ?? dict.app.name}
      currency={merchant?.default_currency ?? "SYP"}
      locale={locale}
      appName={dict.app.name}
      tx={dict.transactions}
      common={dict.common}
    />
  );
}
