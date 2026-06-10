import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import styles from "@/app/login/login.module.css";

export default async function ForgotPasswordPage() {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

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
        <h1 className={styles.authTitle}>{dict.forgotPassword.title}</h1>
        <p className={styles.authSubtitle}>{dict.forgotPassword.subtitle}</p>
        <ForgotPasswordForm labels={dict.forgotPassword} />
      </div>
    </main>
  );
}
