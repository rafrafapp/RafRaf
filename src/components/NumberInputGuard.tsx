"use client";

import { useEffect } from "react";

// Global fix for the "scroll changes the number" bug: a focused
// <input type="number"> intercepts wheel events and increments/decrements its
// value when the user scrolls the page. We blur the field on any wheel event so
// the page scrolls normally and the value is left untouched. One listener covers
// every number input in the app (current and future) — no per-input handler.
export function NumberInputGuard() {
  useEffect(() => {
    const onWheel = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number") el.blur();
    };
    // Passive: we only blur, never preventDefault — page scrolling is unaffected.
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
