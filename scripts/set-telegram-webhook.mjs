// Register the Telegram bot webhook so /start replies with the chat id and the
// bot can receive updates.
//
//   node scripts/set-telegram-webhook.mjs https://your-app.vercel.app
//
// Reads TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET from .env.local.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  const txt = readFileSync(path, "utf8");
  const out = {};
  const re = /^([A-Z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\n#]*))/gm;
  let m;
  while ((m = re.exec(txt))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const env = loadEnv(resolve(process.cwd(), ".env.local"));
const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
const secret = (env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
const base = (process.argv[2] ?? "").trim().replace(/\/+$/, "");

if (!token) {
  console.error("✗ TELEGRAM_BOT_TOKEN missing in .env.local");
  process.exit(1);
}
if (!base) {
  console.error("Usage: node scripts/set-telegram-webhook.mjs https://your-app.vercel.app");
  process.exit(1);
}

const url = `${base}/api/telegram/webhook`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret || undefined,
    allowed_updates: ["message"],
  }),
});
console.log("setWebhook:", JSON.stringify(await res.json()));

const info = await (
  await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
).json();
console.log("webhookInfo:", JSON.stringify(info.result));
console.log(`\nWebhook → ${url}`);
console.log("Now DM your bot /start — it should reply with your chat id.");
