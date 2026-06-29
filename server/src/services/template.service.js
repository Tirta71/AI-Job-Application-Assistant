import fs from "fs";
import PizZip from "pizzip";
import { TEMPLATE_DIR, assertDocxFile, safeJoin } from "../utils/file.util.js";

export const REQUIRED_PLACEHOLDERS = [
  "FULL_NAME",
  "TARGET_ROLE",
  "CONTACT_LINE",
  "SUMMARY_LINE_1",
  "SUMMARY_LINE_2",
  "SUMMARY_LINE_3",
  "SUMMARY_LINE_4",
  "WORK_TITLE",
  "WORK_COMPANY_LOCATION",
  "WORK_DATE",
  "WORK_BULLET_1",
  "WORK_BULLET_2",
  "PROJECT_TITLE",
  "PROJECT_INSTITUTION",
  "PROJECT_DATE",
  "PROJECT_BULLET_1",
  "PROJECT_BULLET_2",
  "EDUCATION_SCHOOL",
  "EDUCATION_YEAR",
  "EDUCATION_DEGREE",
  "CERTIFICATION_1",
  "CERTIFICATION_2",
  "CERTIFICATION_3",
  "SKILLS_WEB",
  "SKILLS_FRAMEWORKS",
  "SKILLS_BACKEND",
  "SKILLS_TOOLS_AI"
];

function readDocxXmlFiles(templatePath) {
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const xml = Object.keys(zip.files)
    .filter((fileName) => fileName.startsWith("word/") && fileName.endsWith(".xml"))
    .map((fileName) => zip.files[fileName].asText())
    .join("\n");

  return `${xml}\n${xml.replace(/<[^>]+>/g, "")}`;
}

export function checkTemplatePlaceholders(templateFileName) {
  assertDocxFile(templateFileName);

  const templatePath = safeJoin(TEMPLATE_DIR, templateFileName);

  if (!fs.existsSync(templatePath)) {
    throw new Error("Selected template file was not found.");
  }

  const xml = readDocxXmlFiles(templatePath);
  const foundPlaceholders = Array.from(xml.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g))
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index);
  const missingPlaceholders = REQUIRED_PLACEHOLDERS.filter((placeholder) => !foundPlaceholders.includes(placeholder));

  return {
    valid: missingPlaceholders.length === 0,
    foundPlaceholders,
    missingPlaceholders
  };
}
