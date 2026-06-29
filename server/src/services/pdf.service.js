import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { GENERATED_DIR } from "../utils/file.util.js";

const execFileAsync = promisify(execFile);

export async function convertDocxToPdf(docxPath) {
  const libreOfficePath = process.env.LIBREOFFICE_PATH || "soffice";
  const outputBaseName = path.basename(docxPath, path.extname(docxPath));
  const pdfFileName = `${outputBaseName}.pdf`;
  const pdfPath = path.join(GENERATED_DIR, pdfFileName);

  try {
    await execFileAsync(
      libreOfficePath,
      ["--headless", "--convert-to", "pdf", "--outdir", GENERATED_DIR, docxPath],
      { timeout: 60000 }
    );

    if (!fs.existsSync(pdfPath)) {
      throw new Error("LibreOffice did not create a PDF file.");
    }

    return {
      pdfAvailable: true,
      pdfFile: pdfFileName,
      warning: null
    };
  } catch {
    return {
      pdfAvailable: false,
      pdfFile: null,
      warning: "PDF conversion failed. DOCX file was generated successfully."
    };
  }
}
