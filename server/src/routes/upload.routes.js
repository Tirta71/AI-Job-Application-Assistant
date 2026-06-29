import express from "express";
import { uploadTemplate } from "../middleware/upload.middleware.js";
import { successResponse } from "../utils/response.util.js";

const router = express.Router();

router.post("/upload-template", uploadTemplate.single("template"), (req, res) => {
  if (!req.file) {
    throw new Error("Template file is required.");
  }

  return successResponse(res, "Template uploaded successfully.", {
    templateFileName: req.file.filename
  });
});

export default router;
