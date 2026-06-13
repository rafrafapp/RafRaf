"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CameraCapture.module.css";

type Props = {
  onCapture: (file: File) => void;
  onClose: () => void;
  labels: {
    title: string;
    capture: string;
    retake: string;
    confirm: string;
    close: string;
    error: string;
    zoom: string;
  };
};

type ZoomRange = { min: number; max: number; step: number };

// Direct camera capture (mobile + desktop): open the rear camera, take a photo,
// preview → confirm/retake, and hand a JPEG File up to the form (which uploads it
// to Cloudinary on save, same path as a picked file). Zoom: hardware where the
// device supports it, otherwise a CSS-scale fallback (center-cropped on capture).
export function CameraCapture({ onCapture, onClose, labels }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const hwZoomRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const [error, setError] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [range, setRange] = useState<ZoomRange | null>(null);

  // Start the camera on mount; stop every track on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { zoom?: ZoomRange })
          | undefined;
        if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
          hwZoomRef.current = true;
          setRange({
            min: caps.zoom.min,
            max: caps.zoom.max,
            step: caps.zoom.step || 0.1,
          });
          setZoom(caps.zoom.min);
        } else {
          hwZoomRef.current = false;
          setRange({ min: 1, max: 4, step: 0.1 });
          setZoom(1);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Escape closes for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyZoom(z: number) {
    if (!range) return;
    const clamped = Math.min(Math.max(z, range.min), range.max);
    setZoom(clamped);
    const track = trackRef.current;
    if (hwZoomRef.current && track) {
      track
        .applyConstraints({
          advanced: [{ zoom: clamped }],
        } as unknown as MediaTrackConstraints)
        .catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.style.transform = `scale(${clamped})`;
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

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return;
    // With CSS-zoom (no hardware), center-crop to mimic the on-screen zoom.
    const z = hwZoomRef.current ? 1 : zoom;
    const sw = vw / z;
    const sh = vh / z;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blobRef.current = blob;
        setPhoto(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake() {
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(null);
    blobRef.current = null;
  }

  function confirm() {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    if (photo) URL.revokeObjectURL(photo);
    onCapture(file);
  }

  const uiStep = range ? Math.max((range.max - range.min) / 10, range.step) : 0.5;

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
        ) : photo ? (
          <div className={styles.viewport}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className={styles.shot} />
          </div>
        ) : (
          <div
            className={styles.viewport}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              autoPlay
            />
            {range && (
              <div className={styles.zoomControls}>
                <button
                  type="button"
                  className={styles.zoomBtn}
                  aria-label="−"
                  onClick={() => applyZoom(zoom - uiStep)}
                >
                  −
                </button>
                <input
                  type="range"
                  className={styles.slider}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={zoom}
                  onChange={(e) => applyZoom(Number(e.target.value))}
                  aria-label={labels.zoom}
                />
                <button
                  type="button"
                  className={styles.zoomBtn}
                  aria-label="+"
                  onClick={() => applyZoom(zoom + uiStep)}
                >
                  +
                </button>
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {error ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={onClose}
            >
              {labels.close}
            </button>
          ) : photo ? (
            <>
              <button
                type="button"
                className={styles.secondary}
                onClick={retake}
              >
                {labels.retake}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={confirm}
              >
                {labels.confirm}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.secondary}
                onClick={onClose}
              >
                {labels.close}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={capture}
              >
                {labels.capture}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
