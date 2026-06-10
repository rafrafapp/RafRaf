"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/auth/actions";

type Props = { label: string; className?: string };

// Sign-out must wipe IndexedDB first so the next person on this device can't see
// the previous merchant's cached inventory, then hand off to the server action
// (which clears the auth cookies and redirects to /login).
export function SignOutButton({ label, className }: Props) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            // Lazy-import so Dexie isn't bundled into the dashboard's first load.
            const { clearLocalData } = await import("@/lib/offline/db");
            await clearLocalData();
          } catch {
            // Never block logout on a local-cache wipe failure.
          }
          await signOut();
        })
      }
    >
      {label}
    </button>
  );
}
