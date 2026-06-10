import "server-only";

// Placeholder mock data for the Phase 12 AI layer. NO real API calls, no DB reads —
// these are illustrative samples so the UI structure can be built and demoed. Every
// response carries `placeholder: true` so the client can show a "demo data" notice.
// Real implementations (rule-based first, then Claude) replace these later.

export type ReorderSuggestion = {
  product: string;
  current_stock: number;
  reorder_point: number;
  suggested_qty: number;
  reason: string;
};

export type DeadStockItem = {
  product: string;
  stock: number;
  days_since_last_sale: number;
  suggestion: string;
};

export type Forecast = {
  period: string;
  expected_sales: number;
  currency: string;
  trend: "up" | "down" | "flat";
  top_products: { product: string; expected_units: number }[];
};

export function reorderStub(): ReorderSuggestion[] {
  return [
    {
      product: "حليب طازج 1ل",
      current_stock: 4,
      reorder_point: 20,
      suggested_qty: 40,
      reason: "مبيعات مرتفعة + مخزون منخفض",
    },
    {
      product: "سكر 1كغ",
      current_stock: 8,
      reorder_point: 15,
      suggested_qty: 25,
      reason: "اقترب من نقطة إعادة الطلب",
    },
    {
      product: "شاي أخضر علبة",
      current_stock: 2,
      reorder_point: 10,
      suggested_qty: 20,
      reason: "نفاد متوقّع خلال 3 أيام",
    },
  ];
}

export function deadStockStub(): DeadStockItem[] {
  return [
    {
      product: "علبة شوكولا فاخرة",
      stock: 30,
      days_since_last_sale: 92,
      suggestion: "خصم 20% لتصريف المخزون",
    },
    {
      product: "مشروب طاقة (نكهة قديمة)",
      stock: 48,
      days_since_last_sale: 140,
      suggestion: "عرض 1+1 أو إرجاع للمورّد",
    },
  ];
}

export function forecastStub(currency = "SYP"): Forecast {
  return {
    period: "next_7_days",
    expected_sales: 1_850_000,
    currency,
    trend: "up",
    top_products: [
      { product: "حليب طازج 1ل", expected_units: 120 },
      { product: "خبز", expected_units: 300 },
      { product: "سكر 1كغ", expected_units: 60 },
    ],
  };
}

// Canned Arabic reply for the chat stub. Echoes the question so the UI demonstrates
// the round-trip, but performs NO analysis / no model call.
export function chatReplyStub(message: string): string {
  const q = message.trim();
  const quoted = q ? `«${q.slice(0, 160)}»` : "سؤالك";
  return (
    `🤖 المساعد الذكي قيد التطوير ضمن الباقة الذكية. ` +
    `قريباً سأحلّل بيانات متجرك (المبيعات، المخزون، الديون) وأجيب على ${quoted} ` +
    `باللغة العربية مع أرقام دقيقة. ترقّب التحديث القادم.`
  );
}
