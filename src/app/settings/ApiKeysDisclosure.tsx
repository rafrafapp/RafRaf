"use client";

import { useState, type ComponentProps } from "react";
import { ApiKeysSection } from "./ApiKeysSection";
import type { ApiKeyRow } from "./api-keys-actions";
import styles from "./api-keys.module.css";

type SectionLabels = ComponentProps<typeof ApiKeysSection>["labels"];

// Keeps API keys hidden behind a toggle (default collapsed). Architecture is
// unchanged — keys stay merchant-scoped in Settings; this is purely UX so the
// keys aren't on screen by default.
export function ApiKeysDisclosure({
  initialKeys,
  labels,
  locale,
}: {
  initialKeys: ApiKeyRow[];
  labels: SectionLabels & { show: string; hide: string };
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.btn}
        aria-expanded={open}
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? labels.hide : labels.show}
      </button>
      {open && (
        <ApiKeysSection initialKeys={initialKeys} labels={labels} locale={locale} />
      )}
    </div>
  );
}
