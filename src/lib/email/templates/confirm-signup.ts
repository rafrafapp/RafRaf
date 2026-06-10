import { emailLayout } from "./layout";

// Arabic "Confirm signup" email. SENT BY SUPABASE over Resend SMTP — paste `html`
// into Supabase → Authentication → Email Templates → "Confirm signup", and set the
// subject to `confirmSignupSubject`. It uses Supabase's template variables and points
// at the SSR confirm route (see docs/email-setup.md).
export const confirmSignupSubject = "تأكيد حسابك في رف رف";

export const confirmSignupHtml = emailLayout({
  heading: "تأكيد حسابك",
  bodyHtml:
    `<p style="margin:0 0 12px;">أهلاً بك في رف رف 👋</p>` +
    `<p style="margin:0;">اضغط الزر أدناه لتفعيل بريدك وإكمال إنشاء حسابك.</p>`,
  cta: {
    label: "تفعيل الحساب",
    url: "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email",
  },
  footnote: "إذا لم تُنشئ هذا الحساب، تجاهل هذه الرسالة.",
});
