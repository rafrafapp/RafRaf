"use client";

import type { Dictionary } from "@/i18n/get-dictionary";
import {
  PASSWORD_RULES,
  type PasswordStrength,
} from "@/lib/validation/password";
import styles from "./password-meter.module.css";

// Maps the numeric level to the i18n key (ضعيف / مقبول / جيد / قوي).
const LEVEL_KEY = ["weak", "ok", "good", "strong"] as const;

type Props = {
  strength: PasswordStrength;
  labels: Dictionary["password"];
};

// Presentational: the parent computes `strength` (so it can also gate submit) and
// passes it here. Renders a 4-segment colour bar, an encouraging message, and the
// pass/fail checklist.
export function PasswordStrengthMeter({ strength, labels }: Props) {
  const level = strength.level;
  const key = LEVEL_KEY[level];
  const rules = labels.rules as Record<string, string>;

  return (
    <div className={styles.wrap}>
      <div className={styles.bar} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`${styles.seg} ${i <= level ? styles[`fill${level}`] : ""}`}
          />
        ))}
      </div>

      <p className={`${styles.message} ${styles[`lvl${level}`]}`} role="status">
        <strong>{labels.levels[key]}</strong>
      </p>

      <ul className={styles.rules}>
        {PASSWORD_RULES.map((k) => (
          <li
            key={k}
            className={strength.results[k] ? styles.pass : styles.fail}
          >
            <span aria-hidden>{strength.results[k] ? "✅" : "❌"}</span>{" "}
            {rules[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
