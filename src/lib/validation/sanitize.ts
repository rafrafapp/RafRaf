// Edge-safe, dependency-free string helpers (regex only). Safe to import ANYWHERE,
// INCLUDING the Edge runtime (middleware) — so this file must NEVER import
// DOMPurify / isomorphic-dompurify.
//
// The DOMPurify-based deep sanitizer lives in ./sanitize-html (`sanitizeString`),
// which runs in the browser + Node but NOT the Edge runtime. They're split so an
// Edge-reachable validation file (anything transitively imported by middleware,
// which needs only NO_TAGS/PHONE_RE) can never bundle DOMPurify into the Edge
// runtime.

// Display-time defense in depth. Runs per cell per render (search, lists) so it's a
// CHEAP regex tag-strip — the data is already sanitized at input + DB-constrained,
// and React escapes the result (no double-encoding).
export function safeDisplay(value: unknown): string {
  if (typeof value !== "string") return value == null ? "" : String(value);
  return value.replace(/<[^>]*>/g, "");
}

// Plain-text cleaner for Zod free-text transforms (notes / custom fields): a regex
// tag-strip + trim. Regex-only (Edge-safe; NO DOMPurify/jsdom) — React escapes on
// render, NO_TAGS rejects markup on named fields, and the DB CHECKs reject tags, so
// off the raw-HTML print sinks this hygiene is enough.
export function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "").trim();
}

// HTML-context escape for the raw-HTML sinks (receipt / PDF print windows), where
// user text is concatenated into an HTML string and entities ARE wanted.
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );
}

// Whitelist for name-ish fields: any character EXCEPT angle brackets (the tag
// vector). Allows real brand names (Nestle, Cafe), accents, Arabic, emoji, spaces,
// hyphens. The DB CHECK and sanitizeString remove actual tags/markup.
export const NO_TAGS = /^[^<>]*$/u;

// Phone: digits and + - ( ) space, 6-40 chars.
export const PHONE_RE = /^[0-9+()\s-]{6,40}$/;

// Barcode: alphanumerics and . _ - only.
export const BARCODE_RE = /^[A-Za-z0-9._-]{1,120}$/;
