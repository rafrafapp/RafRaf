// Edge-safe admin IP allowlist (Layer 7). Importable by middleware — no Node
// APIs, no "server-only". ADMIN_ALLOWED_IPS is a comma-separated list.
//
// Per rafraf_security.md: when the allowlist is empty the IP check is SKIPPED
// (so the dashboard is reachable in dev / before the allowlist is configured) —
// the superadmin role check still applies. Set ADMIN_ALLOWED_IPS in production.

export function parseAllowedIps(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminIpAllowed(ip: string | null | undefined): boolean {
  const allowed = parseAllowedIps(process.env.ADMIN_ALLOWED_IPS);
  if (allowed.length === 0) return true; // not configured → skip the IP layer
  if (!ip || ip === "anonymous") return false;
  return allowed.includes(ip);
}
