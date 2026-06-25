"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import {
  createUploadSignature,
  updateStoreLogo,
} from "@/lib/cloudinary/actions";
import {
  uploadSigned,
  uploadUnsigned,
  buildDeliveryUrl,
  validateImage,
  LOGO_IMAGE_SIZE,
} from "@/lib/cloudinary/upload-client";
import styles from "@/app/products/product-form.module.css";

// Store logo upload (online-only — the merchant row isn't in the offline store).
// Signed direct upload to Cloudinary with a % bar, then updateStoreLogo persists
// the URL + destroys the old asset.
export function LogoUpload({
  initialUrl,
  labels,
}: {
  initialUrl: string | null;
  labels: Dictionary["settings"]["logo"];
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(file: File | null) {
    if (!file) return;
    setError(null);
    const v = validateImage(file);
    if (v) {
      setError(v === "too_large" ? labels.tooLarge : labels.invalidType);
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError(labels.offline);
      return;
    }
    setBusy(true);
    setPct(0);
    try {
      const sig = await createUploadSignature("logo");
      const { publicId, version } = sig
        ? await uploadSigned(file, sig, setPct)
        : await uploadUnsigned(file, "rafraf/logos", setPct);
      const newUrl = buildDeliveryUrl(
        publicId,
        version,
        LOGO_IMAGE_SIZE,
        LOGO_IMAGE_SIZE,
      );
      const r = await updateStoreLogo(newUrl, publicId);
      if (!r.ok) setError(labels.failed);
      else setUrl(newUrl);
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
      setPct(null);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    const r = await updateStoreLogo(null, null);
    if (r.ok) setUrl(null);
    else setError(labels.failed);
    setBusy(false);
  }

  return (
    <div className={styles.form}>
      <div className={styles.imageRow}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={styles.imgPreview} />
        ) : (
          <span className={styles.imgPlaceholder} aria-hidden>
            🏪
          </span>
        )}
        <div className={styles.imgActions}>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          {url && (
            <button
              type="button"
              className={styles.removeImg}
              disabled={busy}
              onClick={onRemove}
            >
              {labels.remove}
            </button>
          )}
          <span className={styles.imgHint}>{labels.hint}</span>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {pct != null && (
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ inlineSize: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
