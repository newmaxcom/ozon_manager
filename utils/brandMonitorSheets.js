import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const auth = new JWT({
  email: "google-sheets@supplier-bot-to-sheets.iam.gserviceaccount.com",
  key: `-----BEGIN PRIVATE KEY-----\n${process.env.GOOGLE_KEY}\n-----END PRIVATE KEY-----`,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

export async function openDoc(spreadsheetId) {
  const doc = new GoogleSpreadsheet(spreadsheetId, auth);
  await doc.loadInfo();
  return doc;
}

export async function getOrCreateSheet(doc, title, headers) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: headers });
  } else {
    try {
      await sheet.loadHeaderRow();
    } catch {
      await sheet.setHeaderRow(headers);
    }
  }
  return sheet;
}

export async function replaceRows(doc, title, headers, rows) {
  const sheet = await getOrCreateSheet(doc, title, headers);
  await sheet.clear();
  await sheet.setHeaderRow(headers);
  if (rows.length) {
    await sheet.addRows(rows);
  }
}

export async function appendRows(doc, title, headers, rows) {
  const sheet = await getOrCreateSheet(doc, title, headers);
  if (rows.length) {
    await sheet.addRows(rows);
  }
}

export function spreadsheetUrl(spreadsheetId) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
