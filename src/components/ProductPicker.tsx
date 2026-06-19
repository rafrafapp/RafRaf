"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type LocalProduct } from "@/lib/offline/db";
import { safeDisplay } from "@/lib/validation/sanitize";
import styles from "./transactions.module.css";

const BarcodeScanner = dynamic(
  () => import("@/components/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false },
);

const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  onPick: (product: LocalProduct) => void;
  labels: {
    search: string;
    scan: string;
    empty: string;
    noProducts: string;
    available: string;
  };
  scanLabels: {
    title: string;
    hint: string;
    error: string;
    close: string;
    upload: string;
  };
};

// Search the local (offline) product catalogue and/or scan a barcode, then hand
// the chosen product back to the parent (sell cart, buy/return form).
export function ProductPicker({
  merchantId,
  currency,
  onPick,
  labels,
  scanLabels,
}: Props) {
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);

  const all = useLiveQuery(
    () =>
      getDb()
        .products.where("[merchant_id+_deleted]")
        .equals([merchantId, 0])
        .toArray(),
    [merchantId],
  );
  const products = all ?? [];

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            (p.name_en?.toLowerCase().includes(needle) ?? false) ||
            (p.barcode?.toLowerCase().includes(needle) ?? false),
        )
      : products;
    return [...list]
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .slice(0, 30);
  }, [products, q]);

  function onDetected(code: string) {
    setScanning(false);
    const exact = products.find((p) => p.barcode === code);
    if (exact) {
      onPick(exact);
      setQ("");
    } else {
      setQ(code);
    }
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        <input
          id="search-bar"
          className={styles.pickerInput}
          type="search"
          placeholder={labels.search}
          aria-label={labels.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          id="barcode-btn"
          type="button"
          className={styles.pickerScan}
          onClick={() => setScanning(true)}
        >
          {labels.scan}
        </button>
      </div>

      {products.length === 0 ? (
        <p className={styles.pickerEmpty}>{labels.noProducts}</p>
      ) : results.length === 0 ? (
        <p className={styles.pickerEmpty}>{labels.empty}</p>
      ) : (
        <ul className={styles.pickerResults}>
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.pickerItem}
                onClick={() => onPick(p)}
              >
                <span className={styles.pickerName}>{safeDisplay(p.name)}</span>
                <span className={styles.pickerMeta}>
                  {labels.available}: {nf.format(Number(p.stock))} ·{" "}
                  {nf.format(Number(p.sell_price))} {currency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {scanning && (
        <BarcodeScanner
          onDetected={onDetected}
          onClose={() => setScanning(false)}
          labels={scanLabels}
        />
      )}
    </div>
  );
}
