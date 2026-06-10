import "server-only";

// Cron endpoints are triggered server-to-server (Vercel Cron) and must reject
// everyone else. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
// when a CRON_SECRET env var is set; we require an exact match. If CRON_SECRET
// is unset we deny — never run an unauthenticated backup.
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
