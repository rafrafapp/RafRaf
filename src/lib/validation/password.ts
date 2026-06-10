// Local password strength checker (no external API — HIBP needs the Pro plan).
// Pure + isomorphic: used by the client meter AND enforced server-side in the
// signup / change-password actions (the client check is bypassable).

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_STRONG_LENGTH = 16;

export type PasswordRuleKey =
  | "length"
  | "upper"
  | "lower"
  | "number"
  | "special"
  | "noSpace"
  | "notCommon"
  | "notPattern"
  | "notRepeat"
  | "notPersonal";

export const PASSWORD_RULES: PasswordRuleKey[] = [
  "length",
  "upper",
  "lower",
  "number",
  "special",
  "noSpace",
  "notCommon",
  "notPattern",
  "notRepeat",
  "notPersonal",
];

// 0 ضعيف · 1 مقبول · 2 جيد · 3 قوي. Submission requires >= 2 (جيد).
export type PasswordLevel = 0 | 1 | 2 | 3;

export type PasswordStrength = {
  results: Record<PasswordRuleKey, boolean>;
  level: PasswordLevel;
  acceptable: boolean;
};

export type PasswordContext = { email?: string; storeName?: string };

// Top ~100 most common passwords (lowercased).
const COMMON = new Set<string>([
  "123456", "password", "123456789", "12345678", "12345", "111111", "1234567",
  "sunshine", "qwerty", "iloveyou", "princess", "admin", "welcome", "666666",
  "abc123", "football", "123123", "monkey", "654321", "charlie", "aa123456",
  "donald", "password1", "qwerty123", "1234567890", "123321", "1q2w3e4r",
  "qwertyuiop", "000000", "555555", "dragon", "passw0rd", "master", "hello",
  "freedom", "whatever", "qazwsx", "trustno1", "letmein", "baseball", "superman",
  "1qaz2wsx", "zxcvbnm", "asdfghjkl", "121212", "bailey", "shadow", "michael",
  "jennifer", "computer", "jordan", "hunter", "2000", "test", "batman", "thomas",
  "tigger", "robert", "access", "love", "buster", "soccer", "hockey", "killer",
  "george", "sexy", "andrew", "fishing", "secret", "summer", "internet", "a1b2c3",
  "matthew", "starwars", "cheese", "ginger", "mustang", "pepper", "daniel",
  "hannah", "123qwe", "qwe123", "p@ssword", "p@ssw0rd", "welcome1", "admin123",
  "root", "toor", "pass", "love123", "flower", "loveme", "abcdef", "azerty",
  "159753", "samsung", "google", "ferrari", "babygirl", "liverpool", "123abc",
  "696969", "changeme", "qwerty1", "password123", "iloveyou1",
]);

// Sequences used to detect keyboard / sequential patterns.
const SEQUENCES = [
  "0123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "qwertyuiopasdfghjklzxcvbnm",
  "azertyuiop",
];

// Forward + reverse sequences joined with a separator so a match can't span two.
const SEQ_TEXT = SEQUENCES.flatMap((s) => [s, [...s].reverse().join("")]).join("|");

// A pattern/repeat only disqualifies when it DOMINATES the password. So a short,
// pattern-only password (asdfghjkl, qwerty123456) fails, but a long complex
// password that merely CONTAINS a pattern (ASDFGHJKL_9977867643zxc()) passes.
const PATTERN_DOMINANT = 0.6;

// Fraction of the password covered by keyboard/sequential runs of length >= 4.
function patternCoverageRatio(pw: string): number {
  const s = pw.toLowerCase();
  const n = s.length;
  if (!n) return 0;
  const covered = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    let len = 1;
    while (i + len < n && SEQ_TEXT.includes(s.slice(i, i + len + 1))) len++;
    if (len >= 4) for (let k = i; k < i + len; k++) covered[k] = true;
  }
  return covered.filter(Boolean).length / n;
}

// Fraction covered by runs of a single repeated character (length >= 4).
function repeatCoverageRatio(pw: string): number {
  const n = pw.length;
  if (!n) return 0;
  let covered = 0;
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && pw[j] === pw[i]) j++;
    if (j - i >= 4) covered += j - i;
    i = j;
  }
  return covered / n;
}

function containsPersonal(pw: string, ctx?: PasswordContext): boolean {
  if (!ctx) return false;
  const s = pw.toLowerCase();
  const tokens: string[] = [];
  const email = ctx.email?.toLowerCase().trim();
  if (email) {
    tokens.push(email);
    const local = email.split("@")[0];
    if (local) tokens.push(local);
  }
  const store = ctx.storeName?.toLowerCase().trim();
  if (store) tokens.push(store);
  return tokens.some((t) => t.length >= 3 && s.includes(t));
}

const SPECIAL = /[^A-Za-z0-9\s]/;

export function checkPassword(
  password: string,
  ctx?: PasswordContext,
): PasswordStrength {
  const pw = password ?? "";
  const nonEmpty = pw.length > 0;

  const results: Record<PasswordRuleKey, boolean> = {
    length: pw.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: SPECIAL.test(pw),
    noSpace: nonEmpty && !/\s/.test(pw),
    notCommon: nonEmpty && !COMMON.has(pw.toLowerCase()),
    notPattern: nonEmpty && patternCoverageRatio(pw) < PATTERN_DOMINANT,
    notRepeat: nonEmpty && repeatCoverageRatio(pw) < PATTERN_DOMINANT,
    notPersonal: nonEmpty && !containsPersonal(pw, ctx),
  };

  const composition =
    results.length &&
    results.upper &&
    results.lower &&
    results.number &&
    results.special &&
    results.noSpace;
  const quality =
    results.notCommon &&
    results.notPattern &&
    results.notRepeat &&
    results.notPersonal;
  const compCount = [
    results.length,
    results.upper,
    results.lower,
    results.number,
    results.special,
    results.noSpace,
  ].filter(Boolean).length;

  let level: PasswordLevel;
  if (!nonEmpty) level = 0;
  else if (!composition) level = compCount >= 5 && pw.length >= 10 ? 1 : 0;
  else if (!quality) level = 1; // composition OK but a red flag (common/pattern/…)
  else level = pw.length >= PASSWORD_STRONG_LENGTH ? 3 : 2;

  return { results, level, acceptable: level >= 2 };
}
