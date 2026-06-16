import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { getUser, getMerchant } from "@/lib/auth/merchant";
import { getMerchantBackupStatus } from "@/lib/backup/status";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/SignOutButton";
import { SettingsForm } from "./SettingsForm";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LogoUpload } from "./LogoUpload";
import { CurrenciesSection } from "./CurrenciesSection";
import { BackupSection } from "./BackupSection";
import styles from "@/app/products/product-form.module.css";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const merchant = await getMerchant();
  if (!merchant) redirect("/setup");

  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  // Backup connection + last-run status (admin-only table, read via service role
  // pinned to this merchant's id).
  const backup = await getMerchantBackupStatus(merchant.id);
  const lastBackupAt = backup.at
    ? new Date(backup.at).toLocaleString(locale === "ar" ? "ar" : "en-GB", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

  // Only email/password accounts can change a password here (Google users manage
  // theirs with Google).
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword =
    providers.includes("email") ||
    (user.identities ?? []).some((i) => i.provider === "email");

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
        <h1 className={styles.title}>{dict.settings.title}</h1>
        <p className={styles.muted}>{dict.settings.subtitle}</p>
        <SettingsForm
          initial={{
            notify_channel: merchant.notify_channel ?? "telegram",
            telegram_chat_id: merchant.telegram_chat_id ?? "",
            offers_mobile_credit: merchant.offers_mobile_credit ?? true,
          }}
          settings={dict.settings}
          common={dict.common}
          botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null}
        />
      </div>

      <div className={styles.card} style={{ marginBlockStart: "1.25rem" }}>
        <h1 className={styles.title}>{dict.settings.currencies.title}</h1>
        <CurrenciesSection
          merchantId={merchant.id}
          locale={locale}
          labels={dict.settings.currencies}
        />
      </div>

      <div className={styles.card} style={{ marginBlockStart: "1.25rem" }}>
        <h1 className={styles.title}>{dict.settings.logo.title}</h1>
        <p className={styles.muted}>{dict.settings.logo.subtitle}</p>
        <LogoUpload initialUrl={merchant.logo_url} labels={dict.settings.logo} />
      </div>

      <div className={styles.card} style={{ marginBlockStart: "1.25rem" }}>
        <h1 className={styles.title}>{dict.settings.backup.title}</h1>
        <p className={styles.muted}>{dict.settings.backup.subtitle}</p>
        <BackupSection
          linked={Boolean(merchant.google_sheet_id)}
          lastBackupAt={lastBackupAt}
          labels={dict.settings.backup}
        />
      </div>

      {hasPassword && (
        <div className={styles.card} style={{ marginBlockStart: "1.25rem" }}>
          <h1 className={styles.title}>{dict.settings.password.title}</h1>
          <PasswordChangeForm
            email={user.email ?? ""}
            storeName={merchant.store_name}
            labels={dict.settings.password}
            passwordLabels={dict.password}
          />
        </div>
      )}

      <p
        style={{
          marginBlockStart: "1.5rem",
          display: "flex",
          gap: "1.25rem",
          justifyContent: "center",
          fontSize: "0.85rem",
        }}
      >
        <Link href="/privacy" style={{ color: "var(--text-muted)" }}>
          {dict.landing.footer.privacy}
        </Link>
        <Link href="/terms" style={{ color: "var(--text-muted)" }}>
          {dict.landing.footer.terms}
        </Link>
      </p>

      <div
        style={{
          marginBlockStart: "1rem",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <SignOutButton label={dict.dashboard.signOut} className={styles.delete} />
      </div>
    </main>
  );
}
