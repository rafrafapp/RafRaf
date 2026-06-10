"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./products.module.css";

type Props = {
  categories: string[];
  labels: { search: string; filterCategory: string; allCategories: string };
};

export function ProductsToolbar({ categories, labels }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const category = sp.get("category") ?? "";
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Build /products?… from the current filters. Page is intentionally dropped so
  // any new search/filter starts back at page 1.
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
    // Debounce so we don't navigate on every keystroke.
    timer.current = setTimeout(() => navigate(value, category), 350);
  }

  return (
    <div className={styles.toolbar}>
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
    </div>
  );
}
