"use client";

import { useCallback, useEffect, useState } from "react";
import { syncAll } from "./sync";

// Wires the offline engine to React: syncs everything (ledger + products) on
// mount and on reconnect, and exposes connectivity + syncing state plus a manual
// trigger. Used by both the products and transactions screens.
export function useSync(merchantId: string) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    setSyncing(true);
    try {
      await syncAll(merchantId);
    } finally {
      setSyncing(false);
    }
  }, [merchantId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void sync();

    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [sync]);

  return { online, syncing, sync };
}
