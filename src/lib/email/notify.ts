import "server-only";
import { sendEmail } from "./resend";
import { welcomeSubject, welcomeHtml } from "./templates/welcome";

// App-sent transactional emails (composition + transport). Auth emails (confirm /
// reset) are handled by Supabase SMTP, not here.

export async function sendWelcomeEmail(opts: {
  to: string | null | undefined;
  storeName: string;
  appUrl?: string;
}): Promise<boolean> {
  if (!opts.to) return false;
  return sendEmail(
    opts.to,
    welcomeSubject,
    welcomeHtml({ storeName: opts.storeName, appUrl: opts.appUrl }),
  );
}
