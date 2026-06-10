// Single source of truth for the admin path. The PUBLIC path is unguessable and
// comes from ADMIN_SECRET_PATH (server env, never NEXT_PUBLIC). The pages live at
// ADMIN_INTERNAL_BASE; middleware rewrites public→internal and 404s direct hits on
// the internal base. Edge-safe: only reads process.env (no node-only imports).
export const ADMIN_INTERNAL_BASE = "/rafraf-admin";

// The public admin base (e.g. "/r9x7k2mq8p3control") or null when ADMIN_SECRET_PATH
// is unset — in which case the admin is unreachable (safe default).
export function adminPublicBase(): string | null {
  const seg = (process.env.ADMIN_SECRET_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
  return seg.length > 0 ? `/${seg}` : null;
}

// Build a public admin URL, e.g. adminPath("/merchants"). Returns null when the
// admin is disabled. Note: in a CLIENT component process.env.ADMIN_SECRET_PATH is
// undefined → this returns null there; pass the base as a prop from the server.
export function adminPath(sub = ""): string | null {
  const base = adminPublicBase();
  return base ? `${base}${sub}` : null;
}
