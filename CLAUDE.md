# RafRaf (رف رف) — Engineering Guide for Claude Code

> Bilingual, offline-first, multi-tenant inventory SaaS for Syrian/Arab merchants.
> Full specs: `rafraf_business_and_product.md`, `rafraf_security.md`,
> `rafraf_claudecode_build_prompt.md`.

## Stack
- **Framework:** Next.js 15 (App Router) PWA, TypeScript
- **Styling:** CSS Modules (no Tailwind), RTL-aware logical properties
- **Design:** light/blue "banking" theme — navy `#1E3A8A`, surfaces `#FFF`/`#faf8ff`,
  text `#131b2e`, font "IBM Plex Sans Arabic". Mobile-first. Inline SVG icons only.
- **Auth:** Supabase Auth (Google OAuth + email/password)
- **DB:** Supabase (Postgres + JSONB custom fields), Realtime
- **Offline:** Dexie.js (IndexedDB) + service worker (`@ducanh2912/next-pwa`)
- **Validation:** zod (every write) · **Rate limit:** Upstash (no-op until configured)
- **Backup:** googleapis (Sheets/Drive, service acct) · **Messaging:** Telegram Bot API
- **Email:** Resend · **Images:** Cloudinary (signed) · **AI:** Anthropic (stub, smart-plan)
- **Hosting:** Vercel + Supabase. Project ref `yepxrcoobtjlyjbvvloh` (MCP). `@/*` → `src/*`.

## Database Tables
All RLS-enabled, keyed on `merchant_id = auth.uid()` (or `id = auth.uid()` for merchants).
Migrations via Supabase MCP `apply_migration`; run `get_advisors` after each.
- **merchants** — tenant row, PK `id` = `auth.users.id`. Owner SELECT/INSERT/UPDATE (no DELETE).
  Carries `google_sheet_id/_url`, `notify_channel`/`telegram_chat_id`, `offers_mobile_credit`,
  `logo_url/_public_id`, `role`, `plan`, `billing_notes`/`last_paid_at`, `business_type`.
- **products** — per-merchant inventory; full owner CRUD; `custom_fields` JSONB; `image_*`.
- **transactions** — append-only ledger, SELECT+INSERT only (corrections = new rows).
  10 types: sell/buy/return_customer/return_supplier/expense/debt_payment/supplier_payment/
  mobile_credit/sham_cash/sham_cash_void. `client_uuid` dedup, `group_uuid` invoice.
  Writes via `record_transaction` RPC (atomic stock+ledger+balance, idempotent, SECURITY INVOKER).
- **customers** / **suppliers** — full owner CRUD; server-owned `debt_balance`/`balance_owed`
  (RPC-only); `telegram_chat_id` (customers).
- **business_types** — global config (SELECT to authenticated, service-role writes).
- **api_keys** — per-merchant hashed keys (owner CRUD); powers `/api/v1`.
- **backup_logs** / **security_logs** / **admin_logs** — admin-only (`is_superadmin()` SELECT,
  service-role writes).

## Key Rules
**Non-negotiable:** (1) Multi-tenant isolation is sacred — never trust client `merchant_id`,
derive from `auth.uid()` in app + RLS. (2) Default deny. (3) Offline-first: every write → IndexedDB
first, then sync. (4) Financial integrity: sale + stock decrement atomic via RPC. (5) Secrets
server-only — only `NEXT_PUBLIC_*` reach the browser; `import "server-only"` on `admin.ts`/`server.ts`
+ all `lib/{backup,messaging,cloudinary}/*` server files. (6) Bilingual Arabic-first — add copy to
BOTH `ar.json` (source of truth) + `en.json`.

**Every write:** validate with zod → check session/role → touch DB. DB (RLS + CHECKs + RPC) is the backstop.

**Supabase clients:** `client.ts` (anon, RLS, client components) · `server.ts` (anon, RLS, server/actions)
· `admin.ts` (service_role, BYPASSES RLS, server-only — cron/backups/admin/logging).

**i18n:** cookie-based (`rafraf_locale`, default `ar`). `getCurrentLocale()` server-side sets
`<html lang dir>`. `setLocale` action sets cookie + revalidates whole tree.

**Offline engine:** `lib/offline/` — Dexie `getDb()` (lazy, never SSR), repos write IndexedDB-first,
`sync.ts` push/pull (LWW by `updated_at`), `syncAll` is the serialized entry. Order matters: push
customers→suppliers→ledger→products, then pull customers→suppliers→products→ledger. `useSync()`
runs on mount + `online`. Logout wipes IndexedDB. Offline-tolerant auth keeps session on network
errors (only real 401/403 logs out).
- **Server-owned derived fields** (stock, debt_balance, balance_owed): never in client upsert,
  always take server value on pull, mutate only via atomic idempotent RPC (optimistic local copy).
- New offline entity: Dexie store w/ `_sync`/`_op`/`_deleted` metadata + repo + push/pull. Use
  `client_uuid` when server id isn't client-generated.

**⚠️ CSP / build gotchas (hard-won — don't regress):**
- Strict nonce CSP (`script-src 'self' 'nonce' 'strict-dynamic'`, `font-src 'self'`). **No inline
  scripts.** Material Symbols + external font CDNs blocked → **inline SVG icons**. SW registers via
  bundled `ServiceWorkerRegister`; print windows call `print()` from the opener.
- **Keep `lib/validation/sanitize-html.ts` (DOMPurify/isomorphic-dompurify) OUT of every import
  chain** except its two raw-HTML sinks (`components/Receipt`, `app/reports/ReportsView`) — jsdom
  crashes the Edge runtime AND the Vercel server bundle. Use regex-only `sanitize.ts` (`sanitizeText`/
  `safeDisplay`/`escapeHtml`) everywhere else. Build check: `grep -rl jsdom .next/server/app` must
  list ONLY `sell/page.js` + `reports/page.js`.
- **New ledger type → add in BOTH** the `transactions_type_check` CHECK **and** the RPC's
  `p_type NOT IN (...)` guard.
- **Service account = 0 Drive storage** (consumer): can't create sheets, only edit shared ones.
  Master sheet created manually + shared with `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- Upstash rate-limit/cache: **no-op + fail-open** until `UPSTASH_*` set (`lib/security/ratelimit.ts`
  + `lib/cache/redis.ts` `withCache`/`invalidateCache`). Both Node-only — **never import either into
  the Edge middleware** (`@upstash/redis` needs `process.version`).
- Admin path: `/$ADMIN_SECRET_PATH` middleware-rewrites → physical `/rafraf-admin` (404s directly).
  Unset env ⇒ admin unreachable. Triple-protected: auth + superadmin role + IP allowlist.

**Commands:** `npm run dev` (SW off) · `npm run build` (typecheck+lint) · `npm run typecheck`.

## Environment Variables
`.env.local` (real, git-ignored) / `.env.example` (template). All server-only unless `NEXT_PUBLIC_`.
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Google backup:** `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `RAFRAF_MASTER_SHEET_ID`,
  `RAFRAF_SHARED_DRIVE_ID` (env values trimmed)
- **Cron:** `CRON_SECRET`, `LOW_STOCK_WEBHOOK_SECRET`
- **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `RAFRAF_ADMIN_CHAT_ID`,
  `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- **Rate limit/cache:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Admin:** `ADMIN_SECRET_PATH`, `ADMIN_ALLOWED_IPS` (empty = IP layer skipped)
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`
- **Images:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **AI:** `ANTHROPIC_API_KEY` (placeholder) · **Misc:** `NEXT_PUBLIC_SITE_URL`

## Current Status
**Phases 0–12 all DONE (code).** Scaffold/RTL/i18n/PWA · auth + merchants · products + barcode scan ·
offline engine · transactions ledger + RPC · customers/suppliers + debt · reports · Google Sheets
backup · Telegram notifications · security hardening (7 layers, strict CSP, login lockout, XSS) ·
admin dashboard · public API `/api/v1` (verified) · AI stub (smart-plan gated).
- **Two-account RLS isolation test PASSED.** Security advisors clean (only HIBP pending).
- **Public landing** `(marketing)/` + `/developers` (bilingual, own theme).
- **UX polish:** Resend forgot-password, spinners, `BackButton`, password eye, oversell warning +
  Telegram alert, Telegram chat-id copy, sequential invoice # + `/transactions/[id]`, PDF/Excel export,
  multi-currency per merchant (`merchant_currencies` + tx `currency`/`exchange_rate`), shared `PageHeader`
  + global `BottomNav`.
- **Offline PWA hardening:** SW precaches all 18 static app routes + runtime caching (CacheFirst
  static/fonts/images, NetworkFirst API, SWR navigations, **SWR `rsc-cache` for App Router `_rsc`
  payloads** — client-side nav fetches are mode "cors", not "navigate", so they need their own rule
  or offline nav throws `ERR_INTERNET_DISCONNECTED`); global yellow `OfflineBanner`. Offline auth is
  cookie-JWT based (`getSessionUser` keeps the session on network errors; only 401/403 logs out).
- **Backup admin UX:** admin merchant detail links/tests/runs a sheet + status badge (reuses
  `merchants.google_sheet_id`); backups overview gains a Sheet-ID column + failed-only filter; merchant
  Settings backup card (status + last-run + request-via-Telegram → admin); nightly cron skips unlinked
  merchants and sends the admin a daily digest. No migration (column reused).
- **Redis cache** (`lib/cache/redis.ts`, fail-open): `business_types` (1h) + `merchant:{id}` (5m),
  invalidated by their writers. Dashboard stats + low-stock are client-side (Dexie); plans are static
  constants — neither has a server query to cache.

## Todo Next
**Pending (user/manual):** Supabase Dashboard config (URLs, Google OAuth, email templates, HIBP,
JWT/lockout settings); set superadmin role; set `ADMIN_SECRET_PATH`/`ADMIN_ALLOWED_IPS`; enable Custom
Access Token Hook; create+share master sheet; create Telegram bot + run set-webhook; set `UPSTASH_*`.

**Deferred (needs sign-off):** Phase 2 CSV/Excel import + bulk edit/variants; client QR + send-invoice-
to-customer; AI go-live (wire `lib/ai/claude.ts`).
