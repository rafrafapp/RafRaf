import { NextResponse, type NextRequest } from "next/server";
import { updateSession, readMerchantRole } from "@/lib/supabase/middleware";
import { buildCsp } from "@/lib/security/csp";
import { logSecurityEvent } from "@/lib/security/events";
import { isAdminIpAllowed } from "@/lib/security/admin-ip";
import { ADMIN_INTERNAL_BASE, adminPublicBase } from "@/lib/security/admin-path";

// NOTE: rate limiting is enforced in the Node contexts that need it — the login
// server action and the AI gate (both import @/lib/security/ratelimit). It is
// deliberately NOT done here: the Edge middleware must not bundle @upstash/redis
// (its nodejs build references process.version, which the Edge runtime lacks).

// Routes that require an authenticated user.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/setup",
  "/products",
  "/sell",
  "/buy",
  "/returns",
  "/expenses",
  "/transactions",
  "/customers",
  "/suppliers",
  "/reports",
  "/settings",
  "/ai",
  "/mobile-credit",
  "/sham-cash",
];

function clientIp(request: NextRequest): string {
  return (
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "anonymous"
  );
}

function redirectWithCsp(
  request: NextRequest,
  to: string,
  csp: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = to;
  const redirect = NextResponse.redirect(url);
  redirect.headers.set("content-security-policy", csp);
  return redirect;
}

function notFoundWithCsp(csp: string): NextResponse {
  const res = new NextResponse(null, { status: 404 });
  res.headers.set("content-security-policy", csp);
  return res;
}

export async function middleware(request: NextRequest) {
  // Per-request CSP nonce (Edge-safe: Web Crypto + btoa, no Buffer).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp(nonce);

  const { pathname } = request.nextUrl;

  const { response, user } = await updateSession(request, {
    "x-nonce": nonce,
    // Next reads the nonce from this request header and applies it to its scripts.
    "content-security-policy": csp,
  });

  // Layer 7 — Admin path. Reachable ONLY at the unguessable /$ADMIN_SECRET_PATH;
  // the physical mount (ADMIN_INTERNAL_BASE) 404s from outside. Unset env ⇒ the
  // admin is unreachable (safe default). The triple gate (auth + superadmin +
  // allowlisted IP) runs on the secret path; denials are logged + bounced.

  // (a) The internal mount never exists publicly.
  if (
    pathname === ADMIN_INTERNAL_BASE ||
    pathname.startsWith(`${ADMIN_INTERNAL_BASE}/`)
  ) {
    return notFoundWithCsp(csp);
  }

  // (b) Secret path → gate, then internally rewrite to the mount.
  const adminBase = adminPublicBase();
  if (
    adminBase !== null &&
    (pathname === adminBase || pathname.startsWith(`${adminBase}/`))
  ) {
    const ip = clientIp(request);
    if (!user) return redirectWithCsp(request, "/login", csp);

    const role = await readMerchantRole(request, user.id);
    if (role !== "superadmin") {
      await logSecurityEvent("ADMIN_ACCESS_DENIED", {
        userId: user.id,
        ip,
        message: "not_superadmin",
      });
      return redirectWithCsp(request, "/dashboard", csp);
    }
    if (!isAdminIpAllowed(ip)) {
      await logSecurityEvent("ADMIN_ACCESS_DENIED", {
        userId: user.id,
        ip,
        reason: "ip_not_allowed",
      });
      return redirectWithCsp(request, "/dashboard", csp);
    }

    // Passed → rewrite /<secret>/… → /rafraf-admin/…, carrying the forwarded
    // nonce/CSP request headers and any rotated auth cookies from updateSession.
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_INTERNAL_BASE + pathname.slice(adminBase.length);
    const forwarded = new Headers(request.headers);
    forwarded.set("x-nonce", nonce);
    forwarded.set("content-security-policy", csp);
    const rewrite = NextResponse.rewrite(url, { request: { headers: forwarded } });
    for (const c of response.cookies.getAll()) rewrite.cookies.set(c);
    rewrite.headers.set("content-security-policy", csp);
    return rewrite;
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Unauthenticated → bounce protected routes to login.
  if (isProtected && !user) {
    return redirectWithCsp(request, "/login", csp);
  }

  // Authenticated users have no reason to see the login page.
  if (user && pathname === "/login") {
    return redirectWithCsp(request, "/dashboard", csp);
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
