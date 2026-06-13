import type { Metadata } from "next";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LegalDoc } from "../LegalDoc";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  return {
    title: `${dict.landing.legal.privacy.title} — ${dict.app.name}`,
    description: dict.landing.legal.privacy.intro,
  };
}

export default async function PrivacyPage() {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const t = dict.landing;
  return (
    <LegalDoc
      appName={dict.app.name}
      locale={locale}
      backHome={t.legal.backHome}
      updated={t.legal.updated}
      rights={t.footer.rights}
      doc={t.legal.privacy}
    />
  );
}
