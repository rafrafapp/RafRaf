import "server-only";
import { google } from "googleapis";

// Server-only Google client. Reads the service-account credentials from
// non-public env vars (never bundled to the browser). The private key is stored
// in .env with literal "\n" escapes, so we convert them to real newlines.

export type Row = (string | number)[];

let _auth: InstanceType<typeof google.auth.JWT> | null = null;

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

export function isBackupConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
  );
}

function getAuth() {
  if (_auth) return _auth;
  // Trim to tolerate stray whitespace/tabs in .env (a trailing tab on the email
  // makes Google reject the JWT with "invalid_grant: account not found").
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Google backup not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }
  _auth = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n").trim(),
    scopes: SCOPES,
  });
  return _auth;
}

export function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

// Ensure a spreadsheet has every named tab, adding any that are missing.
export async function ensureTabs(
  spreadsheetId: string,
  titles: string[],
): Promise<void> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const existing = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  );
  const missing = titles.filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });
}

// Overwrite a tab: clear all values, then write header + rows from A1. Returns
// the number of data rows written. This is idempotent — re-running a backup
// re-snapshots rather than duplicating.
export async function writeTab(
  spreadsheetId: string,
  tab: string,
  header: Row,
  rows: Row[],
): Promise<number> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: tab });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [header, ...rows] },
  });
  return rows.length;
}

// Append rows to the bottom of a tab (used for the growing daily-summary log).
export async function appendRows(
  spreadsheetId: string,
  tab: string,
  rows: Row[],
): Promise<void> {
  if (rows.length === 0) return;
  await getSheets().spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// Read the first column of a tab (used to dedupe the daily summary by date).
export async function readColumn(
  spreadsheetId: string,
  tab: string,
  col = "A",
): Promise<string[]> {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!${col}:${col}`,
  });
  return (res.data.values ?? []).map((r) => String(r[0] ?? ""));
}
