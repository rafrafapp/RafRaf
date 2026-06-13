import "server-only";

// Short, clean Arabic templates, sent over Telegram. Numbers use Western digits
// for clarity.

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function dailySummaryMessage(o: {
  storeName: string;
  day: string;
  sales: number;
  netProfit: number;
  count: number;
  currency: string;
  lowStockCount: number;
}): string {
  const lines = [
    `📊 ملخص ${o.storeName} — ${o.day}`,
    `المبيعات: ${nf.format(o.sales)} ${o.currency}`,
    `صافي الربح: ${nf.format(o.netProfit)} ${o.currency}`,
    `عدد الفواتير: ${nf.format(o.count)}`,
  ];
  if (o.lowStockCount > 0)
    lines.push(`⚠️ ${nf.format(o.lowStockCount)} منتج قارب على النفاد`);
  return lines.join("\n");
}

export function lowStockMessage(o: {
  storeName: string;
  productName: string;
  stock: number;
}): string {
  return `⚠️ ${o.storeName}\nالمنتج «${o.productName}» مخزونه منخفض (${nf.format(o.stock)}).\nيرجى إعادة الطلب.`;
}

export function debtReminderMessage(o: {
  name: string;
  storeName: string;
  amount: number;
  currency: string;
}): string {
  return `${o.name}، تذكير ودّي 🌿\nرصيدك المستحق لدى ${o.storeName}: ${nf.format(o.amount)} ${o.currency}.\nنشكر تعاملك معنا.`;
}

export function oversellMessage(o: {
  storeName: string;
  productName: string;
  available: number;
  required: number;
}): string {
  return `⚠️ ${o.storeName}\nتم البيع رغم نقص المخزون!\nالمنتج: «${o.productName}»\nالمتوفر: ${nf.format(o.available)} · المطلوب: ${nf.format(o.required)}\nيرجى إعادة الطلب أو مراجعة المخزون.`;
}

export function backupFailureMessage(o: { scope: string; count: number }): string {
  return `🛑 RafRaf: فشل النسخ الاحتياطي (${o.scope}) — ${nf.format(o.count)} حالة.\nراجع سجل backup_logs.`;
}
