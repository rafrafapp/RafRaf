import { emailLayout } from "./layout";
import { escapeHtml } from "@/lib/validation/sanitize";

// Arabic welcome email — sent by RafRaf via the Resend API (sendEmail), NOT by
// Supabase, after a merchant finishes store setup. storeName is escaped (it can't
// contain tags per the setup schema, but escape defensively for entities).
export const welcomeSubject = "أهلاً بك في رف رف 🎉";

export function welcomeHtml(opts: { storeName: string; appUrl?: string }): string {
  const store = escapeHtml(opts.storeName);
  return emailLayout({
    heading: `أهلاً ${store} 🎉`,
    bodyHtml:
      `<p style="margin:0 0 12px;">تم إنشاء متجرك بنجاح على رف رف.</p>` +
      `<p style="margin:0;">ابدأ بإضافة منتجاتك وتسجيل أول عملية بيع — كل شي بيتسجّل، ما بيضيع شي، والتطبيق بيشتغل حتى لو انقطع الإنترنت.</p>`,
    cta: opts.appUrl
      ? { label: "افتح لوحة التحكم", url: opts.appUrl }
      : undefined,
  });
}
