import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchantContext } from "@/lib/auth/merchant";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AiView } from "./AiView";
import styles from "./ai.module.css";

// Smart-plan-only AI workspace (Phase 12 placeholder). Non-smart merchants are
// bounced to the dashboard (which shows the locked "قريباً" section instead).
export default async function AiPage() {
  if (!(await getUser())) redirect("/login");
  const ctx = await getMerchantContext();
  if (ctx.status === "none") redirect("/setup");
  if (ctx.status === "offline") redirect("/products");
  if (ctx.merchant.plan !== "smart") redirect("/dashboard");

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.back}>
          ← {dict.ai.back}
        </Link>
        <LanguageSwitcher
          current={locale}
          labels={{ arabic: dict.common.arabic, english: dict.common.english }}
        />
      </header>

      <div>
        <h1 className={styles.title}>{dict.ai.title}</h1>
        <p className={styles.subtitle}>{dict.ai.subtitle}</p>
      </div>
      <p className={styles.placeholder}>{dict.ai.placeholder}</p>

      <AiView ai={dict.ai} />
    </main>
  );
}
