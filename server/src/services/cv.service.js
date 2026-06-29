import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  GENERATED_DIR,
  TEMPLATE_DIR,
  assertDocxFile,
  getLatestTemplateFile,
  safeJoin,
  sanitizeFileName,
  timestampForFile
} from "../utils/file.util.js";

function compactLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  return values.find((value) => compactLine(value)) || "";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

function getSkills(profile) {
  if (profile.skills && typeof profile.skills === "object" && !Array.isArray(profile.skills)) {
    return profile.skills;
  }

  const skillText = String(profile.skills || "");

  return {
    web: skillText.match(/Web Fundamentals:\s*(.*)/i)?.[1] || "",
    frameworks: skillText.match(/Frameworks:\s*(.*)/i)?.[1] || "",
    backend: skillText.match(/Backend\s*&\s*Database:\s*(.*)/i)?.[1] || "",
    toolsAi: skillText.match(/Tools\s*&\s*AI:\s*(.*)/i)?.[1] || ""
  };
}

function getContactLine(profile) {
  return [
    profile.phone,
    profile.email,
    profile.linkedinUrl,
    profile.githubUrl,
    profile.portfolioUrl
  ]
    .map(compactLine)
    .filter(Boolean)
    .join(" | ");
}

function getLegacyWorkParts(profile) {
  const lines = String(profile.experience || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: lines[0] || "",
    companyLocation: lines[1] || "",
    date: lines[2] || "",
    bullets: lines.slice(3).map((line) => line.replace(/^-\s*/, ""))
  };
}

function getLegacyProjectParts(profile) {
  const lines = String(profile.projects || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: lines[0] || "",
    institution: lines[1] || "",
    date: lines[2] || "",
    bullets: lines.slice(3).map((line) => line.replace(/^-\s*/, ""))
  };
}

function buildTemplateData(profile, job, analysis) {
  const skills = getSkills(profile);
  const certifications = asArray(profile.certifications);
  const legacyWork = getLegacyWorkParts(profile);
  const legacyProject = getLegacyProjectParts(profile);

  return {
    FULL_NAME: profile.fullName || "",
    TARGET_ROLE: job.jobPosition || profile.targetRole || "",
    CONTACT_LINE: profile.contactLine || getContactLine(profile),

    SUMMARY_LINE_1: analysis.summaryLine1 || "",
    SUMMARY_LINE_2: analysis.summaryLine2 || "",
    SUMMARY_LINE_3: analysis.summaryLine3 || "",
    SUMMARY_LINE_4: analysis.summaryLine4 || "",

    WORK_TITLE: firstNonEmpty(profile.workTitle, legacyWork.title),
    WORK_COMPANY_LOCATION: firstNonEmpty(profile.workCompanyLocation, legacyWork.companyLocation),
    WORK_DATE: firstNonEmpty(profile.workDate, legacyWork.date),
    WORK_BULLET_1: firstNonEmpty(analysis.workBullet1, profile.workBullets?.[0], legacyWork.bullets[0]),
    WORK_BULLET_2: firstNonEmpty(analysis.workBullet2, profile.workBullets?.[1], legacyWork.bullets[1]),

    PROJECT_TITLE: firstNonEmpty(profile.projectTitle, legacyProject.title),
    PROJECT_INSTITUTION: firstNonEmpty(profile.projectInstitution, legacyProject.institution),
    PROJECT_DATE: firstNonEmpty(profile.projectDate, legacyProject.date),
    PROJECT_BULLET_1: firstNonEmpty(analysis.projectBullet1, profile.projectBullets?.[0], legacyProject.bullets[0]),
    PROJECT_BULLET_2: firstNonEmpty(analysis.projectBullet2, profile.projectBullets?.[1], legacyProject.bullets[1]),

    EDUCATION_SCHOOL: profile.educationSchool || "",
    EDUCATION_YEAR: profile.educationYear || "",
    EDUCATION_DEGREE: profile.educationDegree || "",

    CERTIFICATION_1: certifications[0] || "",
    CERTIFICATION_2: certifications[1] || "",
    CERTIFICATION_3: certifications[2] || "",

    SKILLS_WEB: analysis.skillsWeb || skills.web || "",
    SKILLS_FRAMEWORKS: analysis.skillsFrameworks || skills.frameworks || "",
    SKILLS_BACKEND: analysis.skillsBackend || skills.backend || "",
    SKILLS_TOOLS_AI: analysis.skillsToolsAi || skills.toolsAi || ""
  };
}

export function generateTailoredCv({ profile, job, analysis, templateFileName }) {
  const selectedTemplate = templateFileName || getLatestTemplateFile();

  if (!selectedTemplate) {
    throw new Error("No DOCX template has been uploaded yet.");
  }

  assertDocxFile(selectedTemplate);

  const templatePath = safeJoin(TEMPLATE_DIR, selectedTemplate);

  if (!fs.existsSync(templatePath)) {
    throw new Error("Selected template file was not found.");
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    delimiters: {
      start: "{{",
      end: "}}"
    },
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(buildTemplateData(profile, job, analysis));

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE"
  });

  const filenameParts = [
    "CV",
    sanitizeFileName(profile.fullName || "Candidate"),
    sanitizeFileName(job.jobPosition || "Job"),
    sanitizeFileName(job.companyName || "Company"),
    timestampForFile()
  ];

  const filename = `${filenameParts.join("_")}.docx`;
  const outputPath = path.join(GENERATED_DIR, filename);

  fs.writeFileSync(outputPath, buffer);

  return {
    filename,
    outputPath
  };
}
