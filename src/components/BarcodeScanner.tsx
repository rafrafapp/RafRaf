"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import styles from "./BarcodeScanner.module.css";

type Props = {
  onDetected: (text: string) => void;
  onClose: () => void;
  labels: { title: string; hint: string; error: string; close: string };
};

// Retail-friendly 1D symbologies plus QR. Restricting the format set makes the
// continuous decoder noticeably faster and less jittery on phone cameras.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

export function BarcodeScanner({ onDetected, onClose, labels }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Keep the latest onDetected without re-running the camera effect on re-render.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState(false);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    // TRY_HARDER makes the decoder spend more effort per frame — the difference
    // between "camera is on but never reads" and reliable EAN-13/QR detection on
    // phone cameras (slightly slower per attempt, well worth it for retail codes).
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 100,
    });

    let controls: IScannerControls | undefined;
    let done = false; // guards the strict-mode double-invoke and late stream resolves

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current ?? undefined,
        (result, _err, ctrl) => {
          if (result && !done) {
            done = true;
            ctrl.stop();
            onDetectedRef.current(result.getText());
          }
        },
      )
      .then((ctrl) => {
        controls = ctrl;
        if (done) ctrl.stop(); // unmounted before the camera finished starting
      })
      .catch(() => setError(true));

    return () => {
      done = true;
      controls?.stop();
    };
  }, []);

  // Escape closes the scanner for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      <div className={styles.panel}>
        <p className={styles.title}>{labels.title}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {labels.error}
          </p>
        ) : (
          <div className={styles.viewport}>
            <video
              ref={videoRef}
              className={styles.video}
              autoPlay
              muted
              playsInline
            />
            <div className={styles.frame} aria-hidden="true" />
          </div>
        )}
        <p className={styles.hint}>{labels.hint}</p>
        <button type="button" className={styles.close} onClick={onClose}>
          {labels.close}
        </button>
      </div>
    </div>
  );
}
