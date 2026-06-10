# RafRaf — Deployment Guide (Vercel + Supabase)

This is the end‑to‑end guide to ship RafRaf to production. Frontend + API run on
**Vercel**; database, auth and realtime are **Supabase**. Everything else
(Google Sheets backup, Telegram/WhatsApp, Upstash, Cloudinary, Resend, Anthropic)
is **optional** — each feature is a no‑op until its env vars are set, so you can
launch with only the core and add the rest later.

---

## 0. Prerequisites

- A **Supabase** project (the schema for this app is already applied to the
  connected project `yepxrcoobtjlyjbvvloh`; for a brand‑new project see §1.0).
- A **Vercel** account + this repo pushed to GitHub/GitLab/Bitbucket.
- (Optional, per feature) Google Cloud service account, a Telegram bot, an Upstash
  Redis DB, a Cloudinary account, a Resend account, an Anthropic API key.

Local sanity check before deploying:

```bash
npm install
npm run typecheck   # must be clean
npm run build       # must be clean (stop `next dev` first — it locks .next)
```

---

## 1. Supabase setup (manual — do this first)

### 1.0 Schema (only for a NEW project)
The tables, RLS policies, the `record_transaction` / `api_record_transaction`
RPCs, triggers and the `is_superadmin()` / `custom_access_token_hook` functions
are already in the connected project. To stand up a **fresh** project, replay the
migrations (Supabase CLI: `supabase link` then `supabase db push`, or re‑apply the
SQL migrations). After any schema change run the security advisors — they must be
clean.

### 1.1 Auth → URL Configuration
- **Site URL:** your production origin (e.g. `https://rafraf.app`).
- **Redirect URLs:** add all three (prod origin):
  - `https://<your-domain>/auth/callback`
  - `https://<your-domain>/auth/confirm`
  - `https://<your-domain>/auth/reset-password`
  - (keep the `http://localhost:3000/...` variants for local dev)

### 1.2 Auth → Providers → Google
Enable Google, paste the Google Cloud OAuth **client id + secret**, and add
Supabase's callback URL to the Google console's authorized redirect URIs.

### 1.3 Auth → Email Templates  (+ Resend SMTP)
- **Confirm signup** link → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
- **Reset password** link → `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`
- Paste the Arabic HTML from `src/lib/email/templates/{confirm-signup,reset-password}.ts`.
- Point Supabase at **Resend SMTP** (`smtp.resend.com:465`, user `resend`,
  password = your `RESEND_API_KEY`). Full guide: `docs/email-setup.md`.

### 1.4 Auth → Security settings (see `rafraf_security.md`, Layer 3)
- Confirm email = **ON**
- Minimum password length = **10** (the app's meter additionally requires ≥12)
- **Leaked‑password protection (HIBP) = ON** (the one remaining advisor finding)
- JWT expiry = **3600s**, refresh‑token rotation = **ON**

### 1.5 Auth → Hooks
Enable the **Custom Access Token Hook** → `public.custom_access_token_hook`
(mints the `user_role` claim from `merchants.role`). Required for the stateless
API‑key / superadmin JWT fast‑path (Phase 11).

### 1.6 Make yourself superadmin
```sql
update merchants set role = 'superadmin' where id = '<your-auth-uid>';
```
(In production this is the `rafraf.business@gmail.com` account.)

### 1.7 (Optional) Low‑stock Database Webhook
Database → Webhooks → on `products` **UPDATE** → POST to
`https://<your-domain>/api/webhooks/low-stock` with header
`x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>`.

---

## 2. Optional third‑party services

| Service | What it powers | Setup |
|---|---|---|
| **Google Sheets/Drive** | Nightly backups (`/api/cron/*`) | Create a service account; create the master sheet manually and share it (Editor) with the SA email; `node scripts/create-master-sheet.mjs` to verify. Consumer SAs have **0 Drive storage** — use a Shared Drive (`RAFRAF_SHARED_DRIVE_ID`) for per‑merchant auto‑sheets. |
| **Telegram** (primary alerts) | Merchant + admin notifications | Create a bot via @BotFather; set the env vars; after deploy run `node scripts/set-telegram-webhook.mjs`. See `docs/telegram-bot-setup.md`. |
| **WhatsApp** (Green API) | Customer debt reminders, fallback | Optional. Set `GREEN_API_*`. |
| **Upstash Redis** | Rate limiting (login, AI gate, `/api/v1`) | Create a Redis DB; copy the REST URL + token. Fail‑open until set. |
| **Cloudinary** | Product images + store logo | Optional, signed uploads. See `docs/cloudinary-setup.md`. |
| **Resend** | Welcome email + Supabase auth SMTP | Verify a sending domain. |
| **Anthropic** | AI layer (Phase 12) | **Placeholder** — endpoints return mock data until wired in `lib/ai/claude.ts`. |

---

## 3. Vercel deploy

1. **Import** the repo in Vercel (framework auto‑detected as Next.js — no build
   overrides needed; `npm run build` / output `.next`).
2. **Environment Variables** → add every variable you need from §5 (Production
   scope; add Preview too if you use preview deploys). At minimum the **Core**
   group. **Never** paste secrets anywhere but Vercel's env settings.
3. **Deploy.**
4. **Cron jobs** are auto‑registered from `vercel.json` (backup 02:00, master 03:00,
   keepalive every 5 days 04:00, notify 05:00 UTC). Vercel automatically sends your
   `CRON_SECRET` as `Authorization: Bearer …` on cron requests — so just set
   `CRON_SECRET` and the routes authorize themselves. (Cron requires a Pro plan for
   sub‑daily, but these are daily‑ish and fine on Hobby for testing.)
5. **After the first deploy** (you now know the prod URL):
   - Update Supabase **Site URL + Redirect URLs** (§1.1) to the prod domain.
   - Set `ADMIN_SECRET_PATH` (a long random string — the admin lives at
     `/<that value>`) and `ADMIN_ALLOWED_IPS` (your office/home IPs).
   - Create + share the Google **master sheet**, set `RAFRAF_MASTER_SHEET_ID`.
   - Register the Telegram webhook against the prod URL
     (`node scripts/set-telegram-webhook.mjs`).
   - Connect each merchant's Telegram chat id in **Settings** (DM the bot `/start`).
   - **Redeploy** after changing env (middleware reads env at startup).

---

## 4. Post‑deploy verification

- [ ] Sign up → confirm email → log in (Google + email/password).
- [ ] Complete store setup → dashboard shows live stats.
- [ ] Add a product, record a sale, go offline (DevTools → Offline), record, then
      reconnect → it syncs (no duplicate).
- [ ] Admin reachable **only** at `/<ADMIN_SECRET_PATH>`; `/rafraf-admin` → 404; a
      non‑superadmin is bounced to `/dashboard`.
- [ ] Hit a cron once (with the bearer) and confirm a `backup_logs` row:
      `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/keepalive`
- [ ] `get_advisors` (Supabase, security) is clean except the HIBP toggle.
- [ ] Browser console has **no CSP violations** (login, scan, sell, print, offline reload).

---

## 5. Environment variable reference

`Core` = app won't work without it. `Admin` = needed to reach the admin + run
crons. `Optional` = the feature is a no‑op until set. Only `NEXT_PUBLIC_*` reach
the browser. Template: `.env.example`.

| Variable | Tier | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Core | Supabase project URL (public). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Core | Supabase anon key (public; RLS protects data). |
| `SUPABASE_SERVICE_ROLE_KEY` | Core | Service role key — **server only**, bypasses RLS (admin, backups, security logging, public API). |
| `CRON_SECRET` | Admin | Bearer secret for `/api/cron/*`. Vercel sends it automatically on cron requests. |
| `ADMIN_SECRET_PATH` | Admin | The unguessable admin URL segment. Empty ⇒ admin unreachable. |
| `ADMIN_ALLOWED_IPS` | Admin | Comma‑separated IP allowlist for the admin. Empty ⇒ IP layer skipped. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional | Backup service account email (trim whitespace!). |
| `GOOGLE_PRIVATE_KEY` | Optional | Backup SA private key (PEM; `\n` literal newlines). |
| `RAFRAF_MASTER_SHEET_ID` | Optional | Admin rollup sheet id (created + shared manually). |
| `RAFRAF_SHARED_DRIVE_ID` | Optional | Shared Drive id for per‑merchant auto‑sheets. |
| `TELEGRAM_BOT_TOKEN` | Optional | @BotFather token (primary notifications). |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Secret echoed by Telegram to `/api/telegram/webhook`. |
| `RAFRAF_ADMIN_CHAT_ID` | Optional | Admin Telegram chat id (failure alerts). |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Optional | Bot username (no `@`) for the Settings "open bot" link. |
| `GREEN_API_ID_INSTANCE` | Optional | WhatsApp (Green API) instance id. |
| `GREEN_API_TOKEN` | Optional | WhatsApp (Green API) token. |
| `GREEN_API_BASE_URL` | Optional | Green API host override (defaults to api.green-api.com). |
| `RAFRAF_ADMIN_PHONE` | Optional | Admin WhatsApp number (no `+`) — alert fallback. |
| `WHATSAPP_WEBHOOK_SECRET` | Optional | Header secret for the low‑stock DB webhook. |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash REST URL (rate limiting). |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash REST token. |
| `RESEND_API_KEY` | Optional | Resend API key (welcome email + auth SMTP password). |
| `EMAIL_FROM` | Optional | Verified sender, e.g. `RafRaf <noreply@yourdomain.com>`. |
| `CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API secret — **server only** (signs uploads). |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Optional | Cloud name (public) for building delivery URLs. |
| `ANTHROPIC_API_KEY` | Optional | Claude API key (AI layer — placeholder until wired). |

> `NODE_ENV` is set by Vercel automatically — do not set it yourself.

---

## 6. Notes & gotchas

- **`.env.local` is git‑ignored** and never committed — production values live only
  in Vercel's env settings.
- **Changing `ADMIN_SECRET_PATH` / `ADMIN_ALLOWED_IPS` requires a redeploy** (the
  Edge middleware reads them at startup).
- **Strict nonce CSP** is set per‑request in middleware; don't add inline scripts or
  external script/font CDNs — they'll be blocked. Icons are inline SVG; fonts are
  self‑hosted via `next/font` (marketing) or a system stack (app).
- **Service worker** is disabled in dev and registered by `ServiceWorkerRegister`
  in prod (so it's nonce‑trusted).
- **Google private key**: paste with literal `\n` between PEM lines; a stray tab on
  the email breaks the JWT with `invalid_grant`.
