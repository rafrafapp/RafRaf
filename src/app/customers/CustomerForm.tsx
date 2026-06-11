"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/i18n/get-dictionary";
import { customerSchema } from "@/lib/validation/customer";
import { saveCustomer } from "@/lib/offline/customers-repo";
import { syncAll } from "@/lib/offline/sync";
import type { LocalCustomer } from "@/lib/offline/db";
import { Spinner } from "@/components/Spinner";
import styles from "@/app/products/product-form.module.css";

type Props = {
  mode: "create" | "edit";
  merchantId: string;
  initial?: LocalCustomer;
  customers: Dictionary["customers"];
  common: Dictionary["common"];
  onSaved?: () => void;
};

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? "" : v.toString();
}

export function CustomerForm({
  mode,
  merchantId,
  initial,
  customers: c,
  common,
  onSaved,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = customerSchema.safeParse({
      name: str(fd, "name"),
      phone: str(fd, "phone"),
      neighborhood: str(fd, "neighborhood"),
      telegram_chat_id: str(fd, "telegram_chat_id"),
    });
    if (!parsed.success) {
      setError(c.errors.invalid);
      return;
    }
    start(async () => {
      try {
        await saveCustomer({ mode, merchantId, base: initial, data: parsed.data });
        void syncAll(merchantId).catch(() => {});
        if (mode === "edit") onSaved?.();
        else router.push("/customers");
      } catch {
        setError(c.errors.failed);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <label className={styles.label}>
        {c.fields.name}
        <input
          className={styles.input}
          name="name"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
        />
      </label>

      <label className={styles.label}>
        {c.fields.phone} <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="phone"
          maxLength={40}
          dir="ltr"
          inputMode="tel"
          defaultValue={initial?.phone ?? ""}
        />
      </label>

      <label className={styles.label}>
        {c.fields.neighborhood}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="neighborhood"
          maxLength={200}
          defaultValue={initial?.neighborhood ?? ""}
        />
      </label>

      <label className={styles.label}>
        {c.fields.telegramChatId}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="telegram_chat_id"
          dir="ltr"
          inputMode="numeric"
          maxLength={40}
          defaultValue={initial?.telegram_chat_id ?? ""}
          placeholder="123456789"
        />
      </label>
      <p className={styles.muted}>{c.telegramHint}</p>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            {c.saving}
          </>
        ) : (
          c.save
        )}
      </button>
    </form>
  );
}
