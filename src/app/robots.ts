import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

// Only the public marketing pages are crawlable; the app itself is behind auth.
// (The admin path is deliberately NOT listed — naming it here would leak it.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/developers", "/terms", "/privacy", "/login"],
        disallow: [
          "/api/",
          "/dashboard",
          "/products",
          "/sell",
          "/buy",
          "/returns",
          "/expenses",
          "/customers",
          "/suppliers",
          "/transactions",
          "/reports",
          "/settings",
          "/notifications",
          "/mobile-credit",
          "/sham-cash",
          "/ai",
          "/setup",
          "/auth/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
