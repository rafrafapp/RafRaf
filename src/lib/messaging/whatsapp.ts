import "server-only";
import { whatsappNumber } from "@/lib/validation/customer";

// Server-only Green API (WhatsApp) client — the SECONDARY channel. Credentials
// are non-public env vars. Best-effort: never throws. Selected per-merchant via
// notify_channel = 'whatsapp'.

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.GREEN_API_ID_INSTANCE && process.env.GREEN_API_TOKEN,
  );
}

export async function sendWhatsApp(
  phone: string | null,
  message: string,
): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  const num = whatsappNumber(phone);
  if (!num) return false;

  const id = process.env.GREEN_API_ID_INSTANCE!.trim();
  const token = process.env.GREEN_API_TOKEN!.trim();
  const base = (process.env.GREEN_API_BASE_URL || "https://api.green-api.com")
    .trim()
    .replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/waInstance${id}/sendMessage/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatId: `${num}@c.us`, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
