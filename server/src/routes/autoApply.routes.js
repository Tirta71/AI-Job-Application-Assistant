import express from "express";
import {
  deleteAutoApplyJob,
  deleteAutoApplyJobs,
  getAutoApplyState,
  importAutoApplyJobs,
  prepareAutoApplyRun,
  queueEligibleJobsForAutoApply,
  scrapeAutoApplyJobs,
  startAutoApplyRun,
  stopAutoApplyRun,
  updateAutoApplyJob,
  updateAutoApplySettings,
} from "../services/autoApply.service.js";
import { successResponse } from "../utils/response.util.js";

const router = express.Router();

router.get("/auto-apply/state", (_req, res, next) => {
  try {
    return successResponse(res, "Auto apply state loaded.", getAutoApplyState());
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/import", (req, res, next) => {
  try {
    const data = importAutoApplyJobs(req.body.rows || []);
    return successResponse(res, "Jobs imported.", data);
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/scrape", (req, res, next) => {
  try {
    const data = scrapeAutoApplyJobs(req.body || {});
    return successResponse(res, "Website scraping completed.", data);
  } catch (error) {
    next(error);
  }
});

router.put("/auto-apply/settings", (req, res, next) => {
  try {
    const data = updateAutoApplySettings({
      answerBank: req.body.answerBank,
      rules: req.body.rules,
    });
    return successResponse(res, "Auto apply settings saved.", data);
  } catch (error) {
    next(error);
  }
});

router.patch("/auto-apply/jobs/:jobId", (req, res, next) => {
  try {
    const data = updateAutoApplyJob(req.params.jobId, req.body);
    return successResponse(res, "Job updated.", data);
  } catch (error) {
    next(error);
  }
});

router.delete("/auto-apply/jobs", (req, res, next) => {
  try {
    const data = deleteAutoApplyJobs(req.body.jobIds || []);
    return successResponse(res, "Jobs deleted.", data);
  } catch (error) {
    next(error);
  }
});

router.delete("/auto-apply/jobs/:jobId", (req, res, next) => {
  try {
    const data = deleteAutoApplyJob(req.params.jobId);
    return successResponse(res, "Job deleted.", data);
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/queue-eligible", (req, res, next) => {
  try {
    const data = queueEligibleJobsForAutoApply(req.body || {});
    return successResponse(res, "Eligible jobs queued.", data);
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/prepare-run", (req, res, next) => {
  try {
    const data = prepareAutoApplyRun(req.body || {});
    return successResponse(res, "Auto apply run prepared.", data);
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/run", (req, res, next) => {
  try {
    const data = startAutoApplyRun(req.body || {});
    return successResponse(res, "Auto apply run requested.", data);
  } catch (error) {
    next(error);
  }
});

router.post("/auto-apply/stop", (_req, res, next) => {
  try {
    const data = stopAutoApplyRun();
    return successResponse(res, "Auto apply stop requested.", data);
  } catch (error) {
    next(error);
  }
});

export default router;
