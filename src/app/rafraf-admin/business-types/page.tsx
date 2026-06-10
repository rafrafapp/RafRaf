import { requireSuperadmin } from "@/lib/security/admin";
import { listBusinessTypes } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { BusinessTypesManager } from "./BusinessTypesManager";
import styles from "../rafraf-admin.module.css";

export default async function AdminBusinessTypesPage() {
  await requireSuperadmin();
  const rows = await listBusinessTypes();
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);

  return (
    <>
      <div>
        <h1 className={styles.title}>{dict.admin.businessTypes.title}</h1>
        <p className={styles.subtitle}>{dict.admin.businessTypes.subtitle}</p>
      </div>
      <BusinessTypesManager
        initial={rows}
        labels={dict.admin.businessTypes}
        locale={locale}
      />
    </>
  );
}
