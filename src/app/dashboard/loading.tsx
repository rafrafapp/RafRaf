import styles from "./loading.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.page} dir="rtl">
      {/* Top bar skeleton */}
      <div className={styles.topbar}>
        <div className={styles.avatarSkeleton} />
        <div className={styles.skeletonLine} style={{ width: "6rem" }} />
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.statCard}>
            <div className={styles.skeletonLine} style={{ width: "3rem", height: "1.4rem" }} />
            <div className={styles.skeletonLine} style={{ width: "4.5rem" }} />
          </div>
        ))}
      </div>

      {/* Quick actions grid */}
      <div className={styles.grid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={styles.tileSkeleton} />
        ))}
      </div>

      {/* Recent activity */}
      <div className={styles.section}>
        <div className={styles.skeletonLine} style={{ width: "8rem", marginBlockEnd: "0.75rem" }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className={styles.activityRow}>
            <div className={styles.skeletonLine} style={{ flex: 1 }} />
            <div className={styles.skeletonLine} style={{ width: "4rem" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
