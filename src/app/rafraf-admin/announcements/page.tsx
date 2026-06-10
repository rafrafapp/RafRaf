import { requireSuperadmin } from "@/lib/security/admin";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { BroadcastForm } from "../controls";
import styles from "../rafraf-admin.module.css";

export default async function AdminAnnouncementsPage() {
  await requireSuperadmin();
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const an = dict.admin.announce;

  return (
    <>
      <div>
        <h1 className={styles.title}>{an.title}</h1>
        <p className={styles.subtitle}>{an.subtitle}</p>
      </div>

      <BroadcastForm
        labels={{
          placeholder: an.message,
          all: an.all,
          telegram: an.telegram,
          whatsapp: an.whatsapp,
          send: an.send,
          sending: an.sending,
          sent: an.sent,
          empty: an.empty,
          failed: dict.admin.actionFailed,
        }}
      />
    </>
  );
}
