import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { ExpenseForm } from "@/components/ExpenseForm";

export default async function ExpensesPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <ExpenseForm
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      locale={locale}
      appName={dict.app.name}
      tx={dict.transactions}
      common={dict.common}
      syncLabels={dict.products.sync}
    />
  );
}
