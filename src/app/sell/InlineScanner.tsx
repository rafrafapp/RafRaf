"use client";

import { useEffect, useRef } from "react";
import Quagga, {
  type QuaggaJSConfigObject,
  type QuaggaJSResultObject,
  type QuaggaJSCodeReader,
} from "@ericblade/quagga2";
import {
  nativeScannerSupported,
  startNativeScanner,
  type NativeScanHandle,
} from "@/lib/scanner/native";

const READERS: QuaggaJSCodeReader[] = [
  "ean_reader",
  "ean_8_reader",
  "code_128_reader",
  "upc_reader",
  "upc_e_reader",
  "code_39_reader",
];

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
  /** CSS class applied to the camera container (fills the viewfinder). */
  className?: string;
  /** Whether torch/flashlight should be on. Silently ignored if unsupported. */
  torch?: boolean;
};

function getActiveVideoTrack(): MediaStreamTrack | null {
  const videos = document.querySelectorAll("video");
  for (const v of Array.from(videos)) {
    const stream = (v as HTMLVideoElement & { srcObject?: MediaStream | null }).srcObject;
    if (stream instanceof MediaStream) {
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) return tracks[0];
    }
  }
  return null;
}

function applyToTrack(track: MediaStreamTrack | null, c: Record<string, unknown>) {
  if (!track) return;
  track
    .applyConstraints({ advanced: [c] } as unknown as MediaTrackConstraints)
    .catch(() => {});
}

// Live viewfinder for the sell page. Engine order:
//   1. Native BarcodeDetector (Chrome/Android — sharp 1080p + all formats + QR)
//   2. QuaggaJS 1D pipeline (iOS Safari / Firefox / old WebViews)
// Both paths share the same dedup (same code ignored for 1.5s) so holding the
// camera over one item doesn't machine-gun the cart.
export function InlineScanner({ onDetected, onClose, className, torch = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const nativeRef = useRef<NativeScanHandle | null>(null);
  const engineRef = useRef<"native" | "quagga" | null>(null);
  const torchRef = useRef(torch);
  torchRef.current = torch;

  // Torch follows the prop on whichever engine is live.
  useEffect(() => {
    const track = nativeRef.current?.track ?? getActiveVideoTrack();
    applyToTrack(track, { torch });
  }, [torch]);

  useEffect(() => {
    let cancelled = false;

    const emit = (raw: string) => {
      const code = String(raw);
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === code && now - last.at < 1500) return;
      lastScanRef.current = { code, at: now };
      try { navigator.vibrate?.(120); } catch { /* ignore */ }
      onDetectedRef.current(code);
    };

    const startQuagga = () => {
      const target = containerRef.current;
      if (!target || cancelled) return;
      engineRef.current = "quagga";

      const onResult = (result: QuaggaJSResultObject) => {
        const code = result?.codeResult?.code;
        if (code) emit(String(code));
      };
      const config: QuaggaJSConfigObject = {
        inputStream: {
          type: "LiveStream",
          target,
          constraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        locator: { patchSize: "medium", halfSample: true },
        numOfWorkers: 0,
        frequency: 10,
        decoder: { readers: READERS },
        locate: true,
      };
      Quagga.init(config, (err) => {
        if (err || cancelled) return;
        Quagga.start();
        setTimeout(() => {
          const track = getActiveVideoTrack();
          applyToTrack(track, { focusMode: "continuous" });
          if (torchRef.current) applyToTrack(track, { torch: true });
        }, 600);
      });
      Quagga.onDetected(onResult);
      quaggaCleanup = () => {
        try { Quagga.offDetected(onResult); } catch { /* ignore */ }
        try { Quagga.stop(); } catch { /* ignore */ }
        applyToTrack(getActiveVideoTrack(), { torch: false });
      };
    };

    let quaggaCleanup: (() => void) | null = null;

    (async () => {
      if (await nativeScannerSupported()) {
        const video = videoRef.current;
        if (!video || cancelled) return;
        try {
          const handle = await startNativeScanner({
            video,
            onCode: (text) => emit(text),
          });
          if (cancelled) {
            handle.stop();
            return;
          }
          nativeRef.current = handle;
          engineRef.current = "native";
          video.style.display = "block"; // hidden until the native stream owns it
          if (torchRef.current) applyToTrack(handle.track, { torch: true });
          return;
        } catch {
          // Camera refused the native path (permissions OK but stream failed,
          // or play() interrupted) → try the Quagga pipeline instead.
        }
      }
      startQuagga();
    })();

    return () => {
      cancelled = true;
      nativeRef.current?.stop();
      nativeRef.current = null;
      quaggaCleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tap on viewfinder → single-shot focus at that spot, then back to continuous.
  function handleTapFocus() {
    const track = nativeRef.current?.track ?? getActiveVideoTrack();
    applyToTrack(track, { focusMode: "single-shot" });
    setTimeout(() => applyToTrack(track, { focusMode: "continuous" }), 2000);
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleTapFocus}
      style={{ cursor: "crosshair" }}
    >
      {/* Native-engine video (hidden/no stream when Quagga owns the container). */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          display: "none",
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}
