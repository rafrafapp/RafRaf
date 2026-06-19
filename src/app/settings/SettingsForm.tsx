"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { NOTIFY_CHANNELS } from "@/lib/validation/merchant";
import { updateNotificationSettings } from "@/lib/merchant/actions";
import { Spinner } from "@/components/Spinner";
import { BackButton } from "@/components/BackButton";
import { CopyField } from "@/components/CopyField";
import styles from "@/app/products/product-form.module.css";

type Props = {
  initial: {
    notify_channel: string;
    telegram_chat_id: string;
    offers_mobile_credit: boolean;
  };
  settings: Dictionary["settings"];
  common: Dictionary["common"];
  botUsername: string | null;
};

export function SettingsForm({ initial, settings: s, common, botUsername }: Props) {
  const [state, formAction, pending] = useActionState(
    updateNotificationSettings,
    {} as { ok?: boolean; error?: string },
  );
  const [channel, setChannel] = useState(initial.notify_channel || "telegram");
  const channels = s.channels as Record<string, string>;
  const errors = s.errors as Record<string, string>;

  return (
    <form action={formAction} className={styles.form}>
      {state.error && (
        <p className={styles.error} role="alert">
          {errors[state.error] ?? errors.failed}
        </p>
      )}
      {state.ok && (
        <p className={styles.muted} role="status">
          {s.saved}
        </p>
      )}

      <label className={styles.label} id="telegram-section">
        {s.notifChannel}
        <select
          className={styles.input}
          name="notify_channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          {NOTIFY_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {channels[c]}
            </option>
          ))}
        </select>
      </label>

      {channel === "telegram" && (
        <div className={styles.customSection}>
          <p className={styles.muted}>{s.telegramHint}</p>
          {botUsername && (
            <a
              className={styles.scanBtn}
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.openBot}
            </a>
          )}
          <label className={styles.label}>
            {s.telegramChatId}
            <input
              className={styles.input}
              name="telegram_chat_id"
              dir="ltr"
              inputMode="numeric"
              maxLength={40}
              defaultValue={initial.telegram_chat_id}
              placeholder="123456789"
            />
          </label>
          {initial.telegram_chat_id && (
            <div className={styles.label}>
              {s.savedChatId}
              <CopyField
                value={initial.telegram_chat_id}
                copyLabel={common.copy}
                copiedLabel={common.copied}
              />
            </div>
          )}
        </div>
      )}
      {channel !== "telegram" && (
        <input
          type="hidden"
          name="telegram_chat_id"
          value={initial.telegram_chat_id}
        />
      )}

      <label
        className={styles.label}
        style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}
      >
        <input
          type="checkbox"
          name="offers_mobile_credit"
          defaultChecked={initial.offers_mobile_credit}
        />
        {s.offersMobileCredit}
      </label>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            {s.saving}
          </>
        ) : (
          s.save
        )}
      </button>

      <BackButton label={s.backToDashboard} fallback="/dashboard" />
    </form>
  );
}
