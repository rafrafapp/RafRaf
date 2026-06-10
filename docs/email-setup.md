# Email setup (Resend)

RafRaf sends email two ways:

1. **Auth emails** — *Confirm signup* and *Reset password* are generated and sent by
   **Supabase**, delivered through **Resend SMTP**. The Arabic content is configured in
   the Supabase dashboard (source-of-truth HTML lives in `src/lib/email/templates/`).
2. **Transactional email** — the **welcome** email is sent by RafRaf itself via the
   **Resend API** (`src/lib/email/resend.ts` → `sendEmail`), after store setup.

Everything is **best-effort**: if Resend isn't configured, nothing breaks — auth still
works with Supabase's built-in email, and `sendEmail` is a no-op.

---

## 1. Resend account

1. Create a Resend account and **verify your sending domain** (add the DNS records).
2. Create an API key → set it in `.env.local`:
   ```
   RESEND_API_KEY=re_xxxxxxxxx
   EMAIL_FROM=RafRaf <noreply@yourdomain.com>
   ```
   `EMAIL_FROM` must use the verified domain.

## 2. Point Supabase Auth at Resend SMTP

Supabase Dashboard → **Project Settings → Authentication → SMTP Settings** → enable
custom SMTP:

| Field    | Value                                  |
| -------- | -------------------------------------- |
| Host     | `smtp.resend.com`                      |
| Port     | `465`                                  |
| Username | `resend`                               |
| Password | your `RESEND_API_KEY`                  |
| Sender   | the same address as `EMAIL_FROM`       |

## 3. Arabic email templates (Supabase dashboard)

Supabase Dashboard → **Authentication → Email Templates**. Paste the Arabic HTML +
subject from the template files:

| Supabase template | Subject (from code)        | HTML source (paste `…Html`)          |
| ----------------- | -------------------------- | ------------------------------------ |
| Confirm signup    | `تأكيد حسابك في رف رف`      | `src/lib/email/templates/confirm-signup.ts` |
| Reset password    | `استعادة كلمة المرور`      | `src/lib/email/templates/reset-password.ts` |

These templates already use the correct Supabase variables and point at the SSR routes
(`/auth/confirm?token_hash=…&type=email`, `/auth/reset-password?token_hash=…&type=recovery`),
so the existing confirm + forgot-password flows keep working.

> The **welcome** email (`welcome.ts`) is NOT a Supabase template — RafRaf sends it via
> the Resend API on store setup. Nothing to paste.

## 4. Verify

- Sign up a new account → the Arabic "تأكيد حسابك في رف رف" email arrives via Resend.
- Finish store setup → the Arabic welcome email ("أهلاً بك في رف رف 🎉") arrives.
- Use **Forgot password** → the Arabic "استعادة كلمة المرور" email arrives.
- Check the Resend dashboard logs for delivery status.
