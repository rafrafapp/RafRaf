import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { localeDirection } from "@/i18n/config";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { NumberInputGuard } from "@/components/NumberInputGuard";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import "./globals.css";

// Self-hosted app font (CSP-safe — served from /_next/static, no external CDN).
// Exposed as --font-plex; globals.css puts it first in --font-sans.
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

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
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon.svg", type: "image/svg+xml" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
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
  themeColor: "#1E3A8A",
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
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} dir={dir} className={plex.variable}>
      <body>
        {children}
        <ServiceWorkerRegister />
        <NumberInputGuard />
        <OfflineBanner text={dict.offlineBanner.text} />
        <BottomNav labels={dict.dashboard.nav} />
      </body>
    </html>
  );
}
