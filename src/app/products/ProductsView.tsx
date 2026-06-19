"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getDb, type LocalProduct } from "@/lib/offline/db";
import { useSync } from "@/lib/offline/useSync";
import { safeDisplay } from "@/lib/validation/sanitize";
import { ProductsToolbar } from "./ProductsToolbar";
import { PageHeader } from "@/components/PageHeader";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay, type TutorialStep } from "@/components/Tutorial/TutorialOverlay";
import styles from "./products.module.css";

const PRODUCTS_STEPS: TutorialStep[] = [
  { target: "#search-products", title_ar: "البحث", text_ar: "ابحث عن أي منتج بالاسم أو الباركود", position: "bottom" },
  { target: "#product-list", title_ar: "قائمة المنتجات", text_ar: "كل منتجاتك هنا — الأحمر = نفد، البرتقالي = ناقص", position: "top" },
  { target: "#add-product-btn", title_ar: "إضافة منتج", text_ar: "اضغط هنا لإضافة منتج جديد", position: "top" },
  { target: "#sync-badge", title_ar: "حالة المزامنة", text_ar: "يظهر هنا إذا البيانات محفوظة أو في انتظار الإنترنت", position: "top" },
];

const PAGE_SIZE = 20;
const nf = new Intl.NumberFormat("en-US");

type Props = {
  merchantId: string;
  currency: string;
  locale: Locale;
  appName: string;
  products: Dictionary["products"];
  common: Dictionary["common"];
};

export function ProductsView({
  merchantId,
  currency,
  locale,
  products: p,
  common,
}: Props) {
  const tutorial = useTutorial("products");
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const category = sp.get("category") ?? "";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

  const { online, syncing } = useSync(merchantId);

  // Live, offline reads straight from IndexedDB — these re-render on any local
  // write or sync, online or offline.
  const all = useLiveQuery(
    () =>
      getDb()
        .products.where("[merchant_id+_deleted]")
        .equals([merchantId, 0])
        .toArray(),
    [merchantId],
  );
  const conflicts =
    useLiveQuery(
      () =>
        getDb().conflicts.where("merchant_id").equals(merchantId).toArray(),
      [merchantId],
      [],
    ) ?? [];
  // Product ids with an image still waiting to upload (offline / on next sync).
  const pendingImageIds =
    useLiveQuery(
      async () => {
        const imgs = await getDb()
          .product_images.where("merchant_id")
          .equals(merchantId)
          .toArray();
        return new Set(imgs.map((i) => i.product_id));
      },
      [merchantId],
      new Set<string>(),
    ) ?? new Set<string>();
  const img = p.image as Record<string, string>;

  const rowsAll: LocalProduct[] = all ?? [];
  // Show "loading" until the local read resolves, and during the very first
  // sync when there's nothing cached yet — avoids a false "no products" flash.
  const loading = all === undefined || (syncing && rowsAll.length === 0);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rowsAll) if (r.category) set.add(r.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [rowsAll]);

  const filtered = useMemo(() => {
    let list = rowsAll;
    if (category) list = list.filter((r) => r.category === category);
    if (q) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.name_en?.toLowerCase().includes(needle) ?? false) ||
          (r.barcode?.toLowerCase().includes(needle) ?? false),
      );
    }
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [rowsAll, q, category]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isFiltered = Boolean(q || category);

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  const dismissConflicts = () => {
    void getDb().conflicts.where("merchant_id").equals(merchantId).delete();
  };

  return (
    <main className={styles.main}>
      <PageHeader title={p.title} backHref="/dashboard" backLabel={common.back} />
      <div className={styles.content}>
      <div className={styles.titleRow}>
        <p className={styles.subtitle}>{p.subtitle}</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            id="sync-badge"
            style={{ fontSize: "0.75rem", color: online ? (syncing ? "var(--secondary)" : "var(--brand)") : "var(--error)", fontWeight: 600 }}
          >
            {!online ? "● غير متصل" : syncing ? "● مزامنة..." : "● محفوظ"}
          </span>
          <button type="button" onClick={tutorial.reset} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "3px 8px", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
            ؟
          </button>
        </div>
      </div>

      {!online && <p className={styles.offlineHint}>{p.sync.offlineHint}</p>}

      {conflicts.length > 0 && (
        <div className={styles.banner} role="alert">
          <div>
            <strong>
              {p.sync.conflicts.replace("{n}", String(conflicts.length))}
            </strong>
            <p className={styles.bannerHint}>{p.sync.conflictsHint}</p>
          </div>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={dismissConflicts}
          >
            {p.sync.dismiss}
          </button>
        </div>
      )}

      <ProductsToolbar
        categories={categories}
        labels={{
          search: p.search,
          filterCategory: p.filterCategory,
          allCategories: p.allCategories,
          scan: p.scan,
        }}
        scanLabels={{
          title: p.scanTitle,
          hint: p.scanHint,
          error: p.scanError,
          close: p.scanClose,
          upload: p.scanUpload,
        }}
      />

      {/* Add-product button sits below the search + category filters. */}
      <Link href="/products/new" className={styles.addBtnFull} id="add-product-btn">
        <svg
          className={styles.addIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {p.add}
      </Link>

      {loading ? (
        <p className={styles.count}>{common.loading}</p>
      ) : total === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {isFiltered ? p.emptyFiltered : p.empty}
          </p>
          {!isFiltered && <p className={styles.emptyHint}>{p.emptyHint}</p>}
        </div>
      ) : (
        <>
          <p className={styles.count}>
            {p.results}: {nf.format(total)}
          </p>

          <ul className={styles.list} id="product-list">
            {rows.map((row) => {
              const name =
                locale === "en" && row.name_en ? row.name_en : row.name;
              const secondary = locale === "en" ? row.name : row.name_en;
              const stock = Number(row.stock);
              const minStock = Number(row.min_stock);
              const out = stock <= 0;
              const low = !out && minStock > 0 && stock <= minStock;
              return (
                <li key={row.id}>
                  <Link href={`/products/${row.id}/edit`} className={styles.row}>
                    <div className={styles.rowLeft}>
                      {row.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image_url}
                          alt=""
                          className={styles.thumb}
                          loading="lazy"
                        />
                      )}
                      <div className={styles.rowMain}>
                        <span className={styles.name}>{safeDisplay(name)}</span>
                        {secondary && secondary !== name && (
                          <span className={styles.nameEn}>
                            {safeDisplay(secondary)}
                          </span>
                        )}
                        <div className={styles.meta}>
                          {row.barcode && (
                            <span className={styles.mono}>
                              {safeDisplay(row.barcode)}
                            </span>
                          )}
                          {row.category && (
                            <span className={styles.chip}>
                              {safeDisplay(row.category)}
                            </span>
                          )}
                          {pendingImageIds.has(row.id) && (
                            <span className={styles.chip}>{img.pendingBadge}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={styles.price}>
                        {nf.format(Number(row.sell_price))} {currency}
                      </span>
                      <span className={styles.stockWrap}>
                        <span className={styles.stockNum}>
                          {nf.format(stock)}
                        </span>
                        {out && (
                          <span className={styles.badgeOut}>{p.outOfStock}</span>
                        )}
                        {low && (
                          <span className={styles.badgeLow}>{p.lowStock}</span>
                        )}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {pageCount > 1 && (
            <nav className={styles.pagination} aria-label="pagination">
              {safePage > 1 ? (
                <Link href={pageHref(safePage - 1)} className={styles.pageBtn}>
                  {p.prev}
                </Link>
              ) : (
                <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>
                  {p.prev}
                </span>
              )}
              <span className={styles.pageInfo}>
                {p.pageOf
                  .replace("{page}", nf.format(safePage))
                  .replace("{pages}", nf.format(pageCount))}
              </span>
              {safePage < pageCount ? (
                <Link href={pageHref(safePage + 1)} className={styles.pageBtn}>
                  {p.next}
                </Link>
              ) : (
                <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>
                  {p.next}
                </span>
              )}
            </nav>
          )}
        </>
      )}
      </div>
      {tutorial.show && (
        <TutorialOverlay
          steps={PRODUCTS_STEPS}
          onComplete={tutorial.onComplete}
          onSkip={tutorial.onSkip}
        />
      )}
    </main>
  );
}
