import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { TRACKER_DIR } from "../utils/file.util.js";

const HEADERS = [
  "Week",
  "Job Position",
  "Company Name",
  "Applying Date",
  "Source Link",
  "Apply Via",
  "Status",
  "CV Submitted",
  "Portfolio Submitted",
  "Cover Letter",
  "Notes",
  "CV File Link",
  "Cover Letter Link",
  "Match Score",
  "Skills Matched",
  "Skills Missing",
  "Last Updated"
];

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function getIsoWeek(date = new Date()) {
  const copied = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = copied.getUTCDay() || 7;
  copied.setUTCDate(copied.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(copied.getUTCFullYear(), 0, 1));
  return Math.ceil(((copied - yearStart) / 86400000 + 1) / 7);
}

function resolveCredentialPath() {
  const credentialPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

  if (!credentialPath) {
    return null;
  }

  return path.isAbsolute(credentialPath) ? credentialPath : path.resolve(process.cwd(), credentialPath);
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildRow({ job = {}, result = {}, files = {} }) {
  const applyingDate = job.applyingDate || currentDate();
  const docxFile = files.docxFile || result.docxFile || "";
  const pdfFile = files.pdfFile || result.pdfFile || "";
  const cvFile = pdfFile || docxFile;

  return [
    `W${getIsoWeek(new Date(applyingDate))}`,
    job.jobPosition || "",
    job.companyName || "",
    applyingDate,
    job.sourceLink || "",
    job.applyVia || "",
    "Applied",
    "Yes",
    job.portfolioSubmitted || "",
    "Generated",
    job.notes || "",
    cvFile ? `/api/download/${encodeURIComponent(cvFile)}` : "",
    "",
    result.matchScore ?? "",
    Array.isArray(result.skillsMatched) ? result.skillsMatched.join(", ") : "",
    Array.isArray(result.skillsMissing) ? result.skillsMissing.join(", ") : "",
    currentDate()
  ];
}

async function appendToCsv(row) {
  fs.mkdirSync(TRACKER_DIR, { recursive: true });
  const csvPath = path.join(TRACKER_DIR, "job-tracker.csv");
  const fileExists = fs.existsSync(csvPath);
  const lines = [];

  if (!fileExists) {
    lines.push(HEADERS.map(csvEscape).join(","));
  }

  lines.push(row.map(csvEscape).join(","));
  fs.appendFileSync(csvPath, `${lines.join("\n")}\n`, "utf8");

  return csvPath;
}

async function appendToGoogleSheets(row) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const credentialPath = resolveCredentialPath();

  if (!spreadsheetId || !credentialPath || !fs.existsSync(credentialPath)) {
    throw new Error("Google Sheets is not configured.");
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:Q",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}

export async function saveTrackerEntry(payload) {
  const row = buildRow(payload);

  try {
    await appendToGoogleSheets(row);
    return {
      savedTo: "google-sheets",
      warning: null
    };
  } catch (error) {
    const csvPath = await appendToCsv(row);

    return {
      savedTo: "csv",
      csvPath,
      warning: `Google Sheets is not active. Data was saved to local CSV instead. ${error.message}`
    };
  }
}
