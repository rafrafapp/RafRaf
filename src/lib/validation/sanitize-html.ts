import DOMPurify from "isomorphic-dompurify";

// Deep HTML sanitizer (DOMPurify). ISOMORPHIC: it runs in the browser (client-side
// form validation in *Form.tsx + the offline repos that validate before writing to
// IndexedDB) AND in Node (server actions, RSC, the print sinks). It does NOT run in
// the Edge runtime — DOMPurify needs a DOM/global the Edge runtime lacks ("Cannot
// read properties of undefined (reading 'bind')") — so this module must stay OUT of
// any import chain reachable from middleware. The regex-only ./sanitize is the
// Edge-safe counterpart.
//
// NOTE: deliberately NOT marked `import "server-only"`. The product/transaction Zod
// schemas validate client-side (offline-first), so this must bundle for browsers.
//
// We never render user input as HTML, so "sanitize" means: strip ALL markup and
// return PLAIN TEXT (decoded). Returning HTML-encoded text would double-encode in
// React (e.g. "A & B" -> "A &amp; B"), so we decode after stripping.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x2F;": "/",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#x2F|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

// Strip every tag (script/style content is dropped entirely) and return decoded
// plain text. Used by Zod transforms for free-text fields and by the print sinks.
export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  const stripped = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
  return decodeEntities(stripped).trim();
}
