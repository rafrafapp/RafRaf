"use client";

import { useEffect } from "react";

// Registers the PWA service worker from bundled JS (not an inline script), so it
// is trusted under the strict nonce CSP via 'strict-dynamic'. next-pwa is set to
// register: false; the SW only exists in production builds.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure must never break the app.
      });
    }
  }, []);
  return null;
}
