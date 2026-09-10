import fs from "fs";
import path from "path";

export const SERVER_ROOT = process.cwd();
export const STORAGE_DIR = path.join(SERVER_ROOT, "storage");
export const TEMPLATE_DIR = path.join(STORAGE_DIR, "templates");
export const GENERATED_DIR = path.join(STORAGE_DIR, "generated");
export const TRACKER_DIR = path.join(STORAGE_DIR, "tracker");
export const CV_DIR = path.join(STORAGE_DIR, "cv");

export function ensureStorageDirs() {
  [TEMPLATE_DIR, GENERATED_DIR, TRACKER_DIR, CV_DIR].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

export function sanitizeFileName(value = "file") {
  const cleaned = String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  return cleaned || "file";
}

export function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function safeJoin(baseDir, filename) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, filename);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error("Invalid file path.");
  }

  return resolvedTarget;
}

export function getLatestTemplateFile() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    return null;
  }

  const files = fs
    .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx"))
    .map((entry) => {
      const filePath = path.join(TEMPLATE_DIR, entry.name);
      return {
        name: entry.name,
        modifiedAt: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  return files[0]?.name || null;
}

export function assertDocxFile(filename) {
  if (!filename || path.extname(filename).toLowerCase() !== ".docx") {
    throw new Error("Only DOCX templates are supported.");
  }
}
