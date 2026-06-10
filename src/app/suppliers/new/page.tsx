import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SupplierForm } from "../SupplierForm";
import styles from "@/app/products/product-form.module.css";

export default async function NewSupplierPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  const merchant = ctx.status === "ok" ? ctx.merchant : null;

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

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
        <Link href="/suppliers" className={styles.back}>
          {dict.suppliers.backToList}
        </Link>
        <h1 className={styles.title}>{dict.suppliers.addTitle}</h1>
        <SupplierForm
          mode="create"
          merchantId={merchant?.id ?? user.id}
          suppliers={dict.suppliers}
          common={dict.common}
        />
      </div>
    </main>
  );
}
