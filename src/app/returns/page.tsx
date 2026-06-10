import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { TransactionForm } from "@/components/TransactionForm";

export default async function ReturnsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <TransactionForm
      mode="return"
      merchantId={merchant?.id ?? user.id}
      currency={merchant?.default_currency ?? "SYP"}
      locale={locale}
      appName={dict.app.name}
      tx={dict.transactions}
      common={dict.common}
      syncLabels={dict.products.sync}
      scanLabels={{
        title: dict.products.scanTitle,
        hint: dict.products.scanHint,
        error: dict.products.scanError,
        close: dict.products.scanClose,
      }}
    />
  );
}
