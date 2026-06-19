"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./TutorialOverlay.module.css";

export type TutorialStep = {
  target: string;       // CSS selector
  title_ar: string;
  text_ar: string;
  position: "top" | "bottom" | "left" | "right";
};

type Rect = { top: number; left: number; width: number; height: number };

type Props = {
  steps: TutorialStep[];
  onComplete: () => void;
  onSkip: () => void;
};

const PAD = 8;
const TOOLTIP_W = 280;
const TOOLTIP_H = 190;
const GAP = 14;

function tooltipPos(
  rect: Rect,
  position: TutorialStep["position"],
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const clampL = (x: number) => Math.max(12, Math.min(x, vw - TOOLTIP_W - 12));
  const clampT = (y: number) => Math.max(12, Math.min(y, vh - TOOLTIP_H - 12));

  if (position === "bottom") {
    return { top: clampT(rect.top + rect.height + PAD + GAP), left: clampL(cx - TOOLTIP_W / 2) };
  }
  if (position === "top") {
    return { top: clampT(rect.top - TOOLTIP_H - PAD - GAP), left: clampL(cx - TOOLTIP_W / 2) };
  }
  if (position === "right") {
    return { top: clampT(rect.top + rect.height / 2 - TOOLTIP_H / 2), left: clampL(rect.left + rect.width + PAD + GAP) };
  }
  // left
  return { top: clampT(rect.top + rect.height / 2 - TOOLTIP_H / 2), left: clampL(rect.left - TOOLTIP_W - PAD - GAP) };
}

export function TutorialOverlay({ steps, onComplete, onSkip }: Props) {
  const [current, setCurrent] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = steps[current];

  const measure = useCallback((target: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);

    timerRef.current = setTimeout(() => {
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

      timerRef.current = setTimeout(() => {
        const el2 = el ?? document.querySelector(target);
        if (!el2) { setRect(null); setVisible(true); return; }
        const r = el2.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setVisible(true);
      }, 300);
    }, 80);
  }, []);

  useEffect(() => {
    measure(step.target);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, step.target, measure]);

  // Keep spotlight in sync on resize / scroll
  useEffect(() => {
    const sync = () => {
      const el = document.querySelector(step.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => { window.removeEventListener("resize", sync); window.removeEventListener("scroll", sync, true); };
  }, [step.target]);

  function next() {
    if (current < steps.length - 1) setCurrent((c) => c + 1);
    else onComplete();
  }

  const spotStyle: React.CSSProperties | undefined = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : undefined;

  return (
    <div className={styles.root} role="dialog" aria-modal="true" dir="rtl">
      <div className={styles.blocker} onClick={next} />
      {spotStyle && <div className={styles.spotlight} style={spotStyle} />}
      {visible && (
        <div
          className={styles.tooltip}
          style={rect ? tooltipPos(rect, step.position) : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
        >
          <p className={styles.title}>{step.title_ar}</p>
          <p className={styles.text}>{step.text_ar}</p>

          <div className={styles.progress}>
            {steps.map((_, i) => (
              <span key={i} className={`${styles.dot} ${i === current ? styles.dotActive : ""}`} />
            ))}
          </div>

          <div className={styles.actions}>
            <button className={styles.skipBtn} onClick={onSkip} type="button">
              تخطي
            </button>
            <button className={styles.nextBtn} onClick={next} type="button">
              {current === steps.length - 1 ? "إنهاء" : "التالي →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
