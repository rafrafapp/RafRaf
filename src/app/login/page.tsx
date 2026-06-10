import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser } from "@/lib/auth/merchant";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/dashboard");

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const { error } = await searchParams;

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
        <p className={styles.tagline}>{dict.app.tagline}</p>
        <LoginForm auth={dict.auth} password={dict.password} urlError={error} />
      </div>
    </main>
  );
}
