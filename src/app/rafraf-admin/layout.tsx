import type { ReactNode } from "react";
import Link from "next/link";
import { requireSuperadmin } from "@/lib/security/admin";
import { adminPath } from "@/lib/security/admin-path";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignOutButton } from "@/components/SignOutButton";
import { AdminNav } from "./AdminNav";
import styles from "./rafraf-admin.module.css";

// Defense in depth: the middleware already enforces auth + superadmin + IP
// allowlist for /rafraf-admin, but the layout re-verifies on the server so the
// shell never renders for a non-superadmin even if the gate is bypassed.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSuperadmin();
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const a = dict.admin;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link href={adminPath() ?? "/dashboard"} className={styles.logo}>
            {dict.app.name} · Admin
          </Link>
          <span className={styles.tag}>{a.subtitle}</span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard" className={styles.backLink}>
            {a.backToApp}
          </Link>
          <LanguageSwitcher
            current={locale}
            labels={{ arabic: dict.common.arabic, english: dict.common.english }}
          />
          <SignOutButton label={dict.dashboard.signOut} className={styles.backLink} />
        </div>
      </header>

      <AdminNav labels={a.nav} base={adminPath() ?? ""} />

      {children}
    </main>
  );
}
