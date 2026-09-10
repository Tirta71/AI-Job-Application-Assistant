import test from "node:test";
import assert from "node:assert/strict";
import { autoApplyFilterInternals } from "../src/services/autoApply.service.js";
import {
  answerForApplicationQuestion,
  classifyApplicationQuestion,
  experienceToNumber,
} from "../src/utils/applicationAnswer.util.js";

const {
  appliedIdentitySet,
  automationStatusFromJob,
  autoQueueDecision,
  buildScrapeTargets,
  canonicalJobUrl,
  matchesKeyword,
  matchesSelectedSource,
  matchesTargetLocation,
  normalizePipelineStatus,
  parseJobDetailMarkdown,
  removeJobsFromState,
  wasAlreadyApplied,
} = autoApplyFilterInternals;

test("job deletion removes one or many requested jobs without touching other state", () => {
  const state = {
    jobs: [{ id: "JOB-1" }, { id: "JOB-2" }, { id: "JOB-3" }],
    rules: { sources: "Glints" },
  };

  const single = removeJobsFromState(state, ["JOB-2"]);
  assert.deepEqual(single.jobs.map((job) => job.id), ["JOB-1", "JOB-3"]);
  assert.deepEqual(single.deletedIds, ["JOB-2"]);

  const multiple = removeJobsFromState(state, ["JOB-1", "JOB-3", "JOB-MISSING", "JOB-3"]);
  assert.deepEqual(multiple.jobs.map((job) => job.id), ["JOB-2"]);
  assert.deepEqual(multiple.deletedIds, ["JOB-1", "JOB-3"]);
  assert.deepEqual(multiple.missingIds, ["JOB-MISSING"]);
  assert.deepEqual(state.rules, { sources: "Glints" });
});

test("legacy job states migrate to the three user-facing statuses", () => {
  assert.equal(normalizePipelineStatus("Favorit"), "Disimpan");
  assert.equal(normalizePipelineStatus("Archived"), "Disimpan");
  assert.equal(normalizePipelineStatus("Applying"), "Siap Dilamar");
  assert.equal(normalizePipelineStatus("Failed"), "Siap Dilamar");
  assert.equal(normalizePipelineStatus("Interview"), "Sudah Dilamar");
  assert.equal(automationStatusFromJob({ pipelineStatus: "Failed" }), "failed");
  assert.equal(automationStatusFromJob({ pipelineStatus: "Siap Dilamar" }), "queued");
});

test("auto apply source selection only accepts the selected portal", () => {
  assert.equal(matchesSelectedSource({ source: "Glints" }, "Glints"), true);
  assert.equal(matchesSelectedSource({ source: "JobStreet" }, "Glints"), false);
  assert.equal(matchesSelectedSource({ source: "jobstreet" }, "JobStreet"), true);
  assert.equal(matchesSelectedSource({ source: "Glints" }, "All"), true);
});

test("scrape URLs use the configured location instead of Jakarta", () => {
  const targets = buildScrapeTargets({
    sources: "Glints, JobStreet",
    keywords: "Frontend React",
    targetLocation: "Bogor",
  });

  assert.equal(targets.length, 2);
  assert.match(targets.find((target) => target.source === "Glints").url, /locationName=Bogor/);
  assert.match(targets.find((target) => target.source === "JobStreet").url, /\/in-bogor$/);
});

test("LinkedIn scraping only targets Easy Apply jobs", () => {
  const targets = buildScrapeTargets({
    sources: "LinkedIn",
    keywords: "Frontend React",
    targetLocation: "Bogor",
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0].source, "LinkedIn");
  assert.match(targets[0].url, /linkedin\.com\/jobs\/search/);
  assert.match(targets[0].url, /f_AL=true/);
  assert.match(targets[0].url, /location=Bogor/);
});

test("screening mapper does not use a cover note for experience questions", () => {
  const bank = {
    fullstackExperience: "1-3 years",
    reactExperience: "2 years",
    graphqlExperience: "No experience",
    defaultCoverNote: "COVER NOTE",
    fallbackScreeningAnswer: "FALLBACK",
  };

  const websiteQuestion = "How many years' experience do you have as a Website Developer?";
  assert.equal(classifyApplicationQuestion(websiteQuestion), "fullstackExperience");
  assert.equal(answerForApplicationQuestion(websiteQuestion, bank, "textarea"), "1-3 years");
  assert.notEqual(answerForApplicationQuestion(websiteQuestion, bank, "textarea"), bank.defaultCoverNote);
  assert.equal(answerForApplicationQuestion("How many years with React.js?", bank, "number"), "2");
  assert.equal(answerForApplicationQuestion("How many years with GraphQL?", bank, "number"), "0");
  assert.equal(experienceToNumber("<1 year"), "0.5");
});

test("audited JobStreet questions map to multi-value answer bank fields", () => {
  assert.equal(
    classifyApplicationQuestion("Which relational database management systems are you experienced with?"),
    "databases"
  );
  assert.equal(
    classifyApplicationQuestion("Which revision control tools are you experienced with?"),
    "versionControlTools"
  );
  assert.equal(classifyApplicationQuestion("Kualifikasi mana yang kamu miliki?"), "educationLevel");
  assert.equal(classifyApplicationQuestion("Apakah kamu tinggal di Jakarta Pusat pada saat ini?"), "livesInJobLocation");
});

test("keyword matching requires the meaningful query terms", () => {
  assert.equal(matchesKeyword("Frontend Developer (ReactJS)", "Frontend React"), true);
  assert.equal(matchesKeyword("Frontend Developer", "Frontend React"), false);
  assert.equal(matchesKeyword("Fullstack Engineer", "Fullstack Web Developer"), true);
  assert.equal(matchesKeyword("Mobile Developer", "Fullstack Web Developer"), false);
  assert.equal(matchesKeyword("Junior Web Developer", "Junior Web Developer"), true);
  assert.equal(matchesKeyword("Junior Android Developer", "Junior Web Developer"), false);
});

test("location matching is strict for a single city and rejects missing location", () => {
  const rules = { skipOutsideTargetLocation: true, targetLocation: "Bogor" };

  assert.equal(matchesTargetLocation({ location: "Kota Bogor, Jawa Barat" }, rules), true);
  assert.equal(matchesTargetLocation({ location: "Jakarta Selatan, DKI Jakarta" }, rules), false);
  assert.equal(matchesTargetLocation({ location: "" }, rules), false);
  assert.equal(matchesTargetLocation({ location: "Remote/Dari rumah", workArrangement: "Remote" }, rules), false);
});

test("multiple target locations are alternatives and support work arrangement", () => {
  const rules = { skipOutsideTargetLocation: true, targetLocation: "Bogor, Hybrid, Remote Indonesia" };

  assert.equal(matchesTargetLocation({ location: "Jakarta", workArrangement: "Hybrid" }, rules), true);
  assert.equal(matchesTargetLocation({ location: "Remote/Dari rumah", workArrangement: "Remote" }, rules), true);
  assert.equal(matchesTargetLocation({ location: "Bandung", workArrangement: "On-site" }, rules), false);
});

test("auto queue applies configured keyword and location filters consistently", () => {
  const rules = {
    keywords: "Frontend React",
    targetLocation: "Bogor",
    skipOutsideTargetLocation: true,
    skipSeniorLead: true,
    skipUnpaid: true,
    skipDominantJavaGolangDotnet: true,
  };

  const accepted = autoQueueDecision(
    { jobTitle: "Frontend React Developer", location: "Bogor", matchedPortfolioSkills: "React" },
    rules
  );
  const rejected = autoQueueDecision(
    { jobTitle: "Frontend Developer", location: "Jakarta", matchedPortfolioSkills: "React" },
    rules
  );

  assert.equal(accepted.ok, true);
  assert.deepEqual(rejected.reasons, ["outside target keywords", "outside target location"]);
});

test("job URLs are canonicalized before deduplication", () => {
  assert.equal(
    canonicalJobUrl("https://id.jobstreet.com/job/93045732/?tracking=search#apply"),
    "https://id.jobstreet.com/job/93045732"
  );
});

test("a repost with the same role and company is recognized as already applied", () => {
  const identities = appliedIdentitySet([
    {
      pipelineStatus: "Applied",
      jobTitle: "Fullstack Developer Specialist",
      company: "Javamifi",
      jobUrl: "https://glints.com/id/opportunities/jobs/fullstack-developer-specialist/11111111-1111-1111-1111-111111111111",
    },
  ]);

  assert.equal(
    wasAlreadyApplied(
      {
        job_title: "Fullstack Developer Specialist",
        company: "Javamifi",
        job_url: "https://glints.com/id/opportunities/jobs/fullstack-developer-specialist/22222222-2222-2222-2222-222222222222",
      },
      identities
    ),
    true
  );
});

test("JobStreet detail markdown enriches company, location, salary, and description", () => {
  const markdown = `
Full Stack Developer
====================
![PT Quintal Edutama Solusindo logo](https://cdn.example.com/company-logo/quintal.png)
PT Quintal Edutama Solusindo
[West Jakarta, Jakarta](https://id.jobstreet.com/Full-Stack-Developer-jobs/in-West-Jakarta-Jakarta)
[Full time](https://id.jobstreet.com/Full-Stack-Developer-jobs/full-time)
Rp 8.000.000 - Rp 12.000.000 per month
You applied on 9 Jul 2026
Job Description:
Build and maintain a web platform using JavaScript, CSS, and MySQL.
Employer questions
------------------
`;
  const detail = parseJobDetailMarkdown(markdown, {
    source: "JobStreet",
    job_title: "Full Stack Developer",
  });

  assert.equal(detail.company, "PT Quintal Edutama Solusindo");
  assert.equal(detail.location, "West Jakarta, Jakarta");
  assert.equal(detail.employmentType, "Full-time");
  assert.equal(detail.companyLogoUrl, "https://cdn.example.com/company-logo/quintal.png");
  assert.match(detail.salaryRaw, /8\.000\.000/);
  assert.match(detail.jobDescription, /Build and maintain/);
  assert.equal(detail.alreadyApplied, true);
});

test("Glints detail markdown reads the final breadcrumb location and closed status", () => {
  const markdown = `
[Pekerjaan](https://glints.com/id/lowongan-kerja)
[Lokasi](https://glints.com/id/browse/job-location)
[Jawa Barat](https://glints.com/id/job-location/indonesia/jawa-barat)
[Bogor](https://glints.com/id/job-location/indonesia/jawa-barat/bogor)
Fullstack Web Developer
![Kelanara Studio](https://images.glints.com/company-logo/kelanara.webp)
[Kelanara Studio](https://glints.com/id/companies/kelanara-studio)
Rp 600.000 - 1.000.000 / Bulan
Magang · Kerja di lokasi
Lowongan ini telah ditutup
`;
  const detail = parseJobDetailMarkdown(markdown, {
    source: "Glints",
    job_title: "Fullstack Web Developer",
  });

  assert.equal(detail.company, "Kelanara Studio");
  assert.equal(detail.location, "Bogor");
  assert.equal(detail.workArrangement, "On-site");
  assert.equal(detail.employmentType, "Internship");
  assert.equal(detail.companyLogoUrl, "https://images.glints.com/company-logo/kelanara.webp");
  assert.equal(detail.isClosed, true);
});
