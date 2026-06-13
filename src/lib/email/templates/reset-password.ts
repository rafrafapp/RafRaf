import { emailLayout } from "./layout";

// Arabic "Reset password" email. SENT BY SUPABASE over Resend SMTP — paste `html`
// into Supabase → Authentication → Email Templates → "Reset password", and set the
// subject to `resetPasswordSubject`. Points at the SSR reset-password route, matching
// the forgot-password flow (see docs/email-setup.md).
export const resetPasswordSubject = "استعادة كلمة المرور";

export const resetPasswordHtml = emailLayout({
  heading: "استعادة كلمة المرور",
  bodyHtml:
    `<p style="margin:0 0 12px;">طلبتَ إعادة تعيين كلمة المرور لحسابك في رف رف.</p>` +
    `<p style="margin:0;">اضغط الزر أدناه لتعيين كلمة مرور جديدة. الرابط صالح لفترة محدودة.</p>`,
  cta: {
    label: "تعيين كلمة مرور جديدة",
    url: "{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery",
  },
  footnote: "إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.",
});

// Same email, but sent by RafRaf via the Resend *API* (not Supabase SMTP) with a
// concrete reset link. Used by the forgot-password server action so the flow works
// even when Supabase's own mailer/SMTP is unconfigured or failing.
export function resetPasswordEmail(url: string): {
  subject: string;
  html: string;
} {
  return {
    subject: resetPasswordSubject,
    html: emailLayout({
      heading: "استعادة كلمة المرور",
      bodyHtml:
        `<p style="margin:0 0 12px;">طلبتَ إعادة تعيين كلمة المرور لحسابك في رف رف.</p>` +
        `<p style="margin:0;">اضغط الزر أدناه لتعيين كلمة مرور جديدة. الرابط صالح لفترة محدودة.</p>`,
      cta: { label: "تعيين كلمة مرور جديدة", url },
      footnote: "إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.",
    }),
  };
}
