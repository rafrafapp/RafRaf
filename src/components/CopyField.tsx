"use client";

import { useState } from "react";
import styles from "./CopyField.module.css";

// Shows a value in a code block with a "copy" button. Used for the Telegram
// chat id (Settings) so the merchant can copy it in one tap.
export function CopyField({
  value,
  copyLabel,
  copiedLabel,
}: {
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={styles.row}>
      <code className={styles.code} dir="ltr">
        {value}
      </code>
      <button
        type="button"
        className={`${styles.btn} ${copied ? styles.btnCopied : ""}`}
        onClick={copy}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
