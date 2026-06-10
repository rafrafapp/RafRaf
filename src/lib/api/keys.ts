import "server-only";
import { randomBytes, createHash } from "node:crypto";

// API key lifecycle. Tokens look like `rafraf_<48 hex>` (192-bit random). We store
// ONLY the SHA-256 hash + a short display prefix — never the plaintext. SHA-256 is
// the right primitive here (not bcrypt): the token is high-entropy, so an indexed
// hash lookup is safe and fast; bcrypt would prevent the lookup and add nothing.

export const KEY_PREFIX = "rafraf_";

export function hashApiKey(full: string): string {
  return createHash("sha256").update(full).digest("hex"); // 64 hex chars
}

export function generateApiKey(): {
  full: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(24).toString("hex"); // 48 hex chars, [0-9a-f]
  const full = KEY_PREFIX + random;
  // Display id: `rafraf_` + first 8 hex — matches the api_keys.prefix CHECK
  // (^[A-Za-z0-9_]+$) and lets the merchant recognize a key in Settings.
  const prefix = full.slice(0, KEY_PREFIX.length + 8);
  return { full, hash: hashApiKey(full), prefix };
}

// Extract the token from an `Authorization: Bearer rafraf_…` header. Returns null
// if absent/malformed or not a RafRaf token.
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim();
  if (!token || !token.startsWith(KEY_PREFIX)) return null;
  return token;
}
