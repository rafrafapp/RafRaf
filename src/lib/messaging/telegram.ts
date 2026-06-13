import "server-only";

// Server-only Telegram Bot client (the primary channel — free, official, no
// approval). TELEGRAM_BOT_TOKEN is a non-public env var. Telegram addresses a
// user by numeric chat_id, which we capture when they /start the bot (see
// app/api/telegram/webhook). Best-effort: never throws.

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegram(
  chatId: string | number | null | undefined,
  text: string,
  opts?: { parseMode?: "HTML" | "MarkdownV2" },
): Promise<boolean> {
  if (!isTelegramConfigured() || chatId == null || chatId === "") return false;
  const token = process.env.TELEGRAM_BOT_TOKEN!.trim();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
