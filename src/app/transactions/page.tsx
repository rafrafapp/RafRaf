import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { TransactionsView } from "./TransactionsView";

export default async function TransactionsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <TransactionsView
      merchantId={merchant?.id ?? user.id}
      locale={locale}
      appName={dict.app.name}
      tx={dict.transactions}
      common={dict.common}
      syncLabels={dict.products.sync}
    />
  );
}
