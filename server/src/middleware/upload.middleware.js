import multer from "multer";
import path from "path";
import { TEMPLATE_DIR, sanitizeFileName, timestampForFile } from "../utils/file.util.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TEMPLATE_DIR);
  },
  filename: (_req, file, cb) => {
    const originalName = sanitizeFileName(path.basename(file.originalname, path.extname(file.originalname)));
    cb(null, `${originalName}_${timestampForFile()}.docx`);
  }
});

function fileFilter(_req, file, cb) {
  const isDocxExtension = path.extname(file.originalname).toLowerCase() === ".docx";
  const isDocxMime = file.mimetype === DOCX_MIME || file.mimetype === "application/octet-stream";

  if (!isDocxExtension || !isDocxMime) {
    cb(new Error("Only .docx files are allowed."));
    return;
  }

  cb(null, true);
}

export const uploadTemplate = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});
