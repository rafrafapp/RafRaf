import withPWAInit from "@ducanh2912/next-pwa";

// Per-build revision so the precached app shells are refreshed on every deploy.
const BUILD_REV = `${Date.now()}`;

// App routes precached at SW install so they work offline even if never visited.
// Dynamic [id] routes (e.g. /products/[id]/edit) can't be precached (the URL
// depends on data) — the navigation StaleWhileRevalidate rule caches those on
// first visit instead.
const PRECACHE_ROUTES = [
  "/dashboard",
  "/products",
  "/products/new",
  "/sell",
  "/buy",
  "/returns",
  "/expenses",
  "/customers",
  "/customers/new",
  "/suppliers",
  "/suppliers/new",
  "/transactions",
  "/reports",
  "/settings",
  "/notifications",
  "/mobile-credit",
  "/sham-cash",
  "/ai",
];

const withPWA = withPWAInit({
  dest: "public",
  // Service worker is disabled in development to avoid caching headaches.
  disable: process.env.NODE_ENV === "development",
  // We register the SW ourselves (ServiceWorkerRegister) so registration is
  // bundled JS, trusted under the strict nonce CSP via 'strict-dynamic'.
  register: false,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    // Don't let the default navigation fallback override our per-route caching.
    cleanupOutdatedCaches: true,
    // Precache every static app route so a refresh works offline anywhere.
    additionalManifestEntries: PRECACHE_ROUTES.map((url) => ({
      url,
      revision: BUILD_REV,
    })),
    // Replace the defaults with explicit, predictable strategies.
    runtimeCaching: [
      // Fonts → CacheFirst, 1 year.
      {
        urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "rafraf-fonts",
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
      // Next build assets (JS/CSS) → CacheFirst (content-hashed, safe).
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "rafraf-static",
          expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      // Images → CacheFirst.
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "rafraf-images",
          expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      // API calls → NetworkFirst (fresh when online, cached fallback offline).
      {
        urlPattern: /\/api\/.*/i,
        handler: "NetworkFirst",
        method: "GET",
        options: {
          cacheName: "rafraf-api",
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
        },
      },
      // RSC payloads. App Router client-side navigations (and link prefetches)
      // fetch the page's React-Flight payload via fetch() with a `?_rsc=…` query
      // and an `RSC: 1` header. These are mode "cors", NOT "navigate", so the
      // navigation rule below never catches them — without this, every soft
      // navigation hits the network and throws ERR_INTERNET_DISCONNECTED offline.
      // SWR serves the cached payload offline and refreshes it when back online.
      {
        urlPattern: ({ url, request, sameOrigin }) =>
          sameOrigin &&
          (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "rsc-cache",
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
      // Page navigations (the SSR HTML shells) → StaleWhileRevalidate, so any
      // visited page is served instantly + works offline after refresh.
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "rafraf-pages",
          expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

// Static security headers (Layer 5). The Content-Security-Policy is NOT here —
// it carries a per-request nonce and is set in middleware.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep isomorphic-dompurify's jsdom dependency server-side only (the browser
  // build is used on the client, so no jsdom bloat in the client bundle).
  serverExternalPackages: ["isomorphic-dompurify", "cloudinary"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
