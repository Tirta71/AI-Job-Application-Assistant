import express from "express";
import { saveTrackerEntry } from "../services/sheets.service.js";
import { successResponse } from "../utils/response.util.js";

const router = express.Router();

router.post("/save-to-sheet", async (req, res, next) => {
  try {
    const data = await saveTrackerEntry(req.body);
    return successResponse(res, "Tracker saved successfully.", data);
  } catch (error) {
    next(error);
  }
});

export default router;
