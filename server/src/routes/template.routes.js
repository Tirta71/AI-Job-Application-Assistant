import express from "express";
import { checkTemplatePlaceholders } from "../services/template.service.js";

const router = express.Router();

router.post("/check-template", (req, res, next) => {
  try {
    const { templateFileName } = req.body;

    if (!templateFileName) {
      throw new Error("templateFileName is required.");
    }

    const result = checkTemplatePlaceholders(templateFileName);

    return res.status(result.valid ? 200 : 422).json({
      success: result.valid,
      message: result.valid ? "Template CV valid" : "Template CV belum lengkap",
      data: {
        foundPlaceholders: result.foundPlaceholders,
        missingPlaceholders: result.missingPlaceholders
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
