import { requireSuperadmin } from "@/lib/security/admin";
import { listMerchants } from "@/lib/admin/queries";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { MerchantsTable } from "./MerchantsTable";
import { adminPath } from "@/lib/security/admin-path";
import styles from "../rafraf-admin.module.css";

export default async function AdminMerchantsPage() {
  await requireSuperadmin();
  const rows = await listMerchants();
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const ml = dict.admin.merchants;

  return (
    <>
      <h1 className={styles.title}>{ml.title}</h1>
      <MerchantsTable
        rows={rows}
        basePath={adminPath() ?? ""}
        plans={dict.admin.plans}
        roles={dict.admin.roles}
        labels={ml}
        locale={locale}
      />
    </>
  );
}
