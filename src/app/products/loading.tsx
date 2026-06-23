import styles from "./loading.module.css";

export default function ProductsLoading() {
  return (
    <div className={styles.page} dir="rtl">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.skeletonLine} style={{ width: "6rem", height: "1.1rem" }} />
        <div className={styles.skeletonLine} style={{ width: "5rem", height: "2rem", borderRadius: "0.6rem" }} />
      </div>

      {/* Search + tabs */}
      <div className={styles.toolbar}>
        <div className={styles.searchSkeleton} />
        <div className={styles.tabRow}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.tabSkeleton} />
          ))}
        </div>
      </div>

      {/* Product rows */}
      <div className={styles.list}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={styles.productRow}>
            <div className={styles.imgSkeleton} />
            <div className={styles.rowInfo}>
              <div className={styles.skeletonLine} style={{ width: "55%" }} />
              <div className={styles.skeletonLine} style={{ width: "35%", height: "0.7rem" }} />
            </div>
            <div className={styles.skeletonLine} style={{ width: "3.5rem" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
