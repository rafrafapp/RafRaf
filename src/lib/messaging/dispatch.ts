import "server-only";
import { sendTelegram } from "./telegram";

export type NotifyChannel = "telegram" | "off";

// The merchant fields needed to route a notification. Telegram is the only
// channel now (WhatsApp/Green API was removed).
export type NotifiableMerchant = {
  notify_channel: string | null;
  telegram_chat_id: string | null;
};

// Send a merchant-facing notification over Telegram. An unset chat id or a
// channel of 'off' (or any legacy value) just no-ops (best-effort).
export async function notifyMerchant(
  m: NotifiableMerchant,
  text: string,
): Promise<boolean> {
  if ((m.notify_channel ?? "telegram") === "telegram")
    return sendTelegram(m.telegram_chat_id, text);
  return false; // 'off'
}

// Admin alerts (backup failures) go to the admin's Telegram chat.
export async function notifyAdmin(text: string): Promise<boolean> {
  return sendTelegram(process.env.RAFRAF_ADMIN_CHAT_ID, text);
}
