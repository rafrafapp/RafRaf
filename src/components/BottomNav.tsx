"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconBox,
  IconStore,
  IconChart,
  IconSettings,
} from "@/app/dashboard/icons";
import styles from "./BottomNav.module.css";

type NavLabels = {
  home: string;
  products: string;
  sell: string;
  reports: string;
  settings: string;
};

// Routes that must NOT show the app bottom nav (public / auth / admin / setup).
const HIDDEN_EXACT = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/setup",
  "/developers",
  "/terms",
  "/privacy",
  "/sell",
]);
const HIDDEN_PREFIX = ["/auth", "/rafraf-admin"];

const ITEMS: {
  href: string;
  key: keyof NavLabels;
  Icon: React.ComponentType<{ size?: number }>;
}[] = [
  { href: "/dashboard", key: "home", Icon: IconHome },
  { href: "/products", key: "products", Icon: IconBox },
  { href: "/sell", key: "sell", Icon: IconStore },
  { href: "/reports", key: "reports", Icon: IconChart },
  { href: "/settings", key: "settings", Icon: IconSettings },
];

// Rendered once in the root layout — visible & fixed on every protected page.
export function BottomNav({ labels }: { labels: NavLabels }) {
  const pathname = usePathname() || "";
  const hidden =
    HIDDEN_EXACT.has(pathname) ||
    HIDDEN_PREFIX.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (hidden) return null;

  return (
    <nav className={styles.bottomNav} id="bottom-nav">
      {ITEMS.map((it) => {
        const active =
          pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`${styles.navItem} ${active ? styles.navActive : ""}`}
          >
            <it.Icon size={26} />
            <span>{labels[it.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
