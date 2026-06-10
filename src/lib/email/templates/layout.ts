// Shared RTL email layout. Email clients strip <style> blocks and don't support CSS
// modules/classes reliably, so everything is INLINE-styled. Arabic-first (dir="rtl"),
// mobile-friendly, table-based for broad client support.

type LayoutOpts = {
  heading: string;
  bodyHtml: string; // inner HTML (already-escaped paragraphs)
  cta?: { label: string; url: string };
  footnote?: string;
};

export function emailLayout({
  heading,
  bodyHtml,
  cta,
  footnote,
}: LayoutOpts): string {
  const button = cta
    ? `<tr><td style="padding:8px 0 20px;">
        <a href="${cta.url}" style="display:inline-block;background:#0e9f6e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:8px;">${cta.label}</a>
      </td></tr>`
    : "";
  const foot = footnote
    ? `<div style="margin-top:8px;">${footnote}</div>`
    : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;background:#f3f4f6;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px;text-align:right;">
        <tr><td style="font-size:22px;font-weight:800;color:#0e9f6e;padding-bottom:10px;">رف رف</td></tr>
        <tr><td style="font-size:18px;font-weight:700;color:#111827;padding-bottom:12px;">${heading}</td></tr>
        <tr><td style="font-size:15px;color:#374151;line-height:1.8;padding-bottom:8px;">${bodyHtml}</td></tr>
        ${button}
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:12px;line-height:1.6;">رف رف — الرف الرقمي لكل تاجر.${foot}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
