import type { Metadata, Viewport } from "next";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { localeDirection } from "@/i18n/config";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { NumberInputGuard } from "@/components/NumberInputGuard";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  const title = `${dict.app.name} — ${dict.app.tagline}`;
  // Absolute origin so the og:image (app/opengraph-image) resolves for the
  // WhatsApp/Telegram/X link-preview crawlers. Custom domain → Vercel prod URL →
  // localhost.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return {
    metadataBase: new URL(siteUrl),
    title,
    description: dict.app.promise,
    manifest: "/manifest.json",
    applicationName: dict.app.name,
    appleWebApp: {
      capable: true,
      title: dict.app.name,
      statusBarStyle: "default",
    },
    openGraph: {
      title,
      description: dict.app.promise,
      type: "website",
      siteName: dict.app.name,
      locale: locale === "ar" ? "ar_SY" : "en_US",
    },
    twitter: { card: "summary_large_image", title, description: dict.app.promise },
  };
}

export const viewport: Viewport = {
  themeColor: "#0e7c66",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getCurrentLocale();
  const dir = localeDirection[locale];

  return (
    <html lang={locale} dir={dir}>
      <body>
        {children}
        <ServiceWorkerRegister />
        <NumberInputGuard />
      </body>
    </html>
  );
}
