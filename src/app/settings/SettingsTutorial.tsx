"use client";

import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/Tutorial/TutorialOverlay";
import type { TutorialStep } from "@/components/Tutorial/TutorialOverlay";

const SETTINGS_STEPS: TutorialStep[] = [
  { target: "#store-profile", title_ar: "معلومات محلك", text_ar: "عدّل اسم محلك وبياناته هنا", position: "bottom" },
  { target: "#telegram-section", title_ar: "تيليغرام", text_ar: "ربط تيليغرام لتلقي التقارير والتنبيهات", position: "bottom" },
  { target: "#backup-section", title_ar: "النسخ الاحتياطي", text_ar: "بياناتك محفوظة تلقائياً على Google Sheets كل ليل", position: "bottom" },
];

export function SettingsTutorial() {
  const tutorial = useTutorial("settings");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: "0.75rem" }}>
        <button
          type="button"
          onClick={tutorial.reset}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ؟ شرح الإعدادات
        </button>
      </div>
      {tutorial.show && (
        <TutorialOverlay
          steps={SETTINGS_STEPS}
          onComplete={tutorial.onComplete}
          onSkip={tutorial.onSkip}
        />
      )}
    </>
  );
}
