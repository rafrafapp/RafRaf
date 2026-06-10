"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { createStore, type SetupState } from "@/lib/merchant/actions";
import { CURRENCIES } from "@/lib/validation/merchant";
import styles from "./setup.module.css";

type Props = {
  setup: Dictionary["setup"];
  common: Dictionary["common"];
  // Active business types (slug + locale-resolved name) from the DB.
  businessTypes: { slug: string; name: string }[];
};

const empty: SetupState = {};

export function SetupWizard({ setup, common, businessTypes }: Props) {
  const [state, action, pending] = useActionState(createStore, empty);
  const errors = setup.errors as Record<string, string>;
  const errorMsg = state.error ? errors[state.error] : null;

  return (
    <form action={action} className={styles.form}>
      {errorMsg && (
        <p className={styles.error} role="alert">
          {errorMsg}
        </p>
      )}

      <label className={styles.label}>
        {setup.storeName}
        <input className={styles.input} name="store_name" required maxLength={120} />
      </label>

      <label className={styles.label}>
        {setup.storeNameEn} <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="store_name_en"
          maxLength={120}
          dir="ltr"
        />
      </label>

      <label className={styles.label}>
        {setup.businessType}
        <select className={styles.input} name="business_type" required defaultValue="">
          <option value="" disabled>
            —
          </option>
          {businessTypes.map((bt) => (
            <option key={bt.slug} value={bt.slug}>
              {bt.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.label}>
        {setup.currency}
        <select
          className={styles.input}
          name="default_currency"
          required
          defaultValue="SYP"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.label}>
        {setup.phone} <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="phone"
          type="tel"
          maxLength={40}
          dir="ltr"
        />
      </label>

      <label className={styles.label}>
        {setup.logoUrl} <span className={styles.muted}>({common.optional})</span>
        <input
          className={styles.input}
          name="logo_url"
          type="url"
          maxLength={500}
          dir="ltr"
        />
      </label>

      <button type="submit" className={styles.submit} disabled={pending}>
        {setup.submit}
      </button>
    </form>
  );
}
