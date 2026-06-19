"use client";

import { useCallback, useEffect, useState } from "react";

export function useTutorial(pageKey: string) {
  const key = `tutorial_done_${pageKey}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setShow(true);
    } catch {
      // localStorage unavailable
    }
  }, [key]);

  const done = useCallback(() => {
    try { localStorage.setItem(key, "1"); } catch {}
    setShow(false);
  }, [key]);

  const reset = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setShow(true);
  }, [key]);

  return { show, onComplete: done, onSkip: done, reset };
}
