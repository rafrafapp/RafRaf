import { NextResponse } from "next/server";
import { isBackupConfigured } from "@/lib/backup/google";
import { verifySheetAccess } from "@/lib/backup/verify";
import { authorizeCron } from "@/lib/backup/cron-auth";

// Google backup diagnostics. googleapis needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/test-sheets[?sheetId=<id>]
// Reports the backup config + does a LIVE service-account auth + read against the
// master sheet (or ?sheetId=), returning the exact error if it fails.
// Access: dev only, OR production with `Authorization: Bearer <CRON_SECRET>` — so
// it's never publicly reachable in prod. Never returns the private key (only its
// non-secret PEM header + structural checks).
export async function GET(req: Request) {
  const allowed =
    process.env.NODE_ENV !== "production" || authorizeCron(req);
  if (!allowed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const masterId = process.env.RAFRAF_MASTER_SHEET_ID;

  // Step 4 (requested): surface the key format without leaking the secret.
  console.log("[test-sheets] Key starts with:", key?.slice(0, 30));

  const diagnostics: Record<string, unknown> = {
    configured: isBackupConfigured(),
    env: {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: {
        present: Boolean(email),
        // A stray trailing tab/space breaks the JWT ("invalid_grant"); getAuth()
        // trims it, but flag it so it can be cleaned up at the source.
        hasTrailingWhitespace: email ? email !== email.trimEnd() : null,
        value: email?.trim() ?? null, // the SA email is not a secret
      },
      GOOGLE_PRIVATE_KEY: {
        present: Boolean(key),
        startsWith: key?.slice(0, 30) ?? null, // PEM header — non-secret
        hasBeginMarker: key?.includes("BEGIN PRIVATE KEY") ?? false,
        hasEndMarker: key?.includes("END PRIVATE KEY") ?? false,
        literalBackslashN: key ? (key.match(/\\n/g)?.length ?? 0) : 0,
        realNewlines: key ? (key.match(/\n/g)?.length ?? 0) : 0,
      },
      RAFRAF_MASTER_SHEET_ID: { present: Boolean(masterId) },
      RAFRAF_SHARED_DRIVE_ID: {
        present: Boolean(process.env.RAFRAF_SHARED_DRIVE_ID),
      },
      CRON_SECRET: { present: Boolean(process.env.CRON_SECRET) },
    },
  };

  // Live auth + read against the master sheet (or a specific ?sheetId=).
  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get("sheetId") ?? masterId ?? null;
  diagnostics.sheetRead = { target: sheetId, ...(await verifySheetAccess(sheetId)) };

  return NextResponse.json(diagnostics, { status: 200 });
}
