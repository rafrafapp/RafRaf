import withPWAInit from "@ducanh2912/next-pwa";

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
