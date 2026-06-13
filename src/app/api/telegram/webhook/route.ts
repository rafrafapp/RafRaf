import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/messaging/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram bot webhook. Register it once with setWebhook (see
// scripts/set-telegram-webhook.mjs). On /start (or /id) we reply with the chat's
// numeric id so the merchant can paste it into Settings → Notifications.
// Secured by the secret token Telegram echoes in this header.
type Update = {
  message?: { chat?: { id?: number }; text?: string };
};

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    secret &&
    req.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim().toLowerCase();
  if (chatId != null && (text === "/start" || text === "/id" || text.startsWith("/start"))) {
    // Send the id inside <code>…</code> so Telegram makes it tap-to-copy.
    await sendTelegram(
      chatId,
      `RafRaf 🌿\nمعرّف الدردشة الخاص بك (Chat ID):\n<code>${chatId}</code>\n\nاضغط على الرقم لنسخه، ثم الصقه في: الإعدادات ← الإشعارات داخل التطبيق.`,
      { parseMode: "HTML" },
    );
  }

  // Always 200 so Telegram doesn't retry.
  return NextResponse.json({ ok: true });
}
