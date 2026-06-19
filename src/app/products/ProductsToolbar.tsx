"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./products.module.css";

// Camera/decoder bundle is heavy + browser-only — load only when the scanner opens.
const BarcodeScanner = dynamic(
  () => import("@/components/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false },
);

type ScanLabels = {
  title: string;
  hint: string;
  error: string;
  close: string;
  upload: string;
};

type Props = {
  categories: string[];
  labels: {
    search: string;
    filterCategory: string;
    allCategories: string;
    scan: string;
  };
  scanLabels: ScanLabels;
};

export function ProductsToolbar({ categories, labels, scanLabels }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [scanning, setScanning] = useState(false);
  const category = sp.get("category") ?? "";
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function navigate(nextQ: string, nextCategory: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextCategory) params.set("category", nextCategory);
    const qs = params.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  function onSearchChange(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(value, category), 350);
  }

  return (
    <div className={styles.toolbar} id="search-products">
      <div className={styles.searchWrap}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className={styles.search}
          type="search"
          placeholder={labels.search}
          aria-label={labels.search}
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {/* Scan a barcode → fill the search → filter the list. */}
        <button
          type="button"
          className={styles.searchScanBtn}
          onClick={() => setScanning(true)}
          aria-label={labels.scan}
          title={labels.scan}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" />
          </svg>
        </button>
      </div>
      <select
        className={styles.categorySelect}
        aria-label={labels.filterCategory}
        value={category}
        onChange={(e) => navigate(q, e.target.value)}
      >
        <option value="">{labels.allCategories}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {scanning && (
        <BarcodeScanner
          onDetected={(text) => {
            setQ(text);
            navigate(text, category);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
          labels={scanLabels}
        />
      )}
    </div>
  );
}
