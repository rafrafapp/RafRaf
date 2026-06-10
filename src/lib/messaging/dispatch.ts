import "server-only";
import { sendTelegram } from "./telegram";
import { sendWhatsApp } from "./whatsapp";

export type NotifyChannel = "telegram" | "whatsapp" | "off";

// The merchant fields needed to route a notification to their chosen channel.
export type NotifiableMerchant = {
  notify_channel: string | null;
  telegram_chat_id: string | null;
  phone: string | null;
};

// Send a merchant-facing notification on their preferred channel. Telegram is
// the default; an unset/missing address just no-ops (best-effort).
export async function notifyMerchant(
  m: NotifiableMerchant,
  text: string,
): Promise<boolean> {
  const channel = (m.notify_channel ?? "telegram") as NotifyChannel;
  if (channel === "telegram") return sendTelegram(m.telegram_chat_id, text);
  if (channel === "whatsapp") return sendWhatsApp(m.phone, text);
  return false; // 'off'
}

// Admin alerts (backup failures): prefer Telegram, fall back to WhatsApp.
export async function notifyAdmin(text: string): Promise<boolean> {
  if (await sendTelegram(process.env.RAFRAF_ADMIN_CHAT_ID, text)) return true;
  return sendWhatsApp(process.env.RAFRAF_ADMIN_PHONE ?? null, text);
}
