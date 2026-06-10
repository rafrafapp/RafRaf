"use client";

import { useState, useTransition } from "react";
import {
  createApiKey,
  revokeApiKey,
  type ApiKeyRow,
} from "./api-keys-actions";
import styles from "./api-keys.module.css";

type Labels = {
  generate: string;
  label: string;
  labelPlaceholder: string;
  readOnly: string;
  generating: string;
  untitled: string;
  copyWarning: string;
  copy: string;
  copied: string;
  done: string;
  empty: string;
  scopeRead: string;
  scopeFull: string;
  createdAt: string;
  lastUsed: string;
  never: string;
  active: string;
  revoked: string;
  revoke: string;
  revoking: string;
  revokeConfirm: string;
  docsTitle: string;
  docsIntro: string;
  failed: string;
};

export function ApiKeysSection({
  initialKeys,
  labels,
  locale,
}: {
  initialKeys: ApiKeyRow[];
  labels: Labels;
  locale: string;
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [label, setLabel] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === "ar" ? "ar" : "en-GB")
      : labels.never;
  const scopeLabel = (k: ApiKeyRow) =>
    k.scopes.some((s) => s.endsWith(":write")) ? labels.scopeFull : labels.scopeRead;

  const onGenerate = () =>
    start(async () => {
      setError(null);
      const r = await createApiKey(label, readOnly);
      if (r.ok) {
        setKeys([r.key, ...keys]);
        setRevealed(r.plaintext);
        setCopied(false);
        setLabel("");
      } else {
        setError(labels.failed);
      }
    });

  const onRevoke = (id: string) => {
    if (!window.confirm(labels.revokeConfirm)) return;
    start(async () => {
      setRevokingId(id);
      const r = await revokeApiKey(id);
      if (r.ok) {
        setKeys(keys.map((k) => (k.id === id ? { ...k, revoked: true } : k)));
      }
      setRevokingId(null);
    });
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
    } catch {
      /* clipboard unavailable — user can select manually */
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.genRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="apikey-label">
            {labels.label}
          </label>
          <input
            id="apikey-label"
            className={styles.input}
            value={label}
            placeholder={labels.labelPlaceholder}
            maxLength={60}
            disabled={pending}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={readOnly}
            disabled={pending}
            onChange={(e) => setReadOnly(e.target.checked)}
          />
          {labels.readOnly}
        </label>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={pending}
          onClick={onGenerate}
        >
          {pending && !revokingId ? labels.generating : labels.generate}
        </button>
      </div>
      {error && <p className={styles.status}>{error}</p>}

      {revealed && (
        <div className={styles.reveal}>
          <span className={styles.revealWarn}>⚠️ {labels.copyWarning}</span>
          <div className={styles.revealKeyRow}>
            <code className={styles.code}>{revealed}</code>
            <button type="button" className={styles.btn} onClick={copy}>
              {copied ? labels.copied : labels.copy}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setRevealed(null);
                setCopied(false);
              }}
            >
              {labels.done}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className={styles.empty}>{labels.empty}</p>
      ) : (
        <ul className={styles.list}>
          {keys.map((k) => (
            <li key={k.id} className={styles.keyItem}>
              <div className={styles.keyMain}>
                <span className={styles.keyName}>{k.label || labels.untitled}</span>
                <span className={styles.keyPrefix} dir="ltr">
                  {k.prefix}…
                </span>
                <span className={styles.keyMeta}>
                  {scopeLabel(k)} · {labels.createdAt} {fmt(k.created_at)} ·{" "}
                  {labels.lastUsed} {fmt(k.last_used_at)}
                </span>
              </div>
              <div className={styles.checkRow}>
                {k.revoked ? (
                  <span className={`${styles.badge} ${styles.badgeRevoked}`}>
                    {labels.revoked}
                  </span>
                ) : (
                  <>
                    <span className={styles.badge}>{labels.active}</span>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.danger}`}
                      disabled={pending && revokingId === k.id}
                      onClick={() => onRevoke(k.id)}
                    >
                      {revokingId === k.id ? labels.revoking : labels.revoke}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.docs}>
        <span className={styles.docsTitle}>{labels.docsTitle}</span>
        <p className={styles.status}>{labels.docsIntro}</p>
        <pre className={styles.pre}>{`# List products
curl ${origin}/api/v1/products \\
  -H "Authorization: Bearer rafraf_xxx"

# Create a product
curl -X POST ${origin}/api/v1/products \\
  -H "Authorization: Bearer rafraf_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Sample","sell_price":1000,"stock":10}'

# Record a sale (atomic; idempotent on client_uuid)
curl -X POST ${origin}/api/v1/transactions \\
  -H "Authorization: Bearer rafraf_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"sell","product_id":"<id>","qty":1,"price":1000,"client_uuid":"<unique>"}'`}</pre>
      </div>
    </div>
  );
}
