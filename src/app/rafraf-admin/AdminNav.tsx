"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./rafraf-admin.module.css";

type NavLabels = {
  overview: string;
  merchants: string;
  businessTypes: string;
  backups: string;
  security: string;
  announcements: string;
};

export function AdminNav({ labels, base }: { labels: NavLabels; base: string }) {
  const path = usePathname();
  const items = [
    { href: base, label: labels.overview },
    { href: `${base}/merchants`, label: labels.merchants },
    { href: `${base}/business-types`, label: labels.businessTypes },
    { href: `${base}/backups`, label: labels.backups },
    { href: `${base}/security`, label: labels.security },
    { href: `${base}/announcements`, label: labels.announcements },
  ];
  const active = (href: string) =>
    href === base ? path === href : path.startsWith(href);

  return (
    <nav className={styles.nav}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`${styles.navLink} ${active(it.href) ? styles.navActive : ""}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
