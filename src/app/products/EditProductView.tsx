"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getLocalProduct } from "@/lib/offline/products-repo";
import { useSync } from "@/lib/offline/useSync";
import { QuickAddForm } from "./QuickAddForm";
import styles from "./product-form.module.css";

type Props = {
  id: string;
  merchantId: string;
  locale: Locale;
  products: Dictionary["products"];
  common: Dictionary["common"];
  currency: string;
};

export function EditProductView({
  id,
  merchantId,
  locale,
  products,
  common,
  currency,
}: Props) {
  useSync(merchantId);
  const product = useLiveQuery(() => getLocalProduct(id), [id]);

  if (product === undefined) {
    return <p className={styles.muted}>{common.loading}</p>;
  }
  if (product === null || product._deleted) {
    return (
      <p className={styles.error} role="alert">
        {products.errors.not_found}
      </p>
    );
  }

  return (
    <QuickAddForm
      mode="edit"
      merchantId={merchantId}
      initial={product}
      products={products}
      common={common}
      currency={currency}
      locale={locale}
    />
  );
}
