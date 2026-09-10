import { patchScrapeRun, scrapeAutoApplyJobs } from "../services/autoApply.service.js";

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const runId = argumentValue("--run-id", process.env.AUTO_SCRAPE_RUN_ID || `SCRAPE-${Date.now()}`);
let rules = {};
try {
  rules = JSON.parse(argumentValue("--rules", "{}"));
} catch {
  rules = {};
}

patchScrapeRun(
  { id: runId, status: "running", message: "BrowserAct sedang mencari dan membaca lowongan..." },
  "Scraping started."
);

try {
  const result = scrapeAutoApplyJobs({ rules });
  const errors = result.scrapeSummary?.errors || [];
  patchScrapeRun(
    {
      id: runId,
      status: errors.length ? "completed_with_errors" : "completed",
      finishedAt: new Date().toISOString(),
      message: `Scraping selesai: ${result.scrapeSummary?.matchedFilters || 0} lowongan lolos filter.`,
      attemptedTargets: result.scrapeSummary?.attemptedTargets || 0,
      totalTargets: result.scrapeSummary?.targets || 0,
      extracted: result.scrapeSummary?.extracted || 0,
      matchedFilters: result.scrapeSummary?.matchedFilters || 0,
      filteredOut: result.scrapeSummary?.filteredOut || 0,
      errorsCount: errors.length,
      scrapeSummary: result.scrapeSummary,
      importSummary: result.importSummary,
    },
    "Scraping completed.",
    { matchedFilters: result.scrapeSummary?.matchedFilters || 0, errors: errors.length }
  );
  process.exitCode = 0;
} catch (error) {
  patchScrapeRun(
    { id: runId, status: "failed", finishedAt: new Date().toISOString(), message: error.message },
    "Scraping failed.",
    { error: error.message }
  );
  process.exitCode = 1;
}
