import express from "express";
import { fetchJobFromUrl } from "../services/jobFetch.service.js";
import { successResponse, errorResponse } from "../utils/response.util.js";

const router = express.Router();
const FETCH_FAILED_MESSAGE = "Could not read this link automatically. Please paste the job description manually.";

router.post("/fetch-job-url", async (req, res) => {
  try {
    const data = await fetchJobFromUrl(req.body?.url);
    return successResponse(res, "Job description fetched successfully.", data);
  } catch (error) {
    return errorResponse(res, FETCH_FAILED_MESSAGE, error, 422);
  }
});

export default router;
