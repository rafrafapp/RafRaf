# Telegram Bot setup (RafRaf notifications)

RafRaf's **primary** notification channel is a Telegram bot — free, official, and
no approval/business verification needed. WhatsApp (Green API) is an optional
secondary channel a merchant can pick later in **Settings → Notifications**.

What Telegram delivers: the **merchant's own** alerts — nightly daily summary,
instant low-stock alert, and (to the admin) backup-failure alerts. Customer debt
reminders stay on the WhatsApp `wa.me` link, because Telegram can only message a
person who has first started your bot.

---

## 1. Create the bot (2 minutes)

1. In Telegram, open **@BotFather** → send `/newbot`.
2. Give it a name (e.g. `RafRaf Notifications`) and a username ending in `bot`
   (e.g. `rafraf_alerts_bot`).
3. BotFather replies with an **HTTP API token** like
   `1234567890:AAH...`. Copy it.

## 2. Add the token to the app

In `.env.local` (and in your Vercel project env):

```
TELEGRAM_BOT_TOKEN=1234567890:AAH...
TELEGRAM_WEBHOOK_SECRET=<any long random string you choose>
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=rafraf_alerts_bot   # the @username, without @
```

## 3. Register the webhook (so the bot can reply with chat ids)

Deploy the app (the webhook must be a public HTTPS URL), then run:

```
node scripts/set-telegram-webhook.mjs https://your-app.vercel.app
```

This points Telegram at `/api/telegram/webhook` and sets the secret token. You
should see `{"ok":true,...}`.

## 4. Each merchant connects their Telegram

1. Open the bot (`https://t.me/<bot-username>`) and tap **Start**.
2. The bot replies with their **Chat ID** (a number).
3. In RafRaf: **Settings → Notifications** → choose **Telegram**, paste the Chat
   ID, **Save**.

For **admin** backup alerts, DM the bot `/start` from the admin account and put
that chat id in `RAFRAF_ADMIN_CHAT_ID`.

## 5. (Optional) Instant low-stock alerts

In the Supabase dashboard → **Database → Webhooks**, add a webhook on
`public.products` **UPDATE** → POST to
`https://your-app.vercel.app/api/webhooks/low-stock` with header
`x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>`. It fires (on the merchant's chosen
channel) the moment stock crosses below the alert threshold during a sale's sync.

---

## Test

- **Chat id:** DM the bot `/start` → it replies with your id.
- **Nightly summary (locally):**
  `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/notify`
  → merchants on Telegram with a saved chat id get yesterday's summary.
- The Vercel crons (`/api/cron/notify` 05:00 UTC, etc.) fire only once deployed.

## Switching to / adding WhatsApp later

Fill the `GREEN_API_*` vars, then a merchant can pick **WhatsApp** in Settings.
The message templates are identical across channels.
