"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/i18n/get-dictionary";
import { supplierSchema } from "@/lib/validation/customer";
import { saveSupplier } from "@/lib/offline/suppliers-repo";
import { syncAll } from "@/lib/offline/sync";
import type { LocalSupplier } from "@/lib/offline/db";
import { Spinner } from "@/components/Spinner";
import styles from "@/app/products/product-form.module.css";

type Props = {
  mode: "create" | "edit";
  merchantId: string;
  initial?: LocalSupplier;
  suppliers: Dictionary["suppliers"];
  common: Dictionary["common"];
  onSaved?: () => void;
};

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? "" : v.toString();
}

export function SupplierForm({
  mode,
  merchantId,
  initial,
  suppliers: s,
  common,
  onSaved,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = supplierSchema.safeParse({
      name: str(fd, "name"),
      phone: str(fd, "phone"),
      payment_terms: str(fd, "payment_terms"),
    });
    if (!parsed.success) {
      setError(s.errors.invalid);
      return;
    }
    start(async () => {
      try {
        await saveSupplier({ mode, merchantId, base: initial, data: parsed.data });
        void syncAll(merchantId).catch(() => {});
        if (mode === "edit") onSaved?.();
        else router.push("/suppliers");
      } catch {
        setError(s.errors.failed);
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
        {s.fields.name}
        <input
          className={styles.input}
          name="name"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
        />
      </label>

      <label className={styles.label}>
        {s.fields.phone} <span className={styles.muted}>({common.optional})</span>
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
        {s.fields.paymentTerms}{" "}
        <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="payment_terms"
          maxLength={200}
          defaultValue={initial?.payment_terms ?? ""}
        />
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
    </form>
  );
}
