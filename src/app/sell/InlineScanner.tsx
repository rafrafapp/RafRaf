"use client";

import { useEffect, useRef } from "react";
import Quagga, {
  type QuaggaJSConfigObject,
  type QuaggaJSResultObject,
  type QuaggaJSCodeReader,
} from "@ericblade/quagga2";

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
  /** CSS class applied to the Quagga target div (fills the viewfinder). */
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

async function applyFocusMode(mode: "continuous" | "single-shot"): Promise<void> {
  try {
    const track = getActiveVideoTrack();
    if (!track) return;
    const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
    if (!caps?.focusMode) return;
    await track.applyConstraints({ advanced: [{ focusMode: mode } as MediaTrackConstraintSet] });
  } catch {
    // silently ignore — browser may not support focusMode
  }
}

async function applyTorch(enabled: boolean): Promise<void> {
  try {
    const track = getActiveVideoTrack();
    if (!track) return;
    const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
    if (!caps?.torch) return;
    await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
  } catch {
    // silently ignore — browser may not support torch
  }
}

export function InlineScanner({ onDetected, onClose, className, torch = false }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const torchRef = useRef(torch);
  torchRef.current = torch;

  // Apply torch when prop changes
  useEffect(() => {
    void applyTorch(torch);
  }, [torch]);

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;

    const onResult = (result: QuaggaJSResultObject) => {
      const code = result?.codeResult?.code;
      if (!code) return;
      const now = Date.now();
      const last = lastScanRef.current;
      if (last && last.code === String(code) && now - last.at < 1500) return;
      lastScanRef.current = { code: String(code), at: now };
      try { navigator.vibrate?.(120); } catch { /* ignore */ }
      onDetectedRef.current(String(code));
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
      if (err) return;
      Quagga.start();
      // Try to enable continuous autofocus and initial torch state after stream starts
      setTimeout(() => {
        void applyFocusMode("continuous");
        if (torchRef.current) void applyTorch(true);
      }, 600);
    });
    Quagga.onDetected(onResult);

    return () => {
      try { Quagga.offDetected(onResult); } catch { /* ignore */ }
      try { Quagga.stop(); } catch { /* ignore */ }
      // Turn off torch on unmount
      void applyTorch(false);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tap on viewfinder → trigger single-shot focus
  function handleTapFocus() {
    void applyFocusMode("single-shot");
  }

  return (
    <div
      ref={viewportRef}
      className={className}
      onClick={handleTapFocus}
      style={{ cursor: "crosshair" }}
    />
  );
}
