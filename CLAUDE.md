# RafRaf (رف رف) — Engineering Guide for Claude Code

> The digital shelf for every Syrian and Arab merchant — a bilingual, offline-first,
> multi-tenant inventory SaaS. **Nothing gets lost. Everything is visible. The app
> works even when the internet doesn't.**

This file is the working contract for building RafRaf. Read it before any change.
The full product/security/build specs live in:

- `rafraf_business_and_product.md` — what we're building and why
- `rafraf_security.md` — the seven security layers (non-negotiable)
- `rafraf_claudecode_build_prompt.md` — the phase-by-phase build plan + data model

---

## Non-negotiable principles

1. **Multi-tenant isolation is sacred.** Every table gets RLS. No merchant ever sees
   another merchant's data. Verify with two accounts before a feature is "done".
2. **Default deny.** Lock every table/endpoint; grant the minimum.
3. **Offline-first.** Every write goes to IndexedDB (Dexie) first, then syncs.
4. **Financial integrity.** A sale and its stock decrement are atomic (DB RPC).
5. **Secrets never reach the client.** Only `NEXT_PUBLIC_*` vars touch the browser.
   The `service_role` key and Google private key are server-only.
6. **Bilingual, Arabic-first.** Full Arabic (RTL) + English (LTR); Arabic is default.

---

## Tech stack

| Layer        | Choice                                          |
| ------------ | ----------------------------------------------- |
| Framework    | Next.js 15 (App Router) as a PWA, TypeScript    |
| Styling      | Plain CSS Modules (no Tailwind), RTL-aware      |
| Auth         | Supabase Auth (Google OAuth + email/password)   |
| Database     | Supabase (PostgreSQL + JSONB custom fields)     |
| Realtime     | Supabase Realtime                               |
| Offline      | Dexie.js (IndexedDB) + service worker           |
| PWA          | `@ducanh2912/next-pwa`                          |
| Validation   | zod (on every write)                            |
| Rate limit   | `@upstash/ratelimit` + `@upstash/redis`         |
| Backup       | `googleapis` (Sheets + Drive) via service acct  |
| Messaging    | Green API (WhatsApp)                            |
| Email        | Resend (API for welcome; SMTP for Supabase auth mail) |
| Images       | Cloudinary — signed uploads; WebP/optimize/resize at delivery |
| AI (Phase 12)| Anthropic Claude API — **placeholder/stub**, smart-plan gated |
| Hosting      | Vercel (frontend) + Supabase (backend)          |

> **PWA note:** the build spec said `next-pwa`, but that package doesn't support the
> App Router on Next 15. We use the maintained fork `@ducanh2912/next-pwa`, which is a
> drop-in for App Router. The service worker is disabled in development.

---

## Project structure

```
src/
  app/
    layout.tsx          # Root layout — sets <html lang/dir> from the locale cookie
    globals.css         # CSS variables (brand, surfaces, type), light/dark
    (marketing)/        # Public landing (/) + /developers — own dark layout, no app
                        #   chrome. BILINGUAL via the `landing`/`devPage` dict keys
                        #   (ar.json source of truth). layout.tsx self-hosts Plex
                        #   Arabic+Inter (next/font), generateMetadata() + dir follow
                        #   the locale; page.tsx (landing), developers/page.tsx (public
                        #   API page: hero/quick-start curl/endpoints table/plan limits/
                        #   CTA→/login), landing.module.css + developers/*.module.css,
                        #   icons.tsx (inline SVG — Material Symbols is CSP-blocked),
                        #   LangPill.tsx (AR/EN via setLocale — flips landing copy too)
    login/              # /login — Google + email/password (LoginForm is client)
    setup/              # /setup — store-setup wizard (SetupWizard is client)
    dashboard/          # /dashboard — protected. Thin server shell (auth gate +
                        #   merchant ctx + dict) → DashboardView (client): dark-glass
                        #   Stitch design, offline-first LIVE data from Dexie via
                        #   computeReport(today) — sales/stock/debt stats, action grid
                        #   (all routes incl. mobile-credit + sham-cash), recent
                        #   activity, low-stock alerts, SyncStatus, mobile bottom-nav.
                        #   icons.tsx = inline SVG (Material Symbols is CSP-blocked)
    auth/
      callback/route.ts # OAuth PKCE code exchange
      confirm/route.ts  # email token_hash verification
  components/
    LanguageSwitcher.tsx / .module.css   # client; AR/EN toggle via server action
  i18n/
    config.ts           # locales, defaultLocale='ar', direction map, cookie name
    locale.ts           # getCurrentLocale() — reads the locale cookie (server)
    get-dictionary.ts   # getDictionary(locale) — code-split JSON, typed
    actions.ts          # "use server" setLocale() — writes cookie + revalidate
    dictionaries/
      ar.json           # Arabic = source of truth for the Dictionary type
      en.json
  lib/
    supabase/
      client.ts         # browser client (anon key) — RLS-protected
      server.ts         # server SSR client bound to auth cookies (anon key)
      admin.ts          # service-role client — BYPASSES RLS, server-only
      middleware.ts     # updateSession() — refresh auth, rotate cookies, return user
    auth/
      actions.ts        # "use server" sign in/up/out + Google OAuth
      merchant.ts       # getUser(), getMerchant(), touchLastActive() (server-only)
    merchant/
      actions.ts        # "use server" createStore() — inserts the merchant row
    backup/
      sheets.ts         # createMerchantBackupSheet() — STUB until Phase 7
    validation/
      auth.ts           # zod: sign-in / sign-up (min password 10)
      merchant.ts       # zod: store setup; BUSINESS_TYPES, CURRENCIES
  middleware.ts         # session refresh + auth route gating
public/
  manifest.json         # PWA manifest (Arabic-first, dir=rtl)
  icons/icon.svg        # app icon (shelf motif)
  sw.js, workbox-*.js   # generated at build, git-ignored
```

`@/*` is aliased to `src/*` (see `tsconfig.json`).

---

## i18n model (cookie-based, not URL-based)

- Arabic is the default. Locale is stored in the `rafraf_locale` cookie.
- `getCurrentLocale()` resolves it server-side; the root layout sets `<html lang dir>`
  accordingly, so RTL/LTR flips automatically.
- `getDictionary(locale)` returns a typed dictionary; `ar.json` defines the type.
- `LanguageSwitcher` (and the landing `LangPill`) call the `setLocale` server action,
  which sets the cookie and `revalidatePath("/", "layout")` (whole tree — every route
  reads the locale, incl. the bilingual marketing pages) — no client routing, works
  fine inside the PWA.
- **Add new copy** to BOTH `ar.json` and `en.json` (same keys). Arabic first.

## Supabase clients — which to use where

| File        | Key            | RLS    | Use in                                        |
| ----------- | -------------- | ------ | --------------------------------------------- |
| `client.ts` | anon (public)  | applies| Client Components                             |
| `server.ts` | anon (public)  | applies| Server Components, Route Handlers, Actions    |
| `admin.ts`  | service_role   | **bypasses** | Cron/backups, admin ops, security logging — NEVER import client-side |

`admin.ts` and `server.ts` are guarded with `import "server-only"`, so importing them
into a client component is a build error.

---

## Conventions

- TypeScript everywhere. CSS Modules only; use **logical properties**
  (`margin-inline`, `padding-inline`, `border-inline-start`) so RTL/LTR both work.
- **Dark-glass design system (app-wide UI).** Every screen is dark, on‑brand, and
  mobile‑first. Each page's root (`.main`/`.page`) **re‑maps the app theme vars** to
  the dark palette so descendants + shared components (LanguageSwitcher, SyncStatus,
  password meter) go dark regardless of system theme: `--bg:#0b1326`, `--surface:#171f33`,
  `--text:#dae2fd`, `--text-muted:#bbcabf`, `--border:#3c4a42`, `--brand/--primary:#4edea3`
  (`--primary-container:#10b981`, `--on-primary-container:#00422b`), `--secondary:#ffb95f`,
  `--error:#ffb4ab`; font `"IBM Plex Sans Arabic"`. **Material Symbols / external font
  CDNs are CSP‑blocked → use inline SVG icons.** Two shared CSS backbones carry the
  system across most pages: **`components/transactions.module.css`** (sell/buy/returns/
  expenses/mobile‑credit/sham‑cash/customers/suppliers/transactions/reports + their
  components — exposes list primitives `addBtn`/`searchField`/`avatar`/`txLead`, the
  ledger badge palettes, `txIn`/`txOut`) and **`app/products/product-form.module.css`**
  (product/customer/supplier new+edit forms). Inputs are **16px** (no iOS zoom);
  centered‑column pages add a full‑viewport dark backdrop (or full‑width `.main`) so
  there are no light gutters on desktop; on ≤480px cards go **full‑bleed** (no card
  chrome). Auth pages (`login.module.css`), dashboard, and the landing each keep their
  own scoped palette of the same tokens.
- Never trust client-provided `merchant_id` — always derive from the session
  (`auth.uid()`), both in app code and in RLS policies.
- Every write: validate with zod, check session/role, then touch the DB.
- Keep components small and composable; the frontend only talks to the Supabase
  client / API, never to secrets.

## Commands

```bash
npm run dev        # local dev (SW disabled)
npm run build      # production build (also runs typecheck + lint)
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

---

## Environment

`.env.local` holds real values and is git-ignored from the first commit;
`.env.example` is the committed template. Public Supabase URL + anon key are filled
in. **`SUPABASE_SERVICE_ROLE_KEY` is a placeholder** — paste it from
Supabase Dashboard → Project Settings → API before any server/admin/backup work.
All Google/WhatsApp/Upstash/admin-IP vars are placeholders for their respective phases.

Supabase project ref: `yepxrcoobtjlyjbvvloh` (connected via MCP).

---

## Database

Migrations are applied via the Supabase MCP (`apply_migration`). Tables so far:

- **`merchants`** — one row per store owner (tenant). PK `id` = `auth.users.id`
  (FK, `on delete cascade`), so a user can only ever own the row matching their
  session. RLS enabled; policies `merchant_select_own` / `_insert_own` /
  `_update_own` all key on `id = auth.uid()`. No DELETE policy (default deny).
  Also carries `google_sheet_id`/`_url` (Phase 7 backup) and
  `notify_channel` (`telegram`|`whatsapp`|`off`, CHECK) + `telegram_chat_id`
  (Phase 8 notifications) — the owner edits the latter via Settings.
- **`products`** — per-merchant inventory (`merchant_id` FK → `merchants.id`,
  `on delete cascade`). Prices/stock are `NUMERIC` with `>= 0` CHECKs;
  `custom_fields JSONB` holds business-type-specific fields. RLS enabled; the
  owner gets full CRUD via four policies `products_select_own` / `_insert_own` /
  `_update_own` / `_delete_own`, all keyed on `merchant_id = auth.uid()` (DELETE
  is allowed here — merchants manage their own catalog). `updated_at` is bumped
  by the `products_set_updated_at` trigger (shared `public.set_updated_at()`,
  `search_path` pinned empty). Indexes: `(merchant_id, created_at DESC)`,
  `(merchant_id, category)`, `(merchant_id, barcode)`.
- **`transactions`** — append-only per-merchant ledger (`merchant_id` FK,
  `on delete cascade`; `product_id` FK `on delete set null` + denormalized
  `product_name` so history survives product deletion). Types: `sell` / `buy` /
  `return_customer` / `return_supplier` / `expense`. **RLS is SELECT + INSERT
  only — no UPDATE/DELETE** (financial integrity; corrections are new rows).
  `client_uuid` (partial-unique per merchant) is the offline dedup key;
  `group_uuid` ties multi-item cart lines into one invoice. Indexes:
  `(merchant_id, created_at DESC)`, `(merchant_id, type)`, `(product_id)`,
  partial `(merchant_id, group_uuid)`, unique partial `(merchant_id, client_uuid)`.
  Writes go through the **`record_transaction(...)` RPC** (and the `record_sale`
  wrapper): atomic stock adjustment + ledger insert, **idempotent on
  `client_uuid`**, `SECURITY INVOKER` (RLS scopes everything; advisor-clean),
  `EXECUTE` granted to `authenticated` only. Stock may go negative — overselling
  is a UI "soft block" (Arabic confirm), not a DB constraint.
  **Phase 5 extended it:** added types `debt_payment` / `supplier_payment`, a
  `paid NUMERIC` column (amount received now; debt = `total − paid`), and FKs
  `customer_id`/`supplier_id` → `customers`/`suppliers` (`on delete set null`).
  ⚠️ A new ledger type must be added in **two** places that are easy to desync:
  the table's `transactions_type_check` CHECK **and** the RPC's internal
  `p_type NOT IN (...)` guard (all **nine** types live in both now).
  The RPC now **atomically moves the party balance** too (idempotency check runs
  *before* any stock/debt side-effect, so a retried sync never double-counts):
  `sell`/`buy` add the unpaid remainder to `debt_balance`/`balance_owed`, returns
  subtract, and `debt_payment`/`supplier_payment` settle them.
  **Service types** `mobile_credit` (📱 وحدات) + `sham_cash` (💸 شام كاش) are
  **money-only** (no stock, no party) — added to the CHECK + the RPC's guard +
  money-only branch only. They **reuse existing columns** (no new column, no RPC
  signature change): `total` = headline (amount_sold / total_syp); `price`/`qty`/
  `product_name` carry cost/rate / amount_usd / provider-key; **profit** = `total−price`
  and **commission** = `total−qty×price` are derived. Reports roll them up as
  **service income** (`computeReport` → `serviceIncome`/`serviceRevenue`); offline via
  `recordMobileCredit`/`recordShamCash` (money-only, in `moneyOnly()` in sync.ts).
- **`customers`** — per-merchant (`merchant_id` FK → `merchants.id`,
  `on delete cascade`). Profile (`name`/`phone`/`neighborhood`) is client-owned;
  **`debt_balance NUMERIC` is server-owned — only the RPC writes it** (+ = the
  customer owes the store; may go negative = store owes them). RLS = full owner
  CRUD (4 policies on `merchant_id = auth.uid()`); `customers_set_updated_at`
  trigger; index `(merchant_id, created_at DESC)`.
- **`suppliers`** — same shape (`payment_terms` instead of `neighborhood`);
  server-owned **`balance_owed NUMERIC`** (+ = store owes the supplier). RLS = full
  owner CRUD; trigger + index like `customers`.
- **`backup_logs`** (Phase 7) — audit trail for backup runs (`scope`
  merchant/master/keepalive, `triggered_by`, `status`, `error`, `rows_backed`).
  **Admin-only:** RLS on, a single `SELECT` policy keyed on **`public.is_superadmin()`**
  (Phase 10; was the never-true raw JWT claim), no insert/update/delete policy —
  writes happen only through the service-role client (which bypasses RLS);
  anon/authenticated can't read it.
- **`security_logs`** (Phase 9) — security event log (`type`, `severity`
  low/med/high, `details` JSONB, `ip`, `user_id`). Same admin-only RLS shape as
  `backup_logs` (`is_superadmin()` `SELECT` only; service-role writes). Powers
  login lockout (counts recent `FAILED_LOGIN`) + high-severity Telegram alerts.
- **`admin_logs`** (Phase 10) — superadmin action audit (`action`, `actor_id`,
  `actor_email`, `target_merchant_id` FK → merchants `on delete set null`,
  `details` JSONB, `ip`). Records plan changes, impersonation start/stop,
  broadcasts, manual backup runs. Same admin-only RLS shape (`is_superadmin()`
  `SELECT`; service-role writes via `logAdminAction`).
- **`api_keys`** (Phase 10 schema; **generation + auth live in Phase 11**) —
  per-merchant hashed keys (`key_hash` = SHA-256 hex of the `rafraf_…` token, unique
  index for O(1) lookup; display `prefix`; `scopes[]`; `revoked`; `last_used_at`;
  `label`). **Owner-scoped** RLS (full CRUD on `merchant_id = auth.uid()`); the
  plaintext token is shown once at creation, only the hash is stored. Powers the
  public API (see **Public API** below).
- **`business_types`** (admin-managed, **global config — not per-merchant**) —
  `slug` (unique; the value stored in `merchants.business_type`), `name_ar`/`name_en`,
  `custom_fields` JSONB (`[{key,type,label_ar,label_en}]`), `active`, `sort`. RLS:
  **SELECT to `authenticated`** (every merchant reads it for the setup dropdown +
  product custom-field labels); **writes via service role only** (superadmin admin
  actions — no write policy). Replaces the old hardcoded `BUSINESS_TYPES` +
  `CUSTOM_FIELDS_BY_BUSINESS_TYPE`; seeded with the original 5 types. Read via
  `lib/business-types/read.ts` (`getActiveBusinessTypes`/`getBusinessTypeBySlug`/
  `resolveCustomFields`); managed at `/rafraf-admin/business-types`. `createStore`
  validates the chosen slug against active rows.

> The project has an event trigger `rls_auto_enable()` (from the Supabase agent
> skill) that auto-enables RLS on any new `public` table — a safety net for the
> "RLS on every table" rule. EXECUTE is revoked from API roles. Still write
> explicit policies for every new table; auto-enabling RLS with no policy =
> deny-all, which would silently break a feature.

Run `get_advisors` (security) after every migration — currently clean.

## Auth flow

- `lib/auth/actions.ts` — server actions: `signInWithPassword`, `signUpWithPassword`
  (email confirmation via `/auth/confirm`), `signInWithGoogle`, `signOut`.
  Actions return i18n **error codes**, not strings; the client maps them.
- `app/auth/callback/route.ts` — OAuth PKCE code exchange.
- `app/auth/confirm/route.ts` — email `token_hash` verification.
- `lib/auth/merchant.ts` — `getUser()`, `getMerchant()` (the merchantId/plan/role
  the session "carries", derived server-side, never trusted from the client),
  `touchLastActive()`.
- Gating: `middleware.ts` redirects unauthenticated users off `/dashboard` + `/setup`
  and authenticated users off `/login`. The "needs setup?" decision is made in the
  page components (they already read the merchant row) — no per-request DB hit.

Routes: `/login` → `/setup` (first time) → `/dashboard`.

**Forgot/reset password** (client-side, browser Supabase client; no server actions):
`/login` has a "نسيت كلمة المرور؟" link → **`/forgot-password`** (`resetPasswordForEmail`,
generic success so emails can't be enumerated) → email link → **`/auth/reset-password`**
(verifies `token_hash`/`code`/implicit-hash on mount → recovery session → password
strength meter + confirm → `updateUser` → `/dashboard`). Both are public routes (not in
`PROTECTED_PREFIXES`). Needs the manual Supabase steps above (redirect URL + recovery
email template).

---

## Supabase configuration — MANUAL steps required

These live in the Supabase Dashboard / Auth settings, not in code. Do them before
testing auth end-to-end:

1. **URLs** (Auth → URL Configuration): Site URL `http://localhost:3000` (dev);
   add Redirect URLs `http://localhost:3000/auth/callback`,
   `http://localhost:3000/auth/confirm`, and `http://localhost:3000/auth/reset-password`
   (+ the production equivalents later).
2. **Google OAuth** (Auth → Providers → Google): enable, paste Google Cloud OAuth
   client id/secret; add the Supabase callback URL to the Google console.
3. **Email templates** (Auth → Email Templates):
   - **Confirm signup:** point the link at
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` so the
     SSR confirm route works.
   - **Reset password:** point the link at
     `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`
     so the forgot-password flow (`/forgot-password` → email → `/auth/reset-password`)
     works cross-device. (The page also accepts `?code=` (PKCE) and the implicit hash
     as fallbacks, so the default template still works same-browser.)
   - **Arabic content + SMTP:** the Arabic HTML + subjects for both live in
     `src/lib/email/templates/{confirm-signup,reset-password}.ts` (paste into the
     dashboard). Point Supabase at **Resend SMTP** (`smtp.resend.com:465`, user
     `resend`, pass = `RESEND_API_KEY`) so these send via Resend — full guide in
     `docs/email-setup.md`.
4. **Security settings** (rafraf_security.md, Layer 3): Confirm email = ON;
   min password length = 10; leaked-password protection (HIBP) = ON; JWT expiry =
   3600s; refresh-token rotation = ON; (2FA optional, owner accounts).
   Login lockout (5 attempts / 15 min) is implemented in app code in a later phase.

Until #1–#3 are done, email/Google sign-in won't complete the round-trip, but the
UI, validation, and merchant creation are all in place.

---

## Offline engine (Phase 3)

Products are **offline-first**: the UI reads/writes IndexedDB (Dexie) and a sync
engine reconciles with Supabase. There are **no server actions for product
writes** — the browser Supabase client writes directly and **RLS is the security
boundary** (`merchant_id = auth.uid()`), with zod validating on the client.

- `lib/offline/db.ts` — Dexie DB `rafraf` via lazy singleton `getDb()` (never
  constructed during SSR). `products` store mirrors every server column + local
  metadata (`_sync`, `_op`, `_deleted`, `_base_updated_at`); `conflicts` store
  logs resolved conflicts. v2 adds the `transactions` ledger; **v3 adds
  `customers`/`suppliers`** (profile client-owned, balance server-owned, same
  `_sync`/`_op`/`_deleted` metadata as products) and indexes the ledger's
  `customer_id`/`supplier_id` for the per-party statement. **v4 adds
  `product_images`** (Blobs of product images picked offline / after a failed
  foreground upload, awaiting Cloudinary upload on sync); the `products` mirror also
  gained `image_public_id`. `clearLocalData()` deletes the DB (logout) — so
  customers/suppliers/pending image blobs are wiped too.
- `lib/offline/products-repo.ts` — write-to-IndexedDB-first CRUD. New products get
  a **client-generated UUID** = the idempotency key, so a retried upsert can't
  double-insert (no `client_uuid` column needed for products; transactions will
  use one in Phase 4). Edits preserve columns the form doesn't touch.
- `lib/offline/sync.ts` — products: `pushPending` (upsert/delete) + `pullProducts`
  (reconcile, **last-write-wins by `updated_at`** vs stored `_base_updated_at`;
  server changes to locally-pending rows logged to `conflicts`; server-side
  deletions drop local synced rows). Ledger: `pushPendingTransactions` (via the
  `record_transaction` RPC, idempotent on `client_uuid`, now passing
  `customer_id`/`supplier_id`/`paid`) + `pullTransactions` (immutable, bounded).
  Parties: `pushPendingCustomers`/`pushPendingSuppliers` (upsert **omits the
  balance** — server-owned) + `pullCustomers`/`pullSuppliers` (LWW on the profile,
  **always adopt the server balance** even for a pending row — same contract as
  product stock). **`syncAll`** is the single serialized entry, ordered:
  push customers → push suppliers → push ledger → push products → pull customers →
  pull suppliers → pull products → pull ledger. (Parties push *before* the ledger
  so a credit row's FK resolves; balances pull *after* the ledger push so the
  RPC's authoritative balance isn't clobbered by a stale pull.)
- `lib/offline/transactions-repo.ts` — write-to-IndexedDB-first ledger:
  `recordSale` (one `group_uuid`, a row per cart line, **optimistic** stock
  decrement NOT marked pending — server delta owned by the RPC; on a credit/partial
  sale it also optimistically bumps the customer's debt and spreads `paid` across
  lines so the per-row server deltas sum correctly), `recordTransaction`
  (buy/return/expense, with optional supplier/customer + `paid`),
  `recordDebtPayment`/`recordSupplierPayment` (money-only settlement rows), plus
  `getCustomerLedger`/`getSupplierLedger` and `customerDebtStart` (debt-aging
  anchor). Keyed by `client_uuid`; server `id` filled on sync.
- `lib/offline/customers-repo.ts` / `suppliers-repo.ts` — products-style CRUD
  (`saveCustomer`/`saveSupplier`, `delete*Local`, `getLocal*`) whose
  `managedFields` **exclude the balance**, plus `bumpDebt`/`bumpOwed` (optimistic,
  not-pending balance nudges the RPC reconciles).
- `lib/offline/useSync.ts` — `useSync()` runs `syncAll` on mount + on `online`;
  returns `{ online, syncing, sync }`. Used by every products + transactions view.
- UI: `app/products/ProductsView.tsx` (live Dexie reads via `dexie-react-hooks`
  `useLiveQuery`, client-side search/filter/paginate, `SyncStatus`, conflicts
  banner) and `EditProductView.tsx` (loads from Dexie, pulls on mount). The
  `/products*` pages are thin server shells that gate auth + pass merchant/dict.
- **Logout wipes IndexedDB** (`components/SignOutButton.tsx`) so the next user on
  the device can't see cached inventory.
- **Offline-tolerant auth** (`lib/supabase/session.ts`): `getSessionUser()` keeps
  the session alive from the stored JWT when the Auth server is *unreachable*
  (`isOfflineError` → network/0/5xx), instead of logging out; only a real 401/403
  clears it. Used by `middleware.ts` and `getUser()`. `getMerchantContext()`
  likewise returns `offline` vs `none`, so the products pages stay usable offline
  (merchant id falls back to `auth.uid()`, since `merchants.id === auth.uid()`)
  and the dashboard/setup fall back to `/products` rather than bouncing to login.

> Adding a new offline entity (e.g. transactions, Phase 4): mirror this layout —
> a Dexie store with `_sync`/`_op` metadata, a repo that writes locally first, and
> push/pull in the sync engine. Use `client_uuid` for entities whose server id is
> **not** client-generated (e.g. the `record_sale` RPC). For a **server-owned
> derived field** (product `stock`, customer `debt_balance`, supplier
> `balance_owed`): never include it in the client upsert, always take the server's
> value on pull, and mutate it only through an atomic, idempotent RPC — the local
> copy is updated optimistically (not-pending) and reconciled on the next pull.
>
> Phase 5 UI mirrors products: `/customers` + `/suppliers` list views (live Dexie
> reads, debt/owed totals), `/{customers,suppliers}/new` forms, and
> `/{customers,suppliers}/[id]` profiles (balance, debt **aging**, record-payment
> modal, `wa.me` reminder, statement, edit, delete). `components/PartyPicker.tsx`
> (search + quick-add by name) links a customer to `/sell` and a supplier to
> `/buy` (with payment method + "paid now" for credit/partial); returns link the
> matching party.

---

## Backups (Phase 7 — Google Sheets)

Server-only (`lib/backup/*`, every file `import "server-only"`); the Google
private key + service-role key never reach the client. Auth is a service-account
JWT (`google.ts`, scopes spreadsheets + drive; **env values are trimmed** — a
stray tab on the email breaks the JWT with `invalid_grant: account not found`).
Cross-tenant reads go through the service-role admin client.

- **Per-merchant** (`sheets.ts`): `backupMerchant` overwrites the المنتجات +
  المعاملات tabs (idempotent snapshot), appends one ملخص يومي row per day, and
  rewrites تنبيهات (low-stock + debtors). `backupAllMerchants` loops, logging each
  merchant's failure and continuing.
- **Master** (`master.ts`): `updateMasterSheet` rebuilds the admin-only rollup
  (Overview, All Merchants, All Products, All Transactions, Failed Backups,
  Revenue Tracker) by overwrite (idempotent).
- **Cron** (`app/api/cron/{backup,master,keepalive}/route.ts`, `runtime=nodejs`):
  GET gated by `authorizeCron` (Bearer `CRON_SECRET`); `vercel.json` schedules
  02:00 / 03:00 / every-5-days UTC. Every run writes `backup_logs`; WhatsApp
  failure alerts arrive in Phase 8.

> ⚠️ **Service-account Drive limit:** a *consumer* (non-Workspace) service account
> has **0 Drive storage**, so it CANNOT create spreadsheets (403 "caller does not
> have permission") — it can only *edit* sheets shared with it. So: create the
> **master sheet manually** (`sheets.new` → Share → Editor → the
> `GOOGLE_SERVICE_ACCOUNT_EMAIL`), set `RAFRAF_MASTER_SHEET_ID`, and run
> `node scripts/create-master-sheet.mjs` to verify + seed it. Per-merchant
> auto-creation only works with a **Shared Drive** (`RAFRAF_SHARED_DRIVE_ID`);
> otherwise it degrades to null and the master sheet — which already holds every
> merchant's products + transactions — is the complete backup.

## Messaging (Phase 8 — Telegram primary, WhatsApp secondary)

Multi-channel, server-only (`lib/messaging/*`, every file `import "server-only"`).
Each merchant picks a channel in **Settings → Notifications** — `notify_channel`
= `telegram` | `whatsapp` | `off` (default `telegram`), with `telegram_chat_id`.
`dispatch.ts` routes: `notifyMerchant(merchant, text)` → the merchant's channel;
`notifyAdmin(text)` → Telegram (`RAFRAF_ADMIN_CHAT_ID`) then WhatsApp fallback.

- **Telegram** (`telegram.ts`, PRIMARY — free, no approval): `sendTelegram(chatId,
  text)`. `app/api/telegram/webhook` replies to `/start` with the chat id so a
  merchant self-serves it into Settings. Register once with
  `scripts/set-telegram-webhook.mjs`; full guide in `docs/telegram-bot-setup.md`.
- **WhatsApp** (`whatsapp.ts`, SECONDARY — Green API): `sendWhatsApp(phone, text)`.
- **Templates** (`messages.ts`, short Arabic) + **`summary.ts`** are
  channel-agnostic (COGS from current `cost_price`, like the reports).
- **Nightly summary** — `app/api/cron/notify` (CRON_SECRET, 05:00 UTC): each
  merchant gets yesterday's summary on their channel.
- **Instant low-stock** — `app/api/webhooks/low-stock` (Supabase DB webhook on
  products UPDATE, header `x-webhook-secret`): alerts on the downward crossing,
  on the merchant's channel (stock moves via the RPC on sync).
- **Owner-triggered debt reminder** — `lib/messaging/actions.ts sendDebtReminder`
  (RLS-scoped). Customer-facing, so it uses **WhatsApp** (a phone); the Phase 5
  `wa.me` button is the no-creds manual fallback. Telegram can't message an
  arbitrary customer (they'd have to start the bot), so it isn't used here.
- **Backup-failure admin alert** — master/backup crons call `notifyAdmin`.

> Setup (`docs/telegram-bot-setup.md`): `TELEGRAM_BOT_TOKEN`,
> `TELEGRAM_WEBHOOK_SECRET`, `RAFRAF_ADMIN_CHAT_ID`,
> `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`; WhatsApp (`GREEN_API_*`) optional. **No new
> table** — `merchants` gained `notify_channel` + `telegram_chat_id` (advisors
> clean). Crons + webhook fire once deployed.

## Security hardening (Phase 9 — the seven layers)

See `rafraf_security.md`. State of the layers:

- **L1 Database (RLS):** every merchant table isolated on `merchant_id =
  auth.uid()`. **Verified** by the two-account isolation test (two real tenants
  each see only their own rows; a stranger sees 0; `WITH CHECK` rejects planting a
  row as another tenant — `ERROR 42501`).
- **L2 API:** rate limiting (`lib/security/ratelimit.ts`, Upstash, **no-op until
  `UPSTASH_*` set**, fail-open) — enforced in **Node**: the `signInWithPassword`
  action (per IP), the AI gate (per merchant), and the `/api/v1` per-key limiter.
  **Deliberately NOT in the Edge middleware** — `@upstash/redis`'s Node build uses
  `process.version`, which the Edge runtime lacks (it warned + bloated the bundle).
  zod on
  every write (auth, setup, settings, products, customers, suppliers, **and
  transactions** via `saleInputSchema`/`transactionInputSchema`/
  `settlementInputSchema`); DB (RLS + CHECKs + the RPC) is the server backstop.
  **XSS layer**, *split for Edge safety:* `lib/validation/sanitize.ts` is
  **regex-only** (`NO_TAGS`/`PHONE_RE`/`BARCODE_RE`, `safeDisplay`, `escapeHtml`) —
  safe to import anywhere, **including middleware**; `lib/validation/sanitize-html.ts`
  holds the DOMPurify `sanitizeString` (isomorphic — runs in browser + Node, **never
  the Edge runtime**, and **not** `server-only` since the product/transaction schemas
  validate client-side / offline). ⚠️ **Nothing reachable from `middleware.ts` may
  import `sanitize-html`** — isomorphic-dompurify throws in Edge (`reading 'bind'`).
  The live Edge chain is middleware→`security/events`→`messaging/dispatch`→
  `messaging/whatsapp`→`validation/customer`, and `customer.ts` needs only the regex
  module. Schemas reject tags (`NO_TAGS`) + run free-text through `sanitizeString`;
  DB CHECK constraints reject `<…>`; the raw-HTML sinks (`Receipt`, `ReportsView`
  PDF) use `escapeHtml(sanitizeString())`; list views use `safeDisplay()`. Layers:
  zod/whitelist → DOMPurify → DB CHECK → React escape.
- **L3 Auth:** **login lockout** — `signInWithPassword` counts `FAILED_LOGIN` for
  the email over 15 min; ≥5 → `LOGIN_LOCKOUT` (Telegram) + `{error:"locked"}`.
  Dashboard Auth toggles (confirm-email, min-10, JWT 1h, refresh rotation, **HIBP
  leaked-password**) are manual — HIBP is the lone remaining advisor finding.
- **L4 Detection:** `lib/security/events.ts logSecurityEvent` → `security_logs`
  (service role) + **high-severity → Telegram admin alert** (`notifyAdmin`).
- **L5 Transport/headers:** static headers in `next.config.mjs` (HSTS, X-Frame
  DENY, nosniff, Referrer-Policy, Permissions-Policy camera=self). **Strict nonce
  CSP** (`lib/security/csp.ts`) set per-request in middleware: `script-src 'self'
  'nonce-…' 'strict-dynamic'` (no unsafe-inline), prod-strict / dev-relaxed. The
  nonce is threaded onto the forwarded request headers in `updateSession` so Next
  nonces every script. **PWA SW** registers from a bundled client component
  (`ServiceWorkerRegister`, next-pwa `register:false`) so it's nonce-trusted;
  **print windows** call `print()` from the opener (an inline `<script>` would be
  CSP-blocked).
- **L6 Secrets:** `import "server-only"`; only `NEXT_PUBLIC_*` reach the browser;
  `.env.local` git-ignored.
- **L7 Admin path:** **DONE (Phase 10)** — triple-protected in middleware (auth +
  superadmin role + IP allowlist via `ADMIN_ALLOWED_IPS`), denials logged as
  `ADMIN_ACCESS_DENIED` (high → Telegram). Superadmin dashboard built (see **Admin
  dashboard** below). `api_keys` generation + request auth are live — see **Public
  API (Phase 11)**. **The public URL is unguessable:** the admin mounts at
  `/$ADMIN_SECRET_PATH` (env), and middleware **rewrites** it to the physical route
  `/rafraf-admin` — which itself **404s from outside**. Unset `ADMIN_SECRET_PATH` ⇒
  admin unreachable (safe default). All admin URLs derive from
  `lib/security/admin-path.ts` (`adminPublicBase`/`adminPath`, Edge-safe); the only
  reference to the physical mount is `ADMIN_INTERNAL_BASE` there. Server components
  call `adminPath()`; client widgets (`AdminNav`, `MerchantsTable`) get the base as
  a prop. Verified: secret path → gate (→ `/login` unauth), `/rafraf-admin` → 404,
  blank env → secret path 404.

> The `superadmin` check is now real. `public.is_superadmin()` (SECURITY INVOKER,
> search_path pinned) is the single source of truth used by the admin-only
> policies: it returns true if the JWT `user_role` claim is `superadmin` **OR** the
> caller's own `merchants.role` is `superadmin`. The DB fallback means it works
> **today** without any dashboard toggle — just set a merchant's role (see manual
> steps). The JWT fast-path is fed by `public.custom_access_token_hook` (mints the
> `user_role` claim from `merchants.role`); **enabling that hook in Auth → Hooks is
> optional now, required before Phase 11** (stateless API-key checks). The app gate
> (`requireSuperadmin()` / middleware `readMerchantRole`) reads `merchants.role`
> directly, so it's authoritative regardless of the hook.

## Admin dashboard (Phase 10 — superadmin only)

Online-only, **triple-protected** (see L7). Reachable only at the unguessable
`/$ADMIN_SECRET_PATH` (middleware rewrites → physical `/rafraf-admin`, which 404s
directly). Cross-tenant reads use the **service-role admin client** (after the
gate), so the admin never relies on the superadmin JWT claim to function — same
pattern as the Phase 7 backups.

- **Gate.** `middleware.ts` 404s any direct hit on `/rafraf-admin`, then on the
  secret path runs: auth → `readMerchantRole` (`lib/supabase/middleware.ts`,
  Edge-safe) → `isAdminIpAllowed` (`lib/security/admin-ip.ts`; **empty
  `ADMIN_ALLOWED_IPS` skips the IP layer** so it's reachable in dev) → on pass,
  `NextResponse.rewrite` to `ADMIN_INTERNAL_BASE` (carrying the CSP-nonce request
  headers + rotated auth cookies). Each denial logs `ADMIN_ACCESS_DENIED`.
  `lib/security/admin.ts` (server-only): `getAdminUser()`/`requireSuperadmin()`
  (defense-in-depth guard re-run in the layout **and** every page/action) +
  `logAdminAction()` (service-role write to `admin_logs`, best-effort).
- **Data.** `lib/admin/queries.ts` (server-only, service role): `getOverview`
  (merchant/active/product/tx counts + sales/purchases/expenses sums + outstanding
  debt/owed), `listMerchants`/`getMerchant`/`getMerchantDetail`, `getBackupStatuses`
  (latest per-merchant `backup_logs` + failures), `getSecurityLogs`/`getAdminLogs`,
  `getSystemHealth` (DB ping + config presence: Google/master sheet/Telegram/
  WhatsApp/Upstash/allowlist + last backup).
- **Actions.** `app/rafraf-admin/actions.ts` (`"use server"`, each re-verifies
  superadmin + writes `admin_logs`): `changePlan`, `updateBilling` (mark-paid +
  notes, sanitized), `startImpersonation`/`stopImpersonation`, `runMerchantBackup`/
  `runAllBackups`/`runMasterUpdate` (reuse `lib/backup/*`), `broadcast` (announce to
  all merchants via `notifyMerchant`).
- **Pages** (server shells + small client widgets in `controls.tsx`/`AdminNav.tsx`/
  `merchants/MerchantsTable.tsx`): `/rafraf-admin` overview + system health;
  `/merchants` table (search, plan/role); `/merchants/[id]` read-only **view-as**
  (stats, plan control, billing, recent ledger); `/backups` control center;
  `/security` event + admin-action feeds; `/announcements` broadcast. The merchant
  dashboard has **no admin link** — to avoid leaking the secret path into the
  dashboard HTML, the superadmin reaches the admin only via the direct
  `/$ADMIN_SECRET_PATH` URL (bookmark).
- **Impersonation is read-only by design.** "View as" sets a flag cookie
  (`rafraf_impersonate`, httpOnly, 1h) + logs start/stop + shows a banner; it does
  **not** mint the merchant's session, so nothing destructive can run as them. Full
  session impersonation was deliberately not built (security).

## Public API (Phase 11 — `/api/v1/*`, key-authed)

Versioned REST API for external systems, authed by a per-merchant API key
(`Authorization: Bearer rafraf_…`). Server-to-server only (no CORS). Full reference:
`docs/public-api.md`. `runtime = "nodejs"` on every route (crypto + service role).

- **Keys** (`lib/api/keys.ts`): token = `rafraf_<48 hex>`; store SHA-256 hash +
  display prefix only. Generated/revoked by the owner in **Settings → API keys**
  (`app/settings/ApiKeysSection.tsx` + `api-keys-actions.ts`, via the **SSR client**
  so owner RLS applies). Plaintext shown **once**. Scopes: a key is read-only
  (`*:read`) or read-write (all six `products|transactions|customers :read|write`).
  > **Architecture note:** API keys live in **merchant Settings** — there is **no
  > separate developer account** (a proposed `account_type` split was considered and
  > **cancelled**). In Settings the section is **hidden behind a "Show API keys"
  > toggle** (`ApiKeysDisclosure.tsx`, default collapsed; `settings.apiKeys.show/hide`)
  > so keys aren't on screen by default — RLS/scoping unchanged.
- **Gate** (`lib/api/{auth,handler}.ts`): `apiGate(req, scope)` at the top of every
  handler → authenticate (hash → unique-index lookup, service role) → **per-key/plan
  rate limit** (`apiRateLimit`, free 60 / basic 300 / smart 1000 per min, no-op until
  Upstash set) → scope check. Returns the principal or a JSON error. `/api/v1` is
  excluded from the middleware IP limiter (per-key is authoritative).
- **Tenant isolation** (the critical bit): an API-key request has no Supabase session,
  so `auth.uid()` is null and native RLS can't key on it. **All DB access goes through
  `lib/api/db.ts`**, which uses the service-role client but pins **every** query to the
  key's `merchantId` — the single chokepoint. Writes never read `merchant_id` from the
  body. **Atomic transaction writes reuse the tested `record_transaction` RPC via
  `public.api_record_transaction(p_merchant_id, …)`** — a `SECURITY DEFINER` wrapper
  (EXECUTE = `service_role` only) that sets the JWT-claims GUC so the inner RPC records
  AS that merchant (zero logic duplication; stays atomic + idempotent on `client_uuid`).
- **Endpoints:** products (list/create/get/patch/delete), transactions (list/create),
  customers (list/create/get), inventory/alerts (low-stock), `/api/v1` info.
- Errors: `{error:{code,message}}` with 400/401/403/404/422/429. Reuses
  `productSchema`/`customerSchema` + `lib/api/schemas.ts` (transaction body, paging).
- **Deferred:** outbound webhooks, OpenAPI/Swagger UI, granular per-resource scopes.

## AI layer (Phase 12 — placeholder, smart-plan only)

**No real Claude calls yet** — structure + UI only, so the AI surface can ship gated
and be wired later. Session-authed (the in-app dashboard calls it), gated to
`merchants.plan === "smart"`.

- `lib/ai/guard.ts` — `requireSmart()` (derives plan from the session merchant; 401
  unauth / 403 `smart_plan_required`) + `aiGateError`. `lib/ai/stub.ts` — Arabic mock
  data (reorder / dead-stock / forecast / chat reply). `lib/ai/claude.ts` — the future
  Anthropic call site (`askClaude` stub, `isAiConfigured`).
- Endpoints (`/api/ai/*`, `runtime=nodejs`, every response `placeholder:true`):
  `reorder-suggestions`, `dead-stock`, `forecast` (GET), `chat` (POST, Arabic).
- UI: `/ai` (smart-only page; non-smart → redirect `/dashboard`) renders the stubs via
  `AiView` + an Arabic chat box; the **dashboard AI section** shows a locked badge +
  "قريباً — الباقة الذكية" for free/basic and an "open" link for smart.
- To go live: implement `lib/ai/claude.ts` (set `ANTHROPIC_API_KEY`) and swap the
  `stub.ts` calls for real logic (rule-based first), keeping `requireSmart`.

## Images (Cloudinary — optional, signed, offline-first)

Optional product images + store logo. Images never block saving. The
`CLOUDINARY_API_SECRET` is **server-only**; uploads are **signed direct uploads** (the
browser uploads to Cloudinary with a server-generated signature). No-op everywhere
until `CLOUDINARY_*` is set. Setup: `docs/cloudinary-setup.md`.

- **Lib:** `lib/cloudinary/server.ts` (server-only — `signUpload`/`destroyImage`; SDK
  in `serverExternalPackages`), `lib/cloudinary/actions.ts` (`createUploadSignature`,
  `deleteImage`, `updateStoreLogo` — auth-checked, all assets scoped to
  `rafraf/<merchantId>/…` so the signature/delete can't touch another tenant),
  `lib/cloudinary/upload-client.ts` (browser XHR `uploadSigned` + progress,
  `buildDeliveryUrl` = `f_auto,q_auto,c_limit,w/h`, `validateImage` 2MB + image type).
- **Product image (offline-first):** picked online → foreground upload with a % bar →
  `setProductImage` + old asset destroyed; picked offline / on failure → blob stashed
  in `product_images` and uploaded on sync by **`pushPendingProductImages`** (which sets
  `image_url`/`image_public_id`, destroys the old asset, drops the blob). `ProductForm`
  (picker/preview/remove), `ProductsView` (thumbnail + "pending" badge). Products 800px.
- **Store logo:** `app/settings/LogoUpload.tsx` — foreground signed upload (% bar) →
  `updateStoreLogo` (saves `logo_url`/`logo_public_id`, destroys old). Online-only
  (the merchant row isn't in the offline store). Logo 200px.
- **DB:** `products.image_public_id` + `merchants.logo_public_id` (the URLs already
  existed). Delivery transform serves WebP/optimized/resized; the original is stored.

## Status & roadmap

**Phase 0 — DONE.** Scaffold, RTL, Supabase clients, i18n, PWA.

**Phase 1 — DONE (code):** `merchants` table + RLS; Google + email/password auth
with confirm/callback routes; bilingual login + store-setup wizard; merchant
creation (id from `auth.uid()`, Google Sheet creation stubbed for Phase 7);
auth route gating + dashboard showing store/plan/role/currency. Build passes,
security advisors clean. **Pending: the manual Supabase config above + the
two-account RLS isolation test** (do this once two accounts exist).

**Phase 2 — DONE (code):** `products` table + RLS (full owner CRUD); product
list at `/products` (search by name/name_en/barcode, category filter, 20/page
pagination, low-stock & out-of-stock badges); add/edit at `/products/new` and
`/products/[id]/edit` with a shared `ProductForm` whose **custom fields adapt to
`business_type`** (config in `lib/validation/product.ts` → `custom_fields` JSONB);
camera **barcode scanning** via `@zxing/browser` (reusable `components/BarcodeScanner`,
lazy-loaded, environment-facing) + auto-generate barcode; delete on the edit page;
dashboard CTA → products; `/products` added to protected routes. Build passes,
typecheck clean, security advisors clean. **Not yet done (intentionally, later
phases):** CSV/Excel import + bulk edit/variants (rest of Phase 2 scope, deferred),
and the **two-account RLS isolation test** (needs two real accounts).

**Phase 3 — DONE (code):** offline engine for products (see **Offline engine**
above). Dexie mirror + write-to-IndexedDB-first repo; push/pull sync via the
browser client with idempotent upserts (client-generated id) and tombstone
deletes; `online`/`offline` listeners + background sync on reconnect; LWW
conflict resolution with an owner-facing conflicts banner; **IndexedDB cleared on
logout**. Products UI converted to client/live-query reads (works fully offline);
old product server actions/queries removed. Build passes, typecheck clean
(no schema change → advisors unaffected). **Test offline behavior in the browser**
(DevTools → Network → Offline): add/edit/delete while offline, then reconnect and
watch it sync. **Still pending:** two-account RLS isolation test (needs two real
accounts).

**Phase 4 — DONE (code):** `transactions` ledger + `record_transaction`/`record_sale`
RPCs (atomic stock + ledger, idempotent on `client_uuid`, `SECURITY INVOKER`,
advisors clean). Offline-first like Phase 3 (Dexie `transactions` store v2,
`transactions-repo`, `syncAll`/`useSync`). UI: **quick sell** at `/sell`
(scan/search → multi-item cart → discount/payment → **soft-block Arabic confirm
when stock ≤ 0** → record with `group_uuid` → printable + `wa.me` receipt);
`/buy` (stock-in), `/returns` (customer/supplier), `/expenses` (categorized),
`/transactions` history (live, type filters, grouped invoices); dashboard CTAs +
all routes protected. Build passes, typecheck + security advisors clean. **Test:**
record a sale (incl. an out-of-stock soft-block), then buy/return/expense; verify
stock moves and the receipt; offline → record → reconnect → syncs (dedup holds).
**Still pending:** two-account RLS isolation test (needs two real accounts).

**Phase 5 — DONE (code):** `customers` + `suppliers` tables (RLS full owner CRUD,
`set_updated_at` triggers, indexes) with **server-owned** `debt_balance` /
`balance_owed`; `transactions` gained `paid` + `customer_id`/`supplier_id` FKs
(`on delete set null`); **`record_transaction` extended** to move party balances
atomically + idempotently and to accept `debt_payment` / `supplier_payment`
(advisors clean — RPC stays `SECURITY INVOKER`, `EXECUTE` to `authenticated`
only). Offline-first like Phase 3/4 (Dexie v3 `customers`/`suppliers` stores,
`customers-repo`/`suppliers-repo`, party push/pull in `syncAll`, balance always
taken from server). UI: `/customers` + `/suppliers` lists (debt/owed totals,
search), `/{…}/new` forms, `/{…}/[id]` profiles (balance, **debt aging**,
record-payment full/partial, `wa.me` reminder, statement, edit, delete);
**sell-on-credit** (customer + "paid now" in `/sell`, soft hint if credit w/o a
customer), supplier-on-credit + payment method in `/buy`, party links on
`/returns`; `debt_payment`/`supplier_payment` rows show in `/transactions` (new
"payments" filter); dashboard CTAs + routes protected. Build passes, typecheck +
security advisors clean. **Test:** sell on credit to a customer → their debt
rises; record a partial/full payment → it falls (+ a `debt_payment` row); buy on
credit from a supplier → balance owed rises, pay it down; WhatsApp reminder
opens; offline → record → reconnect → balances reconcile (no double-count).
**Still pending:** two-account RLS isolation test (needs two real accounts).

**Phase 6 — DONE (code):** reports at `/reports` — **no DB changes**, pure
client-side aggregation over the already-synced Dexie data (transactions +
products + customers + suppliers), so it works fully offline. `lib/reports/
compute.ts` (`computeReport`/`presetRange`/`customRange`) is a pure module
returning a `ReportSummary`; `ReportsView.tsx` renders it. Period presets
(today / 7d / 30d / custom date range) + summary cards (sales, purchases,
expenses, COGS, gross/net profit, margin %, cash in/out/flow, invoice count,
items sold, debt collected), a CSS sales-trend bar chart, best/worst sellers,
expense breakdown, supplier spend, top debtors + low stock (current snapshots),
and **PDF (print-window) + Excel (CSV, UTF-8 BOM) export** — all dependency-free.
Dashboard CTA + route protected. Build passes, typecheck clean, advisors
unaffected (no migration). **Notes:** COGS uses the product's *current*
`cost_price` (no historical cost lots); figures cover data synced to the device
(the ledger pull is bounded to recent history). **Test:** record some sales/buys/
expenses, switch periods, check net profit / cash flow / top sellers, export PDF
+ Excel. **Still pending:** two-account RLS isolation test (needs two accounts).

**Phase 7 — DONE (code):** Google Sheets backup — see **Backups** above.
`backup_logs` table (admin-only RLS; advisors clean). Server-only `lib/backup/*`
(service-account JWT, trimmed env), per-merchant + master backup, three
`CRON_SECRET`-gated cron routes + `vercel.json` schedules, signup sheet
provisioning wired (real `createMerchantBackupSheet`). Build + typecheck clean.
**Discovered + handled:** the consumer service account has **0 Drive storage**
so it can't create sheets — code degrades gracefully + supports a Shared Drive;
`scripts/create-master-sheet.mjs` creates/verifies the master sheet.
**Pending (user/manual):** create + share the master sheet → set
`RAFRAF_MASTER_SHEET_ID`; set `CRON_SECRET`; then verify a backup run
(`node scripts/create-master-sheet.mjs`, and hit `/api/cron/*` with the bearer).
Deploy to Vercel for the schedules to fire. Two-account RLS isolation test still
pending.

**Phase 8 — DONE (code):** notifications — **Telegram primary, WhatsApp
secondary**, merchant-selectable in Settings (see **Messaging** above). Migration
added `merchants.notify_channel` + `telegram_chat_id` (advisors clean). Channel
abstraction `lib/messaging/*` (`telegram.ts`, `whatsapp.ts`, `dispatch.ts`,
`messages.ts`, `summary.ts`, `actions.ts`); nightly summary cron (`/api/cron/
notify`), low-stock webhook, Telegram bot webhook (`/start` → chat id),
owner-triggered debt reminder, backup-failure admin alerts; `/settings` page +
`updateNotificationSettings` action; `scripts/set-telegram-webhook.mjs` +
`docs/telegram-bot-setup.md`. Build + typecheck clean. **Pending (user/manual):**
create the bot (@BotFather) → set `TELEGRAM_BOT_TOKEN` etc., deploy, run the
set-webhook script, connect each merchant's chat id in Settings; (optional) wire
the Supabase low-stock webhook; WhatsApp `GREEN_API_*` optional. Two-account RLS
isolation test still pending.

**Phase 9 — DONE (code):** security hardening — see **Security hardening** above.
`security_logs` table (advisors clean). **Strict nonce CSP** (prod) via middleware
+ static headers; PWA SW + print windows fixed for it. Login lockout + security
event logging + Telegram alerts; Upstash IP rate limiting (no-op until configured);
zod on transaction writes. **Two-account RLS isolation test PASSED** (read + write
isolation, all four merchant tables) — the long-standing pending item is now
cleared. Build + typecheck clean. **Pending (user/manual):** enable **HIBP
leaked-password protection** in the Supabase Auth dashboard (the only remaining
advisor finding); set `UPSTASH_*` to activate rate limiting; **browser-smoke the
strict CSP** in a prod build (login, barcode scan, sell, print receipt, offline
reload) and tell me if any directive trips.

**Between Phase 9 & 10 — DONE (code):** XSS / input-sanitization layer. Installed
`isomorphic-dompurify`; `lib/validation/sanitize.ts` (`sanitizeString` =
DOMPurify-strip→decode plain text, `safeDisplay` = cheap per-render tag strip,
`escapeHtml`, `NO_TAGS`/`PHONE_RE`/`BARCODE_RE`). Applied across all zod schemas
(names `NO_TAGS`, free-text `sanitizeString`, phone/barcode formats) + a DB CHECK
constraints migration (`phase9_input_hardening_constraints`, advisors clean) +
hardened the two raw-HTML sinks (`Receipt.tsx`, `ReportsView.tsx` PDF) with
`escapeHtml(sanitizeString(...))` + `safeDisplay()` in list views/pickers. Four
layers: zod/whitelist → DOMPurify → DB CHECK → React escape (+ CSP nonce). Also a
manual **password strength checker** (`lib/validation/password.ts` +
`PasswordStrengthMeter`, 4 levels, blocks < جيد, client+server, on signup +
`/settings` change-password). Build green.

**Phase 10 — DONE (code):** RafRaf Admin dashboard — see **Admin dashboard** +
**L7** above. Migration `phase10_admin` (+ `_advisor_fixes`): `public.is_superadmin()`
(SECURITY INVOKER, JWT claim OR `merchants.role`), `custom_access_token_hook`
(mints `user_role` claim), re-pointed `backup_logs`/`security_logs` policies at it,
new `admin_logs` + `api_keys` tables, `merchants.billing_notes`/`last_paid_at`.
Middleware triple-protection (`ADMIN_ACCESS_DENIED` logging), `lib/security/admin*`
+ `lib/admin/queries.ts` + `app/rafraf-admin/*` (overview/health, merchants table,
read-only view-as, **dynamic business-types CRUD**, backup control center,
security+admin-log feeds, broadcast),
bilingual `admin` dict, superadmin-gated dashboard link. Build + typecheck clean,
**security advisors clean (only HIBP)**. **Admin RLS verified per-table:** a normal
owner sees 0 / `is_superadmin()`=false; a superadmin sees the rows / =true, across
`security_logs` + `admin_logs` + `backup_logs`. **Pending (user/manual):** (1) set
your superadmin — `UPDATE merchants SET role='superadmin' WHERE id='<your-auth-uid>'`;
(2) set `ADMIN_SECRET_PATH` (the unguessable admin URL — in `.env.local` + Vercel;
restart/redeploy after changing) and `ADMIN_ALLOWED_IPS` (prod) — empty = IP layer
skipped; (3) optional now / needed for Phase 11: enable the **Custom Access Token
Hook** in Auth → Hooks; then browse `/$ADMIN_SECRET_PATH` and try plan change /
run-backup / broadcast. (In dev `ADMIN_SECRET_PATH=r9x7k2mq8p3control`.)

**Phase 11 — DONE (code + verified):** Public API — see **Public API** above.
Migration `phase11_public_api` (api_keys `label` + unique `key_hash` index;
`api_record_transaction` SECURITY DEFINER wrapper, service_role-only; advisors clean).
`lib/api/*` (keys/auth/handler/db/schemas/respond), `app/api/v1/**` endpoints,
per-key/per-plan rate limit, middleware excludes `/api/v1` from the IP limiter,
Settings → API keys UI (generate-once + revoke), bilingual `settings.apiKeys`,
`docs/public-api.md`. Build + typecheck clean. **Live-tested end-to-end** (prod build,
real key): no-key→401, bogus→401, revoked→403, read-only key on write→403
forbidden_scope; list returns only the key's tenant (isolation: merchant B's rows
absent); create→201; **sale twice w/ same `client_uuid` → stock −1 once (atomic +
idempotent over HTTP)**; low-stock + delete OK. All test data cleaned up.
**Pending (user/manual):** set `UPSTASH_*` to activate the per-key rate limit
(fail-open until then); keys are managed by each merchant in Settings.

**Phase 12 — DONE (code, placeholder):** AI layer scaffolding — **mock data only, no
Claude calls**. `lib/ai/{guard,stub,claude}.ts`: `requireSmart()` gates to the smart
plan (session-derived → 401/403); `stub.ts` returns Arabic mock reorder / dead-stock /
forecast / chat; `claude.ts` is the documented Anthropic integration point
(`askClaude` stub + `isAiConfigured`). Endpoints `/api/ai/{reorder-suggestions,
dead-stock,forecast}` (GET) + `/api/ai/chat` (POST, Arabic) — all smart-gated, return
`placeholder:true`. UI: `/ai` smart-only workspace (`AiView` fetches the stubs +
Arabic chat) + a dashboard **AI section** (locked badge + "قريباً — الباقة الذكية" for
free/basic; "open" link for smart). `ANTHROPIC_API_KEY` placeholder in `.env.example`.
Build + typecheck clean (no DB change). **When the AI API is provided:** wire
`lib/ai/claude.ts` + replace the stubs (rule-based reorder first, then Claude), keeping
the smart gate.

Next: remaining polish from the build prompt (Phase 2's deferred CSV/Excel product
import + bulk edit/variants; launch-checklist items). All 12 planned phases are now
scaffolded. Build phases strictly in order; confirm each works before moving on.
