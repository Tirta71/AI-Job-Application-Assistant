import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import uploadRoutes from "./routes/upload.routes.js";
import generateRoutes from "./routes/generate.routes.js";
import trackerRoutes from "./routes/tracker.routes.js";
import templateRoutes from "./routes/template.routes.js";
import jobFetchRoutes from "./routes/jobFetch.routes.js";
import autoApplyRoutes from "./routes/autoApply.routes.js";
import { ensureStorageDirs, GENERATED_DIR, safeJoin } from "./utils/file.util.js";
import { errorResponse, successResponse } from "./utils/response.util.js";

ensureStorageDirs();

const app = express();
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const allowedOrigins = new Set(
  clientUrl
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isAllowedDevOrigin(origin = "") {
  return (
    allowedOrigins.has(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin) ||
    /^https?:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedDevOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  return successResponse(res, "Server running.", {
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", uploadRoutes);
app.use("/api", templateRoutes);
app.use("/api", jobFetchRoutes);
app.use("/api", generateRoutes);
app.use("/api", trackerRoutes);
app.use("/api", autoApplyRoutes);

app.get("/api/download/:filename", (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = safeJoin(GENERATED_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return errorResponse(res, "File not found.", "Requested file does not exist.", 404);
    }

    return res.download(filePath);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? error.field === "cv" ? "CV must be 10MB or smaller." : "Template must be 5MB or smaller."
      : error.message;
    return errorResponse(res, "Upload failed.", message, 400);
  }

  const status = error.message?.includes("required") || error.message?.includes("allowed") ? 400 : 500;
  return errorResponse(res, "Request failed.", error, status);
});

app.listen(port, () => {
  console.log(`AI Job Application Assistant server running on http://localhost:${port}`);
});
