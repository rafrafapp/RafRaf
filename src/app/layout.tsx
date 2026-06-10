import type { Metadata, Viewport } from "next";
import { getCurrentLocale } from "@/i18n/locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { localeDirection } from "@/i18n/config";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  const dict = await getDictionary(locale);
  return {
    title: `${dict.app.name} — ${dict.app.tagline}`,
    description: dict.app.promise,
    manifest: "/manifest.json",
    applicationName: dict.app.name,
    appleWebApp: {
      capable: true,
      title: dict.app.name,
      statusBarStyle: "default",
    },
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
      </body>
    </html>
  );
}
