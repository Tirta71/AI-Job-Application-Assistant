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
    const cv = generateTailoredCv({
      profile,
      job,
      analysis,
      templateFileName
    });
    const pdf = await convertDocxToPdf(cv.outputPath);

    return successResponse(res, "Application generated successfully.", {
      ...analysis,
      docxFile: cv.filename,
      pdfFile: pdf.pdfFile,
      pdfAvailable: pdf.pdfAvailable,
      warning: pdf.warning
    });
  } catch (error) {
    next(error);
  }
});

export default router;
