"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProductLocal } from "@/lib/offline/products-repo";
import { syncAll } from "@/lib/offline/sync";
import styles from "./product-form.module.css";

type Props = {
  id: string;
  merchantId: string;
  label: string;
  confirmText: string;
};

// Offline-first delete: tombstone in IndexedDB first (so it vanishes from the
// list immediately), then push best-effort. RLS ensures only the owner's own
// product is ever removed server-side.
export function DeleteProductButton({
  id,
  merchantId,
  label,
  confirmText,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className={styles.delete}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => {
          await deleteProductLocal(id);
          void syncAll(merchantId).catch(() => {});
          router.push("/products");
        });
      }}
    >
      {label}
    </button>
  );
}
