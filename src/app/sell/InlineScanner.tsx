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
};

export function InlineScanner({ onDetected, onClose, className }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

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
    });
    Quagga.onDetected(onResult);

    return () => {
      try { Quagga.offDetected(onResult); } catch { /* ignore */ }
      try { Quagga.stop(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div ref={viewportRef} className={className} />;
}
