import "server-only";
import { Resend } from "resend";

// Server-only email transport via Resend. RESEND_API_KEY + EMAIL_FROM are non-public
// env vars. Best-effort, mirroring the messaging layer: no-op (returns false) until
// configured, and it NEVER throws — a failed email must not break the request that
// triggered it.
//
// NOTE: the auth emails (confirm signup / reset password) are sent by *Supabase* over
// Resend SMTP (see docs/email-setup.md), not through this function. This transport is
// for RafRaf's own transactional mail (e.g. the welcome email).

let _client: Resend | null = null;
let _init = false;

function getClient(): Resend | null {
  if (_init) return _client;
  _init = true;
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) _client = new Resend(key);
  return _client;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const client = getClient();
  const from = process.env.EMAIL_FROM?.trim();
  if (!client || !from || !to) return false;
  try {
    const { error } = await client.emails.send({ from, to, subject, html });
    return !error;
  } catch {
    return false;
  }
}
