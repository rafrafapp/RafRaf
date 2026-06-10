import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmin } from "@/lib/messaging/dispatch";

// Security event catalog (Layer 4) — Arabic labels + severity, from
// rafraf_security.md. High-severity events also fire an admin Telegram alert.
const EVENTS: Record<string, { label: string; severity: "low" | "med" | "high" }> = {
  FAILED_LOGIN: { label: "محاولة دخول فاشلة", severity: "low" },
  LOGIN_LOCKOUT: { label: "قفل حساب بعد محاولات كثيرة", severity: "high" },
  RATE_LIMIT_HIT: { label: "طلبات كثيرة جداً", severity: "med" },
  ADMIN_ACCESS_DENIED: { label: "محاولة دخول لوحة الأدمن", severity: "high" },
  UNUSUAL_DATA_ACCESS: { label: "وصول غير عادي للبيانات", severity: "high" },
  LARGE_EXPORT: { label: "تصدير كميات كبيرة", severity: "high" },
  API_KEY_ABUSE: { label: "استخدام مفتاح API مشبوه", severity: "high" },
};

export type SecurityDetails = {
  ip?: string | null;
  userId?: string | null;
  email?: string | null;
  message?: string | null;
  [k: string]: unknown;
};

// Append a security event. Best-effort: a logging/alert failure must never
// break the request it's observing.
export async function logSecurityEvent(
  type: string,
  details: SecurityDetails = {},
): Promise<void> {
  const event = EVENTS[type] ?? { label: type, severity: "low" as const };

  try {
    await createAdminClient()
      .from("security_logs")
      .insert({
        type,
        severity: event.severity,
        details,
        ip: details.ip ?? null,
        user_id: details.userId ?? null,
      });
  } catch {
    // swallow
  }

  if (event.severity === "high") {
    try {
      const when = new Date().toLocaleString("ar-SY");
      await notifyAdmin(
        `🚨 تنبيه أمني — RafRaf\n` +
          `النوع: ${event.label}\n` +
          `IP: ${details.ip ?? "غير معروف"}\n` +
          `الوقت: ${when}\n` +
          `التفاصيل: ${details.message ?? "—"}`,
      );
    } catch {
      // swallow
    }
  }
}

// Count recent FAILED_LOGIN events for an email (for the login-lockout check).
export async function getRecentFailedLogins(
  email: string,
  minutes: number,
): Promise<number> {
  try {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { count } = await createAdminClient()
      .from("security_logs")
      .select("id", { count: "exact", head: true })
      .eq("type", "FAILED_LOGIN")
      .gte("created_at", since)
      .filter("details->>email", "eq", email);
    return count ?? 0;
  } catch {
    return 0;
  }
}
