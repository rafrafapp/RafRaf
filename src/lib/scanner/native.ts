"use client";

// Native barcode engine — the Shape Detection API (`BarcodeDetector`) on a
// high-resolution camera stream. Hardware-accelerated on Chrome/Android (ML Kit
// under the hood), reads ALL common formats — 1D retail codes AND QR — live,
// and stays sharp because we request 1080p + continuous autofocus up front.
//
// Callers fall back to the QuaggaJS pipeline when this reports unsupported
// (iOS Safari, Firefox, older WebViews) — so every device still scans.

export type NativeScanHandle = {
  stop: () => void;
  /** The live video track — for torch / zoom / tap-to-focus constraints. */
  track: MediaStreamTrack | null;
};

// 1D retail + QR. (BarcodeDetector silently ignores formats it doesn't know.)
const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

let supportCache: boolean | null = null;

/** True when BarcodeDetector exists AND can decode the retail formats. */
export async function nativeScannerSupported(): Promise<boolean> {
  if (supportCache !== null) return supportCache;
  try {
    if (typeof window === "undefined" || !window.BarcodeDetector) {
      supportCache = false;
      return false;
    }
    const formats = await window.BarcodeDetector.getSupportedFormats();
    supportCache = formats.includes("ean_13") || formats.includes("qr_code");
  } catch {
    supportCache = false;
  }
  return supportCache;
}

/**
 * Open the back camera into `video` and poll frames through BarcodeDetector.
 * Resolves once the stream is playing. Throws if the camera can't start
 * (caller should fall back to Quagga or show the camera-error state).
 */
export async function startNativeScanner(opts: {
  video: HTMLVideoElement;
  onCode: (text: string, format: string) => void;
  /** ms between detection passes (default 120 — ~8 fps decode, cheap). */
  intervalMs?: number;
}): Promise<NativeScanHandle> {
  const { video, onCode, intervalMs = 120 } = opts;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "environment",
      // 1080p ideal — the #1 fix for blurry decodes on modern phones. The
      // browser negotiates down automatically on weaker cameras.
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  const track = stream.getVideoTracks()[0] ?? null;

  // Continuous autofocus immediately (close-up barcodes stay sharp).
  if (track) {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { focusMode?: string[] })
      | undefined;
    if (caps?.focusMode?.includes("continuous")) {
      track
        .applyConstraints({
          advanced: [{ focusMode: "continuous" }],
        } as unknown as MediaTrackConstraints)
        .catch(() => {});
    }
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true"); // iOS: never fullscreen-hijack
  video.muted = true;
  await video.play();

  const detector = new window.BarcodeDetector!({ formats: FORMATS });

  let stopped = false;
  let busy = false;
  const timer = setInterval(async () => {
    if (stopped || busy || video.readyState < 2) return;
    busy = true;
    try {
      const found = await detector.detect(video);
      if (!stopped && found.length > 0 && found[0].rawValue) {
        onCode(found[0].rawValue, found[0].format);
      }
    } catch {
      /* transient decode errors are normal (e.g. mid-frame) */
    } finally {
      busy = false;
    }
  }, intervalMs);

  return {
    track,
    stop() {
      stopped = true;
      clearInterval(timer);
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.srcObject = null;
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
