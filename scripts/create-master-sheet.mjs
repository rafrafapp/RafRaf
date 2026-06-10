// RafRaf admin master spreadsheet setup / verification.
//
//   node scripts/create-master-sheet.mjs
//
// Behaviour:
//  • If RAFRAF_MASTER_SHEET_ID is set  → verify the service account can write to
//    it and seed the six tab headers.
//  • Else if RAFRAF_SHARED_DRIVE_ID is set → create the master sheet inside that
//    Shared Drive (service accounts can create there) and print the id.
//  • Else → try a normal create; consumer service accounts have no Drive storage,
//    so this fails — we then print the 2-minute manual steps.
//
// Reads GOOGLE_* (+ optional RAFRAF_*) from .env.local. Requires the Google
// Sheets API + Google Drive API enabled on the project.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import googleapis from "googleapis";

const { google } = googleapis;

function loadEnv(path) {
  const txt = readFileSync(path, "utf8");
  const out = {};
  const re = /^([A-Z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\n#]*))/gm;
  let m;
  while ((m = re.exec(txt))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const TABS = [
  { title: "Overview", header: ["Metric", "Value"] },
  {
    title: "All Merchants",
    header: ["Store", "Plan", "Role", "Currency", "Sheet", "Last active", "Created"],
  },
  { title: "All Products", header: ["Store", "Product", "Category", "Cost", "Sell", "Stock"] },
  {
    title: "All Transactions",
    header: ["Date", "Store", "Type", "Product", "Qty", "Total", "Payment"],
  },
  { title: "Failed Backups", header: ["Date", "Store", "Scope", "Error"] },
  { title: "Revenue Tracker", header: ["Store", "Sales"] },
];

async function seed(sheets, id) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: "sheets.properties.title",
  });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const missing = TABS.filter((t) => !have.has(t.title));
  if (missing.length)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: missing.map((t) => ({ addSheet: { properties: { title: t.title } } })),
      },
    });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: TABS.map((t) => ({ range: `${t.title}!A1`, values: [t.header] })),
    },
  });
}

function manualSteps(email) {
  console.log(
    [
      "",
      "This is a consumer Google project: the service account has 0 Drive storage,",
      "so it cannot CREATE a spreadsheet. Pick ONE option:",
      "",
      "  A) Manual (works now, ~2 min):",
      "     1. Open https://sheets.new and name it 'RafRaf — Master'.",
      `     2. Share → add ${email} as Editor.`,
      "     3. Copy the id from the URL .../spreadsheets/d/<ID>/edit",
      "        and set RAFRAF_MASTER_SHEET_ID=<ID> in .env.local",
      "     4. Re-run this script to verify + seed the tab headers.",
      "",
      "  B) Shared Drive (Google Workspace):",
      `     create a Shared Drive, add ${email} as Content manager,`,
      "     set RAFRAF_SHARED_DRIVE_ID=<driveId> in .env.local, then re-run.",
      "",
    ].join("\n"),
  );
}

async function main() {
  const env = loadEnv(resolve(process.cwd(), ".env.local"));
  const email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const key = (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const masterId = (env.RAFRAF_MASTER_SHEET_ID ?? "").trim();
  const sharedDriveId = (env.RAFRAF_SHARED_DRIVE_ID ?? "").trim();
  if (!email || !key) {
    console.error("✗ GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing in .env.local");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });
  console.log(`Service account: ${email}`);

  if (masterId) {
    console.log(`Verifying write access to ${masterId}…`);
    await seed(sheets, masterId);
    console.log("\n✓ Master sheet verified and headers seeded. Backups can write to it.");
    return;
  }

  if (sharedDriveId) {
    console.log(`Creating master sheet in Shared Drive ${sharedDriveId}…`);
    const file = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: "RafRaf — Master",
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [sharedDriveId],
      },
      fields: "id,webViewLink",
    });
    await seed(sheets, file.data.id);
    console.log("\n✓ Created.\n");
    console.log(`RAFRAF_MASTER_SHEET_ID=${file.data.id}`);
    console.log(`URL: ${file.data.webViewLink}`);
    return;
  }

  console.log("Attempting to create the master sheet…");
  try {
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: "RafRaf — Master" },
        sheets: TABS.map((t) => ({ properties: { title: t.title } })),
      },
      fields: "spreadsheetId,spreadsheetUrl",
    });
    await seed(sheets, created.data.spreadsheetId);
    console.log("\n✓ Created.\n");
    console.log(`RAFRAF_MASTER_SHEET_ID=${created.data.spreadsheetId}`);
    console.log(`URL: ${created.data.spreadsheetUrl}`);
  } catch (e) {
    const msg = e?.errors?.[0]?.message ?? e?.message ?? String(e);
    console.error(`\n✗ Could not create: ${msg}`);
    if (/has not been used|disabled|SERVICE_DISABLED|accessNotConfigured/i.test(String(msg))) {
      console.error("→ Enable the Google Sheets API and Google Drive API, then re-run.");
    } else {
      manualSteps(email);
    }
  }
}

main().catch((e) => {
  const msg = e?.errors?.[0]?.message ?? e?.message ?? String(e);
  console.error(`\n✗ Failed: ${msg}`);
  process.exit(1);
});
