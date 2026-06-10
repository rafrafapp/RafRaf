"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { ProductCustomField } from "@/lib/validation/product";
import { getLocalProduct } from "@/lib/offline/products-repo";
import { useSync } from "@/lib/offline/useSync";
import { ProductForm } from "./ProductForm";
import { DeleteProductButton } from "./DeleteProductButton";
import styles from "./product-form.module.css";

type Props = {
  id: string;
  merchantId: string;
  customFields: ProductCustomField[];
  products: Dictionary["products"];
  common: Dictionary["common"];
  currency: string;
};

export function EditProductView({
  id,
  merchantId,
  customFields,
  products,
  common,
  currency,
}: Props) {
  // Pull on mount so a direct link to an unvisited product still resolves.
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
    <>
      <ProductForm
        mode="edit"
        merchantId={merchantId}
        initial={product}
        customFields={customFields}
        products={products}
        common={common}
        currency={currency}
      />
      <div className={styles.deleteWrap}>
        <DeleteProductButton
          id={product.id}
          merchantId={merchantId}
          label={products.delete}
          confirmText={products.deleteConfirm}
        />
      </div>
    </>
  );
}
