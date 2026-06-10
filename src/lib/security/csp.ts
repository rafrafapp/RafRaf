// Content-Security-Policy builder (Layer 5). Production is strict: a per-request
// nonce + 'strict-dynamic', NO 'unsafe-inline' in script-src. Development relaxes
// only what `next dev` needs (eval for fast-refresh, ws: for HMR) so the dev
// server still works. Called from middleware with a fresh nonce per request.
export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";

  // Lock connect-src to the actual Supabase project (REST + realtime wss).
  let supa = "https://*.supabase.co wss://*.supabase.co";
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    supa = `${u.origin} wss://${u.host}`;
  } catch {
    // fall back to the wildcard above
  }

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    dev
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next.js + CSS modules inject inline <style>; style injection is low risk and
    // the security spec allows 'unsafe-inline' for styles (never for scripts).
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self'`,
    dev ? `connect-src 'self' ${supa} ws: wss:` : `connect-src 'self' ${supa}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `media-src 'self' blob:`,
  ].join("; ");
}
