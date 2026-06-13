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
    zoomIn?: string;
    zoomOut?: string;
  };
};

type ZoomRange = { min: number; max: number; step: number };

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

  // Camera zoom: prefer the hardware zoom API (changes the real stream → better
  // reads); fall back to a CSS transform (visual only) when unsupported.
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hwZoomRef = useRef(false);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1.5);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);

  function applyZoom(z: number) {
    const r = zoomRange;
    if (!r) return;
    const clamped = Math.min(Math.max(z, r.min), r.max);
    setZoom(clamped);
    const track = trackRef.current;
    if (hwZoomRef.current && track) {
      track
        .applyConstraints({
          advanced: [{ zoom: clamped }],
        } as unknown as MediaTrackConstraints)
        .catch(() => {});
    } else if (videoElRef.current) {
      videoElRef.current.style.transform = `scale(${clamped})`;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    const a = e.touches[0];
    const b = e.touches[1];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinchRef.current) {
      pinchRef.current = { dist, zoom };
      return;
    }
    applyZoom(pinchRef.current.zoom * (dist / pinchRef.current.dist));
  }
  function onTouchEnd() {
    pinchRef.current = null;
  }

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

    // Quagga injects its <video> asynchronously; poll briefly for the stream
    // track, then enable zoom (hardware where available, 1.5× to start).
    const setupZoom = (attempt: number) => {
      if (doneRef.current) return;
      const video = target.querySelector("video") as HTMLVideoElement | null;
      const stream = (video?.srcObject ?? null) as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0] ?? null;
      if (!track) {
        if (attempt < 20) setTimeout(() => setupZoom(attempt + 1), 150);
        return;
      }
      videoElRef.current = video;
      trackRef.current = track;
      const caps = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { zoom?: ZoomRange })
        | undefined;
      if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
        hwZoomRef.current = true;
        const step = caps.zoom.step || 0.1;
        const init = Math.min(Math.max(1.5, caps.zoom.min), caps.zoom.max);
        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step });
        setZoom(init);
        track
          .applyConstraints({
            advanced: [{ zoom: init }],
          } as unknown as MediaTrackConstraints)
          .catch(() => {});
      } else {
        hwZoomRef.current = false;
        setZoomRange({ min: 1, max: 4, step: 0.1 });
        setZoom(1.5);
        if (video) video.style.transform = "scale(1.5)";
      }
    };

    Quagga.init(config, (err) => {
      if (err) {
        setError(true);
        return;
      }
      if (doneRef.current) return; // unmounted before init resolved
      Quagga.start();
      setupZoom(0);
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
          <div
            className={styles.viewport}
            ref={viewportRef}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className={styles.frame} aria-hidden="true" />
            <div className={styles.laser} aria-hidden="true" />
            {zoomRange && (
              <div className={styles.zoomControls}>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  aria-label={labels.zoomOut ?? "−"}
                  onClick={() =>
                    applyZoom(
                      zoom -
                        Math.max(
                          (zoomRange.max - zoomRange.min) / 10,
                          zoomRange.step,
                        ),
                    )
                  }
                >
                  −
                </button>
                <span className={styles.zoomLevel}>{zoom.toFixed(1)}×</span>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  aria-label={labels.zoomIn ?? "+"}
                  onClick={() =>
                    applyZoom(
                      zoom +
                        Math.max(
                          (zoomRange.max - zoomRange.min) / 10,
                          zoomRange.step,
                        ),
                    )
                  }
                >
                  +
                </button>
              </div>
            )}
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
