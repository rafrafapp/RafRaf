import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { localeDirection } from "@/i18n/config";
import styles from "./landing.module.css";

// Self-hosted fonts (CSP-safe — no external Google Fonts link).
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Locale-aware SEO metadata (the landing copy itself is bilingual too).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const m = dict.landing.meta;
  return {
    title: m.title,
    description: m.description,
    keywords: [
      "رف رف",
      "RafRaf",
      "نقطة بيع",
      "POS",
      "إدارة مخزون",
      "inventory",
      "دفتر ديون",
      "offline-first",
      "Syria",
    ],
    openGraph: {
      title: m.title,
      description: m.ogDescription,
      type: "website",
      locale: locale === "ar" ? "ar_SY" : "en_US",
      siteName: dict.app.name,
    },
  };
}

// Marketing layout: its own dark theme + fonts, no app chrome. Direction follows
// the active locale so the bilingual landing flips RTL/LTR with the AR/EN pill.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const locale = await getCurrentLocale();
  return (
    <div
      dir={localeDirection[locale]}
      className={`${plex.variable} ${inter.variable} ${styles.root}`}
    >
      {children}
    </div>
  );
}
