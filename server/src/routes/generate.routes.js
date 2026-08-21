import express from "express";
import { analyzeApplication } from "../services/ai.service.js";
import { generateTailoredCv } from "../services/cv.service.js";
import { convertDocxToPdf } from "../services/pdf.service.js";
import { checkTemplatePlaceholders } from "../services/template.service.js";
import { successResponse } from "../utils/response.util.js";

const router = express.Router();

function validateGeneratePayload(profile, job) {
  if (!profile || typeof profile !== "object") {
    throw new Error("Profile data is required.");
  }

  if (!job || typeof job !== "object") {
    throw new Error("Job data is required.");
  }

  if (!job.jobDescription?.trim()) {
    throw new Error("Job description is required.");
  }
}

async function renderCvFiles({ profile, job, analysis, templateFileName }) {
  const cv = generateTailoredCv({
    profile,
    job,
    analysis,
    templateFileName
  });
  const pdf = await convertDocxToPdf(cv.outputPath);

  return {
    docxFile: cv.filename,
    pdfFile: pdf.pdfFile,
    pdfAvailable: pdf.pdfAvailable,
    warning: pdf.warning
  };
}

router.post("/generate-application", async (req, res, next) => {
  try {
    const { profile, job, templateFileName } = req.body;

    validateGeneratePayload(profile, job);
    const templateCheck = checkTemplatePlaceholders(templateFileName);

    if (!templateCheck.valid) {
      return res.status(422).json({
        success: false,
        message: "Template CV belum lengkap",
        data: {
          foundPlaceholders: templateCheck.foundPlaceholders,
          missingPlaceholders: templateCheck.missingPlaceholders
        }
      });
    }

    const analysis = await analyzeApplication(profile, job);
    const files = await renderCvFiles({ profile, job, analysis, templateFileName });

    return successResponse(res, "Application generated successfully.", {
      ...analysis,
      ...files
    });
  } catch (error) {
    next(error);
  }
});

router.post("/render-application-cv", async (req, res, next) => {
  try {
    const { profile, job, analysis, templateFileName } = req.body;

    validateGeneratePayload(profile, job);

    if (!analysis || typeof analysis !== "object") {
      throw new Error("Analysis data is required.");
    }

    const templateCheck = checkTemplatePlaceholders(templateFileName);

    if (!templateCheck.valid) {
      return res.status(422).json({
        success: false,
        message: "Template CV belum lengkap",
        data: {
          foundPlaceholders: templateCheck.foundPlaceholders,
          missingPlaceholders: templateCheck.missingPlaceholders
        }
      });
    }

    const files = await renderCvFiles({ profile, job, analysis, templateFileName });

    return successResponse(res, "CV updated from edited result.", {
      ...files
    });
  } catch (error) {
    next(error);
  }
});

export default router;
