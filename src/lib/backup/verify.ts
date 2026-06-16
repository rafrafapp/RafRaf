import "server-only";

import { getSheets, isBackupConfigured } from "./google";

export type SheetVerifyResult = { ok: boolean; title?: string; error?: string };

// Verify the service account can actually open a given spreadsheet id — used by the
// admin "test connection" button and the Settings connection status. Never throws:
// a missing id, unconfigured Google, or a permission error all return ok:false.
export async function verifySheetAccess(
  sheetId: string | null | undefined,
): Promise<SheetVerifyResult> {
  const id = sheetId?.trim();
  if (!id) return { ok: false, error: "no_sheet" };
  if (!isBackupConfigured()) return { ok: false, error: "not_configured" };
  try {
    const meta = await getSheets().spreadsheets.get({
      spreadsheetId: id,
      fields: "properties.title",
    });
    return { ok: true, title: meta.data.properties?.title ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "failed" };
  }
}
