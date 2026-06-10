import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import {
  getBusinessTypeBySlug,
  resolveCustomFields,
} from "@/lib/business-types/read";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { EditProductView } from "../../EditProductView";
import styles from "../../product-form.module.css";

export default async function EditProductPage({
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
  const bizType = await getBusinessTypeBySlug(merchant?.business_type ?? null);
  const customFields = resolveCustomFields(bizType, locale);

  return (
    <main className={styles.main}>
      <div className={styles.topbar}>
        <span className={styles.logo}>{dict.app.name}</span>
        <div className={styles.headerActions}>
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: dict.common.arabic, english: dict.common.english }}
          />
        </div>
      </div>

      <div className={styles.card}>
        <Link href="/products" className={styles.back}>
          {dict.products.backToList}
        </Link>
        <h1 className={styles.title}>{dict.products.editTitle}</h1>
        <EditProductView
          id={id}
          merchantId={merchant?.id ?? user.id}
          customFields={customFields}
          products={dict.products}
          common={dict.common}
          currency={merchant?.default_currency ?? "SYP"}
        />
      </div>
    </main>
  );
}
