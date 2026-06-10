import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { getActiveBusinessTypes, bizTypeName } from "@/lib/business-types/read";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SetupWizard } from "./SetupWizard";
import styles from "./setup.module.css";

export default async function SetupPage() {
  if (!(await getUser())) redirect("/login");
  const ctx = await getMerchantContext();
  if (ctx.status === "ok") redirect("/dashboard");
  // Offline we can't tell if a store exists; don't strand them on setup.
  if (ctx.status === "offline") redirect("/products");

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  const businessTypes = (await getActiveBusinessTypes()).map((t) => ({
    slug: t.slug,
    name: bizTypeName(t, locale) ?? t.slug,
  }));

  return (
    <main className={styles.main}>
      <div className={styles.topbar}>
        <span className={styles.logo}>{dict.app.name}</span>
        <LanguageSwitcher
          current={locale}
          labels={{ arabic: dict.common.arabic, english: dict.common.english }}
        />
      </div>

      <div className={styles.card}>
        <h1 className={styles.title}>{dict.setup.title}</h1>
        <p className={styles.subtitle}>{dict.setup.subtitle}</p>
        <SetupWizard
          setup={dict.setup}
          common={dict.common}
          businessTypes={businessTypes}
        />
      </div>
    </main>
  );
}
