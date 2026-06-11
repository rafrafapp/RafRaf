"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Quagga, {
  type QuaggaJSConfigObject,
  type QuaggaJSResultObject,
  type QuaggaJSCodeReader,
} from "@ericblade/quagga2";
import { BrowserMultiFormatReader } from "@zxing/browser";
import styles from "./BarcodeScanner.module.css";

type Props = {
  onDetected: (text: string) => void;
  onClose: () => void;
  labels: {
    title: string;
    hint: string;
    error: string;
    close: string;
    upload: string;
  };
};

// 1D retail symbologies. QuaggaJS is a 1D engine — QR codes are covered by the
// image-upload fallback (ZXing) below, not the live camera.
const READERS: QuaggaJSCodeReader[] = [
  "ean_reader", // EAN-13
  "ean_8_reader", // EAN-8
  "code_128_reader", // Code 128
  "upc_reader", // UPC-A
  "upc_e_reader", // UPC-E
  "code_39_reader", // Code 39
];

// Success cue: a haptic buzz (Android) + a quick Web-Audio beep (no asset, so
// CSP-safe). iOS supports neither reliably outside a gesture — the auto-close is
// the cross-platform signal there.
function successFeedback() {
  try {
    navigator.vibrate?.(120);
  } catch {
    /* vibrate unsupported */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume?.();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

export function BarcodeScanner({ onDetected, onClose, labels }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const doneRef = useRef(false);
  const [error, setError] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  // Fire once: stop the camera, beep/vibrate, and hand the code up. The parent
  // fills the field and closes the scanner (unmounts us → cleanup runs).
  const finish = useCallback((code: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    successFeedback();
    try {
      Quagga.stop();
    } catch {
      /* not yet started */
    }
    onDetectedRef.current(code);
  }, []);

  // Live camera scanning (QuaggaJS, 1D). Auto-starts on mount and auto-reads.
  useEffect(() => {
    doneRef.current = false;
    const target = viewportRef.current;
    if (!target) return;

    const onResult = (result: QuaggaJSResultObject) => {
      const code = result?.codeResult?.code;
      if (code) finish(String(code));
    };

    const config: QuaggaJSConfigObject = {
      inputStream: {
        type: "LiveStream",
        target,
        constraints: { facingMode: "environment" },
      },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: 0, // main thread — no blob-worker lifecycle to clean up
      frequency: 10,
      decoder: { readers: READERS },
      locate: true,
    };

    Quagga.init(config, (err) => {
      if (err) {
        setError(true);
        return;
      }
      if (doneRef.current) return; // unmounted before init resolved
      Quagga.start();
    });
    Quagga.onDetected(onResult);

    return () => {
      doneRef.current = true;
      try {
        Quagga.offDetected(onResult);
      } catch {
        /* ignore */
      }
      try {
        Quagga.stop();
      } catch {
        /* ignore */
      }
    };
  }, [finish]);

  // Escape closes the scanner for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Image-upload fallback (ZXing) — decodes QR *and* 1D from a still photo, so QR
  // codes still work even though the live engine is 1D-only.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || doneRef.current) return;
    setUploadFailed(false);
    const url = URL.createObjectURL(file);
    try {
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      const text = result.getText();
      if (text) finish(text);
      else setUploadFailed(true);
    } catch {
      setUploadFailed(true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

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
          <div className={styles.viewport} ref={viewportRef}>
            <div className={styles.frame} aria-hidden="true" />
            <div className={styles.laser} aria-hidden="true" />
          </div>
        )}
        <p className={styles.hint}>{labels.hint}</p>
        {uploadFailed && (
          <p className={styles.error} role="alert">
            {labels.error}
          </p>
        )}
        <button
          type="button"
          className={styles.upload}
          onClick={() => fileRef.current?.click()}
        >
          {labels.upload}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
        />
        <button type="button" className={styles.close} onClick={onClose}>
          {labels.close}
        </button>
      </div>
    </div>
  );
}
