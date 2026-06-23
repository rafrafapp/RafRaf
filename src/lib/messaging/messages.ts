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

// Daily backup digest sent to the admin's Telegram after the nightly cron run.
export function backupDailySummaryMessage(o: {
  succeeded: number;
  attempted: number;
  skipped: number;
  failures: { store: string; error: string }[];
}): string {
  const lines = [
    `🗂️ النسخ الاحتياطي اليومي: ${nf.format(o.succeeded)}/${nf.format(o.attempted)} نجح`,
  ];
  if (o.skipped > 0)
    lines.push(`⏭️ تم تخطّي ${nf.format(o.skipped)} متجر (لا يوجد جدول مرتبط).`);
  if (o.failures.length > 0) {
    lines.push("🛑 إخفاقات:");
    for (const f of o.failures.slice(0, 10))
      lines.push(`• ${f.store}: ${f.error.slice(0, 120)}`);
  } else {
    lines.push("✅ لا إخفاقات.");
  }
  return lines.join("\n");
}

export function newProductFromBarcodeMessage(o: {
  storeName: string;
  barcode: string;
}): string {
  return `📦 ${o.storeName}\nتم إضافة منتج جديد بالباركود: ${o.barcode}\nالاسم المؤقت: «منتج-${o.barcode}»\nأكمل بياناته من إدارة المنتجات.`;
}

export function newProductsBatchMessage(o: {
  storeName: string;
  count: number;
}): string {
  return `📦 ${o.storeName}\nتم إضافة ${nf.format(o.count)} منتج جديد بالباركود.\nأكمل بياناتهم من إدارة المنتجات.`;
}

export function saleMessage(o: {
  storeName: string;
  invoiceNo: string;
  total: number;
  currency: string;
  payment: string;
}): string {
  const payMap: Record<string, string> = { cash: "كاش", credit: "آجل", partial: "جزئي" };
  return [
    `🛒 بيع جديد ${o.invoiceNo}`,
    `${o.storeName}`,
    `المبلغ: ${nf.format(o.total)} ${o.currency}`,
    `الدفع: ${payMap[o.payment] ?? o.payment}`,
  ].join("\n");
}

// Owner-triggered "please back me up" request sent to the admin's Telegram.
export function backupRequestMessage(o: {
  storeName: string;
  email: string | null;
}): string {
  return `🔔 طلب نسخة احتياطية\nالمتجر: «${o.storeName}»${
    o.email ? `\nالبريد: ${o.email}` : ""
  }\nالرجاء تشغيل نسخة احتياطية لهذا المتجر.`;
}
