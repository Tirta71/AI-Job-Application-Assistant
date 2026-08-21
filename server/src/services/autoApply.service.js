import fs from "fs";
import path from "path";
import { fork, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { STORAGE_DIR } from "../utils/file.util.js";
import { classifyApplicationQuestion } from "../utils/applicationAnswer.util.js";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(SERVICE_DIR, "../..");
const WORKER_PATH = path.join(SERVER_ROOT, "src", "workers", "browserAct.worker.js");
const AUTO_APPLY_DIR = path.join(STORAGE_DIR, "auto-apply");
const STATE_PATH = path.join(AUTO_APPLY_DIR, "state.json");
const WORKER_LOG_PATH = path.join(AUTO_APPLY_DIR, "worker.log");
export const AUTO_APPLY_STATE_PATH = STATE_PATH;
const BROWSER_ACT_BIN = process.platform === "win32" ? "browser-act.exe" : "browser-act";

const AUDITED_QUESTIONS = [
  ["How many years' experience do you have as a Website Developer?", "Glints", "fullstackExperience"],
  ["What is your English proficiency?", "Glints", "englishProficiency"],
  ["How much notice are you required to give your current employer?", "Glints", "noticePeriod"],
  ["What is your desired monthly salary?", "JobStreet", "expectedSalary"],
  ["Which relational database management systems are you experienced with?", "JobStreet", "databases"],
  ["Which revision control tools are you experienced with?", "JobStreet", "versionControlTools"],
  ["How many years of work experience do you have with React.js?", "LinkedIn", "reactExperience"],
  ["How many years of work experience do you have with GraphQL?", "LinkedIn", "graphqlExperience"],
  ["Seberapa mahir kamu dengan skill yang diminta?", "Glints", "primarySkillLevel"],
  ["Berapa lama pengalamanmu di industri Computer Software?", "Glints", "computerSoftwareExperience"],
  ["Apakah kamu saat ini tinggal di lokasi lowongan?", "Glints", "livesInJobLocation"],
].map(([question, source, mappedAnswerKey], index) => ({
  id: `AUDIT-${index + 1}`,
  question,
  type: "screening",
  source,
  mappedAnswerKey,
  count: 1,
  firstSeenAt: "2026-07-14T00:00:00.000Z",
  lastSeenAt: "2026-07-14T00:00:00.000Z",
}));

const DEFAULT_ANSWER_BANK = {
  cvPath: "C:\\Users\\Tirta\\Downloads\\Tirta.pdf",
  expectedSalary: "4.500.000",
  availability: "immediate",
  frontendExperience: "1-3 years",
  fullstackExperience: "1-3 years",
  backendExperience: "<1 year",
  internshipExperience: "<1 year",
  educationLevel: "Bachelor Degree (S1)",
  sqlExperience: "<1 year",
  rdbmsExperience: "<1 year",
  javascriptExperience: "1-3 years",
  reactExperience: "1-3 years",
  phpExperience: "1-3 years",
  laravelExperience: "1-3 years",
  nodeExperience: "<1 year",
  noticePeriod: "Immediately available",
  scrumAgileExperience: "Yes",
  insuranceExperience: "No",
  chatbotExperience: "No",
  currentEmploymentStatus: "Not currently employed",
  workEligibility: "Yes",
  onsiteAvailability: "Yes",
  primarySkillLevel: "Intermediate",
  secondarySkillLevel: "Basic",
  outOfPortfolioSkillLevel: "No experience",
  emailAddress: "samaratirta07@gmail.com",
  phoneCountryCode: "Indonesia (+62)",
  phoneNumber: "81284964533",
  currentLocation: "Kota Bogor, West Java, Indonesia",
  livesInJobLocation: "No",
  englishProficiency: "Conversational",
  graphqlExperience: "No experience",
  computerSoftwareExperience: "1-3 years",
  computerNetworkingExperience: "No experience",
  networkSecurityExperience: "No experience",
  databases: "PostgreSQL, SQLite, MySQL",
  versionControlTools: "Git",
  fallbackScreeningAnswer: "I have relevant web development experience and am willing to learn the specific tools required for this role.",
  discoveredQuestions: AUDITED_QUESTIONS,
  defaultCoverNote:
    "I am Tirta, a Fullstack Web Developer focused on React, TypeScript, Laravel, PHP, MySQL, Tailwind CSS, and API integration. I am interested in this role because it aligns with my frontend-first fullstack experience and web application projects. I am ready to learn quickly, collaborate with the team, and contribute to the company's product development.",
};

const DEFAULT_RULES = {
  sources: "Glints, JobStreet, LinkedIn",
  keywords: "Fullstack Web Developer, Frontend React, Laravel Developer, PHP Developer, Junior Web Developer",
  scrapingFrequency: "Manual",
  targetLocation: "Jabodetabek, Hybrid, Remote Indonesia",
  browserActBrowserId: "direct_local_105855706457964564",
  scrapeLimitPerRun: "40",
  autoApplyLimitPerRun: "5",
  autoRemoteAssist: false,
  requireSubmitConfirmation: false,
  blacklistCompanies: "Boogie Apparel, Bogie Apparel",
  skipUnpaid: true,
  skipSeniorLead: true,
  skipDominantJavaGolangDotnet: true,
  skipOutsideTargetLocation: true,
  skipWithoutCv: true,
  pauseOnCaptchaOrVerification: true,
  autoQueueImportedJobs: true,
};

const DEFAULT_STATE = {
  jobs: [],
  answerBank: DEFAULT_ANSWER_BANK,
  rules: DEFAULT_RULES,
  activityLog: [],
  automationRun: null,
  updatedAt: null,
};
const STALE_APPLYING_MS = 10 * 60 * 1000;

function ensureAutoApplyDir() {
  fs.mkdirSync(AUTO_APPLY_DIR, { recursive: true });
}

function readStateFile() {
  ensureAutoApplyDir();

  if (!fs.existsSync(STATE_PATH)) {
    return { ...DEFAULT_STATE, updatedAt: new Date().toISOString() };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return {
      ...DEFAULT_STATE,
      ...parsed,
      answerBank: {
        ...DEFAULT_ANSWER_BANK,
        ...(parsed.answerBank || {}),
        discoveredQuestions: normalizeDiscoveredQuestions([
          ...AUDITED_QUESTIONS,
          ...((parsed.answerBank || {}).discoveredQuestions || []),
        ]),
      },
      rules: { ...DEFAULT_RULES, ...(parsed.rules || {}) },
      jobs: Array.isArray(parsed.jobs)
        ? parsed.jobs.map((job) =>
            normalizeStatus(job.pipelineStatus) === "needs input"
              ? {
                  ...job,
                  pipelineStatus: "Skipped",
                  nextAction: job.nextAction || "Skipped automatically; retry from Siap Apply when desired.",
                  browserSessionName: "",
                  remoteAssist: "",
                }
              : job
          )
        : [],
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : [],
      automationRun: parsed.automationRun || null,
    };
  } catch {
    return { ...DEFAULT_STATE, updatedAt: new Date().toISOString() };
  }
}

function writeStateFile(state) {
  ensureAutoApplyDir();
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return nextState;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return clean(value).toLowerCase();
}

function normalizedSearchText(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function identityText(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDiscoveredQuestions(items = []) {
  const optionOnly = /^(?:immediately|\d+\s*(?:weeks?|months?)|no experience|tidak berpengalaman|<\s*1\s*thn|\d+\s*[-+]?.*thn|basic|dasar|intermediate|menengah|advanced|ahli|postgresql|oracle|db2|sqlite|microsoft sql|mysql|informix|teradata|sybase|tidak satupun|ibm clearcase|apache subversion|svn|git|mercurial|perforce|accurev)$/i;
  const questionLead = /^(?:how|what|which|when|where|why|do you|are you|have you|could you|berapa|apa|mana|kapan|apakah|seberapa|kualifikasi)/i;
  const byQuestion = new Map();

  items.forEach((item) => {
    const question = clean(item?.question);
    const key = identityText(question);
    if (!question || !key || question.length < 4 || question.length > 500 || optionOnly.test(question)) return;
    if (!String(item?.id || "").startsWith("AUDIT-") && !/[?]/.test(question) && !questionLead.test(question)) return;

    const current = byQuestion.get(key);
    byQuestion.set(key, {
      ...current,
      ...item,
      question,
      mappedAnswerKey: classifyApplicationQuestion(question),
      count: Math.max(Number(current?.count || 0), Number(item?.count || 1)),
    });
  });

  return Array.from(byQuestion.values())
    .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")))
    .slice(0, 200);
}

function canonicalJobUrl(value) {
  const rawUrl = clean(value);
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawUrl.split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

function jobUrlIdentity(value) {
  const url = canonicalJobUrl(value);
  const jobStreetId = url.match(/jobstreet\.[^/]+\/job\/(\d+)/i)?.[1];
  if (jobStreetId) return `jobstreet:${jobStreetId}`;

  const glintsId = url.match(/\/opportunities\/jobs\/[^/]+\/([a-f0-9-]{20,})$/i)?.[1];
  if (glintsId) return `glints:${glintsId.toLowerCase()}`;
  const linkedInId = url.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d+)/i)?.[1];
  if (linkedInId) return `linkedin:${linkedInId}`;
  return url ? `url:${url.toLowerCase()}` : "";
}

function roleCompanyIdentity(job = {}) {
  const title = identityText(job.jobTitle || job.job_title);
  const company = identityText(job.company);
  return title && company ? `role-company:${title}|${company}` : "";
}

function jobIdentityKeys(job = {}) {
  return [jobUrlIdentity(job.jobUrl || job.job_url), roleCompanyIdentity(job)].filter(Boolean);
}

function appliedIdentitySet(jobs = []) {
  const appliedStatuses = new Set(["applied", "interview", "offer", "rejected"]);
  return new Set(
    jobs
      .filter((job) => appliedStatuses.has(normalizeStatus(job.pipelineStatus)))
      .flatMap((job) => jobIdentityKeys(job))
  );
}

function wasAlreadyApplied(job, appliedIdentities) {
  return jobIdentityKeys(job).some((key) => appliedIdentities.has(key));
}

function normalizeStatus(status) {
  return slug(status);
}

function pick(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const found = entries.find(([entryKey]) => slug(entryKey) === slug(key));
    if (found) {
      return found[1];
    }
  }
  return "";
}

function listFromText(value) {
  return clean(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesAny(text, terms) {
  const normalizedText = slug(text);
  return terms.some((term) => normalizedText.includes(slug(term)));
}

function browserActAvailable() {
  const result = spawnSync(BROWSER_ACT_BIN, ["--version"], {
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    output: clean(`${result.stdout || ""} ${result.stderr || ""}`),
  };
}

function runBrowserAct(args, { timeout = 120000 } = {}) {
  const result = spawnSync(BROWSER_ACT_BIN, args, {
    encoding: "utf8",
    timeout,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(clean(output) || `browser-act failed with status ${result.status}`);
  }

  return output;
}

function sourceSlug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function locationSearchTargets(value) {
  const configured = listFromText(value);
  const geographicTargets = configured
    .filter((item) => !/\b(remote|wfh|work from home|dari rumah|hybrid)\b/i.test(item))
    .map((item) => {
      if (/jabodetabek/i.test(item)) {
        return { glints: "Jakarta", jobStreet: "Jakarta Raya", linkedIn: "Greater Jakarta Area" };
      }

      return { glints: item, jobStreet: item, linkedIn: item };
    });

  return geographicTargets.length
    ? geographicTargets
    : [{ glints: "Indonesia", jobStreet: "Indonesia", linkedIn: "Indonesia" }];
}

function buildScrapeTargets(rules = {}) {
  const sources = listFromText(rules.sources || DEFAULT_RULES.sources).filter((source) => /glints|jobstreet|linkedin/i.test(source));
  const keywords = listFromText(rules.keywords || DEFAULT_RULES.keywords).slice(0, 8);
  const locations = locationSearchTargets(rules.targetLocation || DEFAULT_RULES.targetLocation);
  const targets = [];

  for (const source of sources) {
    for (const keyword of keywords) {
      const encodedKeyword = encodeURIComponent(keyword);
      for (const location of locations) {
        if (/glints/i.test(source)) {
          targets.push({
            source: "Glints",
            keyword,
            location: location.glints,
            url: `https://glints.com/id/opportunities/jobs/explore?keyword=${encodedKeyword}&locationName=${encodeURIComponent(location.glints)}`,
          });
        }

        if (/jobstreet/i.test(source)) {
          targets.push({
            source: "JobStreet",
            keyword,
            location: location.jobStreet,
            url: `https://id.jobstreet.com/${sourceSlug(keyword)}-jobs/in-${sourceSlug(location.jobStreet)}`,
          });
        }

        if (/linkedin/i.test(source)) {
          targets.push({
            source: "LinkedIn",
            keyword,
            location: location.linkedIn,
            url: `https://www.linkedin.com/jobs/search/?keywords=${encodedKeyword}&location=${encodeURIComponent(location.linkedIn)}&f_AL=true`,
          });
        }
      }
    }
  }

  return targets;
}

const GENERIC_ROLE_WORDS = new Set(["developer", "engineer", "programmer", "software", "specialist"]);
const KEYWORD_ALIASES = {
  fullstack: /\bfull\s*stack\b/i,
  frontend: /\bfront\s*end\b/i,
  backend: /\bback\s*end\b/i,
  react: /\breact(?:js)?\b/i,
  javascript: /\b(?:javascript|java\s*script|js)\b/i,
  typescript: /\b(?:typescript|type\s*script|ts)\b/i,
  nextjs: /\bnext\.?js\b/i,
  junior: /\b(?:junior|jr\.?|entry[ -]?level|fresh graduate)\b/i,
};

function keywordConcepts(keyword) {
  const concepts = normalizedSearchText(keyword)
    .replace(/full stack/g, "fullstack")
    .replace(/front end/g, "frontend")
    .replace(/back end/g, "backend")
    .replace(/next js/g, "nextjs")
    .split(" ")
    .filter((word) => word && !GENERIC_ROLE_WORDS.has(word));

  if (concepts.some((word) => ["fullstack", "frontend", "backend"].includes(word))) {
    return concepts.filter((word) => word !== "web");
  }

  return concepts;
}

function matchesKeyword(title, keyword) {
  const normalizedTitle = normalizedSearchText(title);
  const concepts = keywordConcepts(keyword);
  if (!normalizedTitle || !concepts.length) {
    return false;
  }

  return concepts.every((concept) => {
    const alias = KEYWORD_ALIASES[concept];
    if (alias) return alias.test(normalizedTitle);
    return new RegExp(`\\b${concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalizedTitle);
  });
}

function matchesConfiguredKeyword(title, rules = {}) {
  const keywords = listFromText(rules.keywords || DEFAULT_RULES.keywords);
  return keywords.length === 0 || keywords.some((keyword) => matchesKeyword(title, keyword));
}

function matchesTargetLocation(job, rules = {}) {
  if (!rules.skipOutsideTargetLocation) return true;

  const targets = listFromText(rules.targetLocation || DEFAULT_RULES.targetLocation);
  if (!targets.length) return true;

  const rawText = `${job.location || ""} ${job.workArrangement || ""} ${job.jobTitle || ""}`;
  const text = normalizedSearchText(rawText);
  if (!text) return false;

  return targets.some((targetValue) => {
    const target = normalizedSearchText(targetValue);
    if (!target) return false;

    if (/\b(remote|wfh|work from home|dari rumah)\b/.test(target)) {
      return /\b(remote|wfh|work from home|dari rumah)\b/.test(text);
    }
    if (/\bhybrid\b/.test(target)) return /\bhybrid\b/.test(text);
    if (/\bjabodetabek\b/.test(target)) {
      return /\b(jakarta|bogor|depok|tangerang|bekasi|jabodetabek)\b/.test(text);
    }
    if (/\bjakarta raya\b/.test(target)) return /\bjakarta\b/.test(text);

    return text.includes(target);
  });
}

function scrapedRowKey(row) {
  return jobUrlIdentity(row.job_url) || `${slug(row.job_title)}|${slug(row.company)}|${slug(row.source)}`;
}

function storedJobKey(job) {
  return jobUrlIdentity(job.jobUrl) || `${slug(job.jobTitle)}|${slug(job.company)}|${slug(job.source)}`;
}

function looksLikeJobTitle(text) {
  return /\b(developer|programmer|software engineer|frontend|front end|backend|back end|fullstack|full stack|web|react|laravel|php|javascript|typescript|next\.?js)\b/i.test(
    text
  );
}

function matchesPortfolioTarget(text) {
  return /\b(fullstack|full stack|web developer|frontend|front end|backend|back end|react|laravel|php|javascript|typescript|next\.?js|mysql|api)\b/i.test(
    text
  );
}

function detectSkills(text) {
  return [
    "React",
    "JavaScript",
    "TypeScript",
    "Laravel",
    "PHP",
    "Tailwind CSS",
    "Bootstrap",
    "Sass",
    "Next.js",
    "MySQL",
    "API integration",
    "Git",
  ].filter((skill) => new RegExp(skill.replace(".", "\\."), "i").test(text));
}

function cleanMarkdownText(value) {
  return clean(
    value
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/[#*_`>|-]/g, " ")
  );
}

function inferLine(lines, startIndex, matcher) {
  const window = lines.slice(startIndex + 1, startIndex + 11).map(cleanMarkdownText).filter(Boolean);
  return window.find(matcher) || "";
}

function parseJobsFromMarkdown(markdown, target) {
  const rows = [];
  const seenUrls = new Set();
  const lines = String(markdown || "").split(/\r?\n/);
  const linkRegex = /\[([^\]]{3,140})]\((https?:\/\/[^)\s]+)\)/g;

  lines.forEach((line, index) => {
    let match = linkRegex.exec(line);
    while (match) {
      const title = cleanMarkdownText(match[1]);
      const jobUrl = canonicalJobUrl(match[2]);
      const sameSource =
        target.source === "Glints"
          ? /glints\.com/i.test(jobUrl)
          : target.source === "LinkedIn"
            ? /linkedin\.com/i.test(jobUrl)
            : /jobstreet\./i.test(jobUrl);
      const detailUrl =
        target.source === "Glints"
          ? /\/opportunities\/jobs\//i.test(jobUrl)
          : target.source === "LinkedIn"
            ? /\/jobs\/view\//i.test(jobUrl)
            : /\/job\//i.test(jobUrl);
      const genericLink = /sign|login|masuk|daftar|apply|lamar|company|perusahaan|salary|gaji/i.test(title);

      if (sameSource && detailUrl && looksLikeJobTitle(title) && !genericLink && !seenUrls.has(jobUrl)) {
        seenUrls.add(jobUrl);
        const contextLines = lines.slice(index, index + 12);
        const contextRaw = contextLines.join("\n");
        const context = contextLines.map(cleanMarkdownText).join(" ");
        const companyMatch =
          contextRaw.match(/\bat\s+\[([^\]]{2,120})]\(https?:\/\/[^)]*\)/i) ||
          contextRaw.match(/\[([^\]]{2,120})]\(https?:\/\/[^)]*\/companies\/[^)]*\)/i) ||
          contextRaw.match(/\bat\s+([^\n]{2,120})/i);
        const company = (
          cleanMarkdownText(companyMatch?.[1] || "") ||
          inferLine(
            lines,
            index,
            (candidate) =>
              candidate !== title &&
              !looksLikeJobTitle(candidate) &&
              !/jakarta|remote|hybrid|full time|penuh waktu|contract|kontrak|rp|idr|tahun|sarjana|diploma|fresh graduate/i.test(candidate)
          )
        ).replace(/^at\s+/i, "");
        const location = inferLine(lines, index, (candidate) =>
          !/^at\s+/i.test(candidate) && /jakarta|bogor|depok|tangerang|bekasi|jabodetabek|remote|hybrid|\(remote\)/i.test(candidate)
        );
        const salaryRaw = inferLine(lines, index, (candidate) => /rp|idr|juta|jt|\$|salary|gaji/i.test(candidate));

        rows.push({
          source: target.source,
          job_title: title,
          company,
          location,
          work_arrangement: /remote/i.test(context) ? "Remote" : /hybrid/i.test(context) ? "Hybrid" : "",
          employment_type: /intern|magang/i.test(context)
            ? "Internship"
            : /contract|kontrak/i.test(context)
              ? "Contract"
              : /full.?time|penuh waktu/i.test(context)
                ? "Full-time"
                : "",
          salary_raw: salaryRaw,
          matched_query: target.keyword,
          matched_portfolio_skills: detectSkills(`${title} ${context}`).join(", "),
          job_url: jobUrl,
          scraped_at: new Date().toISOString(),
        });
      }

      match = linkRegex.exec(line);
    }
  });

  return rows;
}

function markdownLinks(markdown) {
  const links = [];
  const regex = /\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g;
  let match = regex.exec(String(markdown || ""));
  while (match) {
    links.push({ text: cleanMarkdownText(match[1]), url: canonicalJobUrl(match[2]), index: match.index });
    match = regex.exec(String(markdown || ""));
  }
  return links;
}

function parseJobDetailMarkdown(markdown, row = {}) {
  const source = clean(row.source);
  const raw = String(markdown || "");
  const lines = raw.split(/\r?\n/);
  const cleanedLines = lines.map(cleanMarkdownText).filter(Boolean);
  const topLines = cleanedLines.slice(0, 180);
  const links = markdownLinks(raw);
  const title = clean(row.job_title);
  const titleIndex = cleanedLines.findIndex((line) => slug(line) === slug(title));
  const afterTitle = titleIndex >= 0 ? cleanedLines.slice(titleIndex + 1, titleIndex + 14) : topLines;
  const metadataLines = titleIndex >= 0 ? cleanedLines.slice(titleIndex, titleIndex + 40) : topLines.slice(0, 80);
  const metadataText = metadataLines.join(" ");

  let company = "";
  let location = "";

  if (/glints/i.test(source)) {
    const leadingLinks = links.slice(0, 40);
    company = leadingLinks.find((link) => /\/companies\//i.test(link.url))?.text || "";
    const locationLinks = leadingLinks.filter(
      (link) => /\/job-location\//i.test(link.url) && !/^lokasi$/i.test(link.text)
    );
    location = locationLinks.at(-1)?.text || "";
  } else if (/jobstreet/i.test(source)) {
    location = links.find((link) => /-jobs\/in-/i.test(link.url))?.text || "";
  } else if (/linkedin/i.test(source)) {
    company = links.find((link) => /linkedin\.com\/company\//i.test(link.url))?.text || "";
    location = metadataLines.find((line) =>
      /jakarta|bogor|depok|tangerang|bekasi|bandung|surabaya|semarang|yogyakarta|malang|bali|indonesia|remote|hybrid/i.test(line)
    ) || "";
  }

  if (!company) {
    company =
      afterTitle.find(
        (line) =>
          line !== title &&
          !/^[=\-]+$/.test(line) &&
          !/^(strong applicant|view all jobs|pekerjaan|lokasi|english|bahasa)$/i.test(line) &&
          !/jakarta|bogor|depok|tangerang|bekasi|bandung|surabaya|semarang|yogyakarta|malang|bali|remote|hybrid|full.?time|part.?time|intern|magang|contract|kontrak|rp|idr|posted|d ago/i.test(
            line
          ) &&
          line.length <= 140
      ) || "";
  }

  if (!location) {
    location =
      metadataLines.find((line) =>
        /jakarta|bogor|depok|tangerang|bekasi|bandung|cimahi|surabaya|semarang|yogyakarta|sleman|malang|bali|remote|hybrid/i.test(
          line
        )
      ) || "";
  }

  const salaryRaw =
    metadataLines.find((line) => /(?:rp|idr|\$)\s*[\d.,]+|[\d.,]+\s*(?:juta|jt)|per month|per bulan/i.test(line)) || "";
  const workArrangement = /\b(remote|work from home|dari rumah|wfh)\b/i.test(metadataText)
    ? "Remote"
    : /\bhybrid\b/i.test(metadataText)
      ? "Hybrid"
      : /kerja di lokasi|on.?site/i.test(metadataText)
        ? "On-site"
        : "";
  const employmentType = /\b(internship|intern|magang)\b/i.test(metadataText)
    ? "Internship"
    : /\b(contract|kontrak)\b/i.test(metadataText)
      ? "Contract"
      : /\b(full.?time|penuh waktu)\b/i.test(metadataText)
        ? "Full-time"
        : /\b(part.?time|paruh waktu)\b/i.test(metadataText)
          ? "Part-time"
          : "";
  const descriptionEnd = cleanedLines.findIndex((line, index) => {
    return index > Math.max(0, titleIndex) && /^(employer questions|company profile|featured jobs|tentang perusahaan)$/i.test(line);
  });
  const descriptionLines = cleanedLines.slice(
    Math.max(0, titleIndex),
    descriptionEnd > 0 ? descriptionEnd : Math.min(cleanedLines.length, Math.max(0, titleIndex) + 220)
  );

  return {
    company,
    location,
    workArrangement,
    employmentType,
    salaryRaw,
    jobDescription: clean(descriptionLines.join(" ")).slice(0, 16000),
    alreadyApplied:
      /\b(you applied|already applied|application submitted|sudah melamar|kamu sudah melamar|lamaran terkirim)\b/i.test(raw),
    isClosed: /\b(job is no longer available|job has expired|lowongan ini telah ditutup|lowongan ditutup|closed)\b/i.test(raw),
  };
}

function enrichScrapedRow(row, detail) {
  const detailText = `${detail.jobDescription || ""} ${detail.company || ""}`;
  return {
    ...row,
    company: detail.company || row.company,
    location: detail.location || row.location,
    work_arrangement: detail.workArrangement || row.work_arrangement,
    employment_type: detail.employmentType || row.employment_type,
    salary_raw: detail.salaryRaw || row.salary_raw,
    job_description: detail.jobDescription || "",
    matched_portfolio_skills: detectSkills(`${row.job_title} ${detailText}`).join(", "),
    already_applied: detail.alreadyApplied,
    is_closed: detail.isClosed,
    detail_fetch_status: "success",
    detail_fetched_at: new Date().toISOString(),
  };
}

function browserActExtractWithChromeDirect(target, rules = {}, handleSearchMarkdown = (markdown) => markdown) {
  const browserId = clean(rules.browserActBrowserId) || DEFAULT_RULES.browserActBrowserId;
  const sessionName = `job-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    runBrowserAct(["--session", sessionName, "browser", "open", browserId, target.url], { timeout: 120000 });
    runBrowserAct(["--session", sessionName, "wait", "stable", "--timeout", "45000"], { timeout: 60000 });
    const markdown = runBrowserAct(["--session", sessionName, "get", "markdown"], { timeout: 120000 });
    return handleSearchMarkdown(markdown, {
      readDetail(detailUrl) {
        runBrowserAct(["--session", sessionName, "navigate", detailUrl], { timeout: 120000 });
        runBrowserAct(["--session", sessionName, "wait", "stable", "--timeout", "45000"], { timeout: 60000 });
        return runBrowserAct(["--session", sessionName, "get", "markdown"], { timeout: 120000 });
      },
    });
  } finally {
    try {
      runBrowserAct(["session", "close", sessionName], { timeout: 30000 });
    } catch {
      // Ignore cleanup errors; stale sessions can be closed manually from BrowserAct if needed.
    }
  }
}

function autoQueueDecision(job, rules = {}) {
  const title = clean(job.jobTitle);
  const company = clean(job.company);
  const location = clean(job.location);
  const salary = clean(job.salaryRaw);
  const skills = clean(job.matchedPortfolioSkills);
  const text = `${title} ${company} ${location} ${salary} ${skills} ${job.notes || ""}`;
  const reasons = [];

  if (job.alreadyApplied) {
    reasons.push("already applied");
  }

  if (job.isClosed) {
    reasons.push("closed job");
  }

  const blacklist = listFromText(rules.blacklistCompanies);
  if (blacklist.length && includesAny(company, blacklist)) {
    reasons.push("blacklisted company");
  }

  if (rules.skipSeniorLead && /\b(senior|sr\.?|lead|principal|manager|head|architect)\b/i.test(title)) {
    reasons.push("senior/lead role");
  }

  if (rules.skipUnpaid && /\b(unpaid|tidak dibayar|tanpa gaji|volunteer)\b/i.test(text)) {
    reasons.push("unpaid role");
  }

  if (rules.skipDominantJavaGolangDotnet && /\b(java|golang|go developer|\.net|c#)\b/i.test(title)) {
    reasons.push("dominant out-of-target stack");
  }

  if (!matchesConfiguredKeyword(title, rules)) {
    reasons.push("outside target keywords");
  }

  if (!matchesPortfolioTarget(`${title} ${skills}`)) {
    reasons.push("weak portfolio match");
  }

  if (!matchesTargetLocation(job, rules)) {
    reasons.push("outside target location");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function inferPriority(row) {
  const title = clean(pick(row, ["job_title", "jobPosition", "Job Position", "title"]));
  const skills = clean(pick(row, ["matched_portfolio_skills", "Skills Matched", "skills"]));
  const text = `${title} ${skills}`;
  let score = 0;

  if (/full\s*stack|fullstack/i.test(title)) score += 3;
  if (/front\s*end|frontend|web developer/i.test(title)) score += 2;
  if (/react|javascript|typescript|laravel|php|mysql|tailwind|next/i.test(text)) score += 3;
  if (/junior|intern|magang|entry/i.test(text)) score += 2;
  if (/senior|lead|manager|architect/i.test(title)) score -= 4;

  if (score >= 6) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

function normalizeJob(row, index = 0, { rules = {} } = {}) {
  const existingId = clean(pick(row, ["tracking_id", "id", "ID"]));
  const source = clean(pick(row, ["source", "Apply Via", "applyVia"])) || "Manual";
  const jobTitle = clean(pick(row, ["job_title", "Job Position", "jobPosition", "title"]));
  const company = clean(pick(row, ["company", "Company Name", "companyName"]));
  const jobUrl = canonicalJobUrl(pick(row, ["job_url", "Source Link", "sourceLink", "url"]));
  const status = clean(pick(row, ["pipeline_status", "Status", "status"]));

  const job = {
    id: existingId || `AUTO-${Date.now()}-${index + 1}`,
    priority: clean(pick(row, ["priority"])) || inferPriority(row),
    pipelineStatus: status || "Belum direview",
    nextAction: clean(pick(row, ["next_action"])) || "Review fit and prepare application",
    followUpAt: clean(pick(row, ["follow_up_at"])),
    appliedAt: clean(pick(row, ["applied_at", "Applying Date"])),
    responseStatus: clean(pick(row, ["response_status"])) || "Belum ada response",
    notes: clean(pick(row, ["notes", "Notes"])),
    source,
    jobTitle,
    company,
    location: clean(pick(row, ["location"])),
    workArrangement: clean(pick(row, ["work_arrangement", "workArrangement"])),
    employmentType: clean(pick(row, ["employment_type", "employmentType"])),
    salaryRaw: clean(pick(row, ["salary_raw"])),
    matchedQuery: clean(pick(row, ["matched_query"])),
    matchedPortfolioSkills: clean(pick(row, ["matched_portfolio_skills", "Skills Matched"])),
    jobDescription: clean(pick(row, ["job_description", "jobDescription"])),
    alreadyApplied: Boolean(row?.already_applied ?? row?.alreadyApplied),
    isClosed: Boolean(row?.is_closed ?? row?.isClosed),
    detailFetchStatus: clean(pick(row, ["detail_fetch_status", "detailFetchStatus"])),
    detailFetchedAt: clean(pick(row, ["detail_fetched_at", "detailFetchedAt"])),
    filterReasons: Array.isArray(row?.filterReasons) ? row.filterReasons : [],
    jobUrl,
    createdAt: clean(pick(row, ["scraped_at"])) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!status && rules.autoQueueImportedJobs) {
    const decision = autoQueueDecision(job, rules);
    job.pipelineStatus = decision.ok ? "Siap Apply" : "Archived";
    job.nextAction = decision.ok ? "Auto apply queue" : "Skipped by auto apply filter";
    job.filterReasons = decision.reasons;
    if (!decision.ok) {
      job.notes = clean(`${job.notes || ""} Auto skipped: ${decision.reasons.join(", ")}.`);
    }
  }

  return job;
}

function addLog(state, message, data = {}) {
  const entry = {
    id: `LOG-${Date.now()}`,
    createdAt: new Date().toISOString(),
    message,
    data,
  };
  return [entry, ...(state.activityLog || [])].slice(0, 80);
}

function addRunLog(run, message, data = {}) {
  const entry = {
    id: `RUNLOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    message,
    data,
  };

  return [entry, ...((run && run.logs) || [])].slice(0, 120);
}

function isRunActive(run) {
  return ["running", "starting"].includes(normalizeStatus(run?.status));
}

function recoverStaleApplyingJobs(state) {
  if (isRunActive(state.automationRun)) {
    return { state, recovered: 0 };
  }

  let recovered = 0;
  const now = Date.now();
  const jobs = state.jobs.map((job) => {
    if (normalizeStatus(job.pipelineStatus) !== "applying") {
      return job;
    }

    const updatedAt = Date.parse(job.updatedAt || job.createdAt || "");
    const isStale = !Number.isFinite(updatedAt) || now - updatedAt > STALE_APPLYING_MS;

    if (!isStale) {
      return job;
    }

    recovered += 1;
    return {
      ...job,
      pipelineStatus: "Siap Apply",
      nextAction: "Recovered from stale auto apply run; ready to retry.",
      browserSessionName: "",
      remoteAssist: "",
      updatedAt: new Date().toISOString(),
    };
  });

  if (!recovered) {
    return { state, recovered };
  }

  return {
    state: {
      ...state,
      jobs,
      activityLog: addLog(state, "Recovered stale auto apply jobs.", { recovered }),
    },
    recovered,
  };
}

function stopProcessTree(pid) {
  if (!pid) {
    return { stopped: false, reason: "Worker PID is empty." };
  }

  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) {
    return { stopped: false, reason: "Worker PID is invalid." };
  }

  const result =
    process.platform === "win32"
      ? spawnSync("taskkill", ["/PID", String(numericPid), "/T", "/F"], { encoding: "utf8" })
      : spawnSync("kill", ["-TERM", String(numericPid)], { encoding: "utf8" });

  const output = clean(`${result.stdout || ""} ${result.stderr || ""}`);
  return {
    stopped: result.status === 0,
    pid: numericPid,
    output,
  };
}

function sessionNameFor(job, runId) {
  const runPart = String(runId || "run").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-12);
  const jobPart = String(job?.id || Date.now()).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-12);
  return `auto-apply-${runPart || "run"}-${jobPart || "job"}`.slice(0, 64);
}

function closeBrowserActSession(sessionName) {
  if (!sessionName) {
    return { closed: false, reason: "BrowserAct session name is empty." };
  }

  const result = spawnSync(BROWSER_ACT_BIN, ["session", "close", sessionName], {
    encoding: "utf8",
    timeout: 30000,
  });
  const output = clean(`${result.stdout || ""} ${result.stderr || ""}`);

  return {
    closed: result.status === 0,
    sessionName,
    output,
  };
}

export function getAutoApplyState() {
  const { state, recovered } = recoverStaleApplyingJobs(readStateFile());
  return recovered ? writeStateFile(state) : state;
}

export function updateAutoApplySettings({ answerBank = {}, rules = {} }) {
  const state = readStateFile();
  const nextState = {
    ...state,
    answerBank: { ...state.answerBank, ...answerBank },
    rules: { ...state.rules, ...rules },
  };
  nextState.activityLog = addLog(nextState, "Auto apply settings updated.");
  return writeStateFile(nextState);
}

export function recordAutoApplyQuestions(job = {}, questions = []) {
  const incoming = Array.isArray(questions) ? questions : [];
  if (!incoming.length) return readStateFile();

  const state = readStateFile();
  const now = new Date().toISOString();
  const existing = Array.isArray(state.answerBank?.discoveredQuestions)
    ? [...state.answerBank.discoveredQuestions]
    : [];
  const byQuestion = new Map(existing.map((item) => [identityText(item.question), item]));

  incoming.forEach((item, index) => {
    const question = clean(typeof item === "string" ? item : item.question);
    const key = identityText(question);
    if (!question || question.length < 4 || !key) return;

    const current = byQuestion.get(key);
    byQuestion.set(key, {
      id: current?.id || `QUESTION-${Date.now()}-${index + 1}`,
      question: question.slice(0, 500),
      type: clean(item?.type) || current?.type || "field",
      source: clean(job.source) || current?.source || "Unknown",
      jobId: clean(job.id) || current?.jobId || "",
      mappedAnswerKey: classifyApplicationQuestion(question),
      count: Number(current?.count || 0) + 1,
      firstSeenAt: current?.firstSeenAt || now,
      lastSeenAt: now,
    });
  });

  const discoveredQuestions = normalizeDiscoveredQuestions(Array.from(byQuestion.values()));
  return writeStateFile({
    ...state,
    answerBank: { ...state.answerBank, discoveredQuestions },
  });
}

export function importAutoApplyJobs(rows = []) {
  if (!Array.isArray(rows)) {
    throw new Error("Rows must be an array.");
  }

  const state = readStateFile();
  const existingByKey = new Map(state.jobs.map((job) => [storedJobKey(job), job]));

  const normalizedRows = rows
    .map((row, index) => normalizeJob(row, index, { rules: state.rules }))
    .filter((job) => job.jobTitle || job.company || job.jobUrl);

  let imported = 0;
  let updated = 0;

  for (const job of normalizedRows) {
    const key = storedJobKey(job);
    const existing = existingByKey.get(key);

    if (existing) {
      existingByKey.set(key, {
        ...existing,
        ...job,
        id: existing.id,
        pipelineStatus: existing.pipelineStatus || job.pipelineStatus,
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    } else {
      existingByKey.set(key, job);
      imported += 1;
    }
  }

  const nextState = {
    ...state,
    jobs: Array.from(existingByKey.values()),
  };
  nextState.activityLog = addLog(nextState, "Jobs imported into auto apply queue.", { imported, updated });
  return {
    ...writeStateFile(nextState),
    importSummary: { imported, updated, total: nextState.jobs.length },
  };
}

export function scrapeAutoApplyJobs({ rules = {} } = {}) {
  const state = readStateFile();
  const effectiveRules = { ...state.rules, ...rules };
  const browserAct = browserActAvailable();

  if (!browserAct.ok) {
    throw new Error(`BrowserAct CLI is not available. ${browserAct.output}`);
  }

  const limit = Math.max(1, Number(effectiveRules.scrapeLimitPerRun || DEFAULT_RULES.scrapeLimitPerRun) || 40);
  const detailLimit = Math.min(limit, 40);
  const targets = buildScrapeTargets(effectiveRules);
  const appliedIdentities = appliedIdentitySet(state.jobs);
  const rows = [];
  const seenRows = new Set();
  const errors = [];
  let extracted = 0;
  let filteredOut = 0;
  let duplicatesRemoved = 0;
  let detailsAttempted = 0;
  let detailsEnriched = 0;
  let detailLimitReached = false;
  const detailErrors = [];
  const rejectionBreakdown = {
    alreadyApplied: 0,
    closedJob: 0,
    keywordMismatch: 0,
    outsideTargetLocation: 0,
    missingLocation: 0,
  };

  for (const target of targets) {
    if (rows.length >= limit || detailLimitReached) {
      break;
    }

    try {
      browserActExtractWithChromeDirect(target, effectiveRules, (markdown, { readDetail }) => {
        const parsedRows = parseJobsFromMarkdown(markdown, target);
        extracted += parsedRows.length;

        for (const row of parsedRows) {
          if (rows.length >= limit) break;

          if (wasAlreadyApplied(row, appliedIdentities)) {
            filteredOut += 1;
            rejectionBreakdown.alreadyApplied += 1;
            continue;
          }

          if (!matchesKeyword(row.job_title, target.keyword)) {
            filteredOut += 1;
            rejectionBreakdown.keywordMismatch += 1;
            continue;
          }

          const key = scrapedRowKey(row);
          if (seenRows.has(key)) {
            duplicatesRemoved += 1;
            continue;
          }
          seenRows.add(key);

          if (detailsAttempted >= detailLimit) {
            detailLimitReached = true;
            break;
          }

          let enrichedRow = row;
          detailsAttempted += 1;
          try {
            const detailMarkdown = readDetail(row.job_url);
            enrichedRow = enrichScrapedRow(row, parseJobDetailMarkdown(detailMarkdown, row));
            detailsEnriched += 1;
          } catch (error) {
            enrichedRow = {
              ...row,
              detail_fetch_status: "failed",
              detail_fetched_at: new Date().toISOString(),
            };
            detailErrors.push({
              source: target.source,
              keyword: target.keyword,
              jobTitle: row.job_title,
              jobUrl: row.job_url,
              error: error.message,
            });
          }

          if (enrichedRow.already_applied || wasAlreadyApplied(enrichedRow, appliedIdentities)) {
            filteredOut += 1;
            rejectionBreakdown.alreadyApplied += 1;
            continue;
          }

          if (enrichedRow.is_closed) {
            filteredOut += 1;
            rejectionBreakdown.closedJob += 1;
            continue;
          }

          const locationMatches = matchesTargetLocation(
            {
              jobTitle: enrichedRow.job_title,
              location: enrichedRow.location,
              workArrangement: enrichedRow.work_arrangement,
            },
            effectiveRules
          );
          if (!locationMatches) {
            filteredOut += 1;
            const hasLocationData = clean(`${enrichedRow.location || ""} ${enrichedRow.work_arrangement || ""}`);
            if (hasLocationData) rejectionBreakdown.outsideTargetLocation += 1;
            else rejectionBreakdown.missingLocation += 1;
            continue;
          }

          rows.push(enrichedRow);
        }
      });
    } catch (error) {
      errors.push({
        source: target.source,
        keyword: target.keyword,
        url: target.url,
        error: error.message,
      });
    }
  }

  const limitedRows = rows.slice(0, limit);
  const importedState = importAutoApplyJobs(limitedRows);
  const { importSummary } = importedState;
  const rowUrls = new Set(limitedRows.map((row) => jobUrlIdentity(row.job_url)).filter(Boolean));
  const rowKeys = new Set(limitedRows.map((row) => `${slug(row.job_title)}|${slug(row.company)}|${slug(row.source)}`));
  const stateAfterImport = readStateFile();
  const scrapedJobIds = stateAfterImport.jobs
    .filter((job) => rowUrls.has(jobUrlIdentity(job.jobUrl)) || rowKeys.has(`${slug(job.jobTitle)}|${slug(job.company)}|${slug(job.source)}`))
    .map((job) => job.id);
  const queuedState = queueEligibleJobsForAutoApply({ jobIds: scrapedJobIds });
  const { queueSummary, ...persistedQueuedState } = queuedState;
  const scrapeSummary = {
    targets: targets.length,
    extracted,
    matchedFilters: rows.length,
    filteredOut,
    rejectionBreakdown,
    duplicatesRemoved,
    detailsAttempted,
    detailsEnriched,
    detailLimit,
    detailLimitReached,
    detailFailed: detailErrors.length,
    detailErrors: detailErrors.slice(0, 20),
    queuedCandidates: limitedRows.length,
    autoQueue: queueSummary,
    errors,
  };

  const nextState = {
    ...persistedQueuedState,
    activityLog: addLog(persistedQueuedState, "Website scraping completed through BrowserAct.", scrapeSummary),
  };

  return {
    ...writeStateFile(nextState),
    scrapeSummary,
    importSummary,
  };
}

export function queueEligibleJobsForAutoApply({ jobIds = [], all = false } = {}) {
  const state = readStateFile();
  const appliedIdentities = appliedIdentitySet(state.jobs);
  let queued = 0;
  let skipped = 0;
  let considered = 0;

  const jobs = state.jobs.map((job) => {
    const status = normalizeStatus(job.pipelineStatus);
    const inSelection = all || jobIds.includes(job.id);
    const automaticallyArchived = status === "archived" && job.nextAction === "Skipped by auto apply filter";

    if (
      !inSelection ||
      ["applied", "scheduled", "applying", "skipped", "needs input", "failed", "rejected", "interview", "offer"].includes(status) ||
      (status === "archived" && !automaticallyArchived)
    ) {
      return job;
    }

    considered += 1;
    if (wasAlreadyApplied(job, appliedIdentities)) {
      skipped += 1;
      return {
        ...job,
        pipelineStatus: "Archived",
        nextAction: "Skipped by auto apply filter",
        filterReasons: ["already applied"],
        updatedAt: new Date().toISOString(),
      };
    }

    const decision = autoQueueDecision(job, state.rules);
    if (!decision.ok) {
      skipped += 1;
      return {
        ...job,
        pipelineStatus: "Archived",
        nextAction: "Skipped by auto apply filter",
        filterReasons: decision.reasons,
        updatedAt: new Date().toISOString(),
      };
    }

    queued += 1;
    return {
      ...job,
      pipelineStatus: "Siap Apply",
      nextAction: "Auto apply queue",
      filterReasons: [],
      updatedAt: new Date().toISOString(),
    };
  });

  const nextState = {
    ...state,
    jobs,
  };
  nextState.activityLog = addLog(nextState, "Eligible jobs queued for auto apply.", { considered, queued, skipped, all });
  return {
    ...writeStateFile(nextState),
    queueSummary: { considered, queued, skipped },
  };
}

export function updateAutoApplyJob(jobId, patch = {}) {
  const state = readStateFile();
  const now = new Date().toISOString();
  const jobs = state.jobs.map((job) => {
    if (job.id !== jobId) {
      return job;
    }

    const nextPatch =
      normalizeStatus(patch.pipelineStatus) === "applied" && !patch.appliedAt
        ? { ...patch, appliedAt: job.appliedAt || now }
        : patch;

    return {
      ...job,
      ...nextPatch,
      updatedAt: now,
    };
  });

  if (!jobs.some((job) => job.id === jobId)) {
    throw new Error("Job not found.");
  }

  const nextState = {
    ...state,
    jobs,
  };
  nextState.activityLog = addLog(nextState, "Job status updated.", { jobId, patch });
  return writeStateFile(nextState);
}

export function patchAutoApplyRun(patch = {}, logMessage = "", logData = {}) {
  const state = readStateFile();
  const currentRun = state.automationRun || {
    id: `RUN-${Date.now()}`,
    status: "idle",
    logs: [],
  };
  const nextRun = {
    ...currentRun,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (logMessage) {
    nextRun.logs = addRunLog(nextRun, logMessage, logData);
  }

  return writeStateFile({
    ...state,
    automationRun: nextRun,
  });
}

export function startAutoApplyRun({ jobIds = [], limit, source = "All" } = {}) {
  const recoveredState = recoverStaleApplyingJobs(readStateFile());
  const state = recoveredState.recovered ? writeStateFile(recoveredState.state) : recoveredState.state;
  if (isRunActive(state.automationRun)) {
    return {
      ...state,
      startSummary: {
        started: false,
        reason: "Auto apply run is already active.",
      },
    };
  }

  const prepared = prepareAutoApplyRun({ jobIds, source });
  if (prepared.blockedReasons.length) {
    const nextState = patchAutoApplyRun(
      {
        id: `RUN-${Date.now()}`,
        status: "blocked",
        total: 0,
        processed: 0,
        blockedReasons: prepared.blockedReasons,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        message: "Answer bank belum lengkap.",
      },
      "Auto apply blocked before worker start.",
      { blockedReasons: prepared.blockedReasons }
    );
    return {
      ...nextState,
      startSummary: {
        started: false,
        reason: prepared.blockedReasons.join(" "),
      },
    };
  }

  const runLimit = Math.max(1, Number(limit || state.rules.autoApplyLimitPerRun || DEFAULT_RULES.autoApplyLimitPerRun) || 5);
  const selectedJobs = prepared.jobs.slice(0, runLimit);
  if (!selectedJobs.length) {
    const nextState = patchAutoApplyRun(
      {
        id: `RUN-${Date.now()}`,
        status: "idle",
        total: 0,
        processed: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        message: "Tidak ada lowongan siap apply yang lolos filter.",
      },
      "Auto apply run skipped because no jobs are ready."
    );
    return {
      ...nextState,
      startSummary: {
        started: false,
        reason: "No ready jobs.",
      },
    };
  }

  const runId = `RUN-${Date.now()}`;
  const nextState = patchAutoApplyRun(
    {
      id: runId,
      status: "starting",
      total: selectedJobs.length,
      processed: 0,
      currentJobId: "",
      currentJobTitle: "",
      currentCompany: "",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      blockedReasons: [],
      applied: 0,
      skipped: 0,
      failed: 0,
      selectedSource: clean(source) || "All",
      message: "Memulai worker BrowserAct...",
      logs: [],
    },
    "Auto apply worker starting.",
    { total: selectedJobs.length, source: clean(source) || "All" }
  );

  ensureAutoApplyDir();
  fs.appendFileSync(WORKER_LOG_PATH, `\n[${new Date().toISOString()}] Starting ${runId} with limit ${runLimit}\n`, "utf8");
  const child = fork(WORKER_PATH, ["--run-id", runId, "--limit", String(runLimit), "--job-ids", selectedJobs.map((job) => job.id).join(",")], {
    cwd: SERVER_ROOT,
    execArgv: [],
    silent: true,
    windowsHide: true,
    env: {
      ...process.env,
      AUTO_APPLY_RUN_ID: runId,
      AUTO_APPLY_LIMIT: String(runLimit),
    },
  });

  child.stdout?.on("data", (chunk) => {
    fs.appendFileSync(WORKER_LOG_PATH, chunk, "utf8");
  });

  child.stderr?.on("data", (chunk) => {
    fs.appendFileSync(WORKER_LOG_PATH, chunk, "utf8");
  });

  patchAutoApplyRun(
    {
      id: runId,
      workerPid: child.pid,
      message: `Worker BrowserAct dimulai. PID: ${child.pid || "unknown"}`,
    },
    "Auto apply worker process spawned.",
    { pid: child.pid, workerPath: WORKER_PATH }
  );

  child.on("error", (error) => {
    patchAutoApplyRun(
      {
        id: runId,
        status: "failed",
        finishedAt: new Date().toISOString(),
        message: `Worker gagal start: ${error.message}`,
      },
      "Auto apply worker spawn failed.",
      { error: error.message, workerPath: WORKER_PATH }
    );
  });

  child.on("exit", (code, signal) => {
    const latestState = readStateFile();
    if (latestState.automationRun?.id === runId && isRunActive(latestState.automationRun)) {
      patchAutoApplyRun(
        {
          id: runId,
          status: "failed",
          finishedAt: new Date().toISOString(),
          message: `Worker berhenti sebelum membuka browser. Exit code: ${code ?? "none"}, signal: ${signal || "none"}.`,
        },
        "Auto apply worker exited before progress update.",
        { code, signal, workerLogPath: WORKER_LOG_PATH, workerPath: WORKER_PATH }
      );
    }
  });

  setTimeout(() => {
    const latestState = readStateFile();
    if (latestState.automationRun?.id === runId && normalizeStatus(latestState.automationRun.status) === "starting") {
      patchAutoApplyRun(
        {
          id: runId,
          status: "failed",
          finishedAt: new Date().toISOString(),
          message: "Worker tidak meng-update progress setelah start. Cek worker.log dan jalankan ulang.",
        },
        "Auto apply worker start timed out.",
        { pid: child.pid, workerPath: WORKER_PATH, serverRoot: SERVER_ROOT, workerLogPath: WORKER_LOG_PATH }
      );
    }
  }, 8000);

  return {
    ...nextState,
    startSummary: {
      started: true,
      runId,
      total: selectedJobs.length,
    },
  };
}

export function stopAutoApplyRun() {
  const state = readStateFile();
  const run = state.automationRun;

  if (!isRunActive(run)) {
    return {
      ...state,
      stopSummary: {
        stopped: false,
        reason: "Tidak ada run auto apply yang sedang berjalan.",
      },
    };
  }

  const stoppedAt = new Date().toISOString();
  const killResult = stopProcessTree(run.workerPid);
  const currentJob = state.jobs.find((job) => job.id === run.currentJobId);
  const sessionName = currentJob?.browserSessionName || (currentJob ? sessionNameFor(currentJob, run.id) : "");
  const sessionResult = closeBrowserActSession(sessionName);
  const jobs = state.jobs.map((job) => {
    if (job.id !== run.currentJobId || normalizeStatus(job.pipelineStatus) !== "applying") {
      return job;
    }

    return {
      ...job,
      pipelineStatus: "Siap Apply",
      nextAction: "Auto apply dihentikan user; bisa dijalankan ulang.",
      notes: clean(`${job.notes || ""} Auto apply stopped by user before completion.`),
      browserSessionName: "",
      remoteAssist: "",
      updatedAt: stoppedAt,
    };
  });

  const nextRun = {
    ...run,
    status: "stopped",
    finishedAt: stoppedAt,
    currentJobId: "",
    currentJobTitle: "",
    currentCompany: "",
    message: killResult.stopped
      ? "Auto apply dihentikan."
      : `Auto apply stop diminta, tapi worker PID tidak bisa dihentikan otomatis: ${killResult.reason || killResult.output || "unknown"}`,
    updatedAt: stoppedAt,
  };
  nextRun.logs = addRunLog(nextRun, "Auto apply stopped by user.", killResult);
  nextRun.logs = addRunLog(nextRun, "BrowserAct session cleanup requested.", sessionResult);

  const nextState = {
    ...state,
    jobs,
    automationRun: nextRun,
  };
  nextState.activityLog = addLog(nextState, "Auto apply stopped by user.", { killResult, sessionResult });

  return {
    ...writeStateFile(nextState),
    stopSummary: {
      ...killResult,
      session: sessionResult,
    },
  };
}

function matchesSelectedSource(job, source = "All") {
  const selectedSource = clean(source);
  return !selectedSource || /^all$/i.test(selectedSource) || clean(job?.source).toLowerCase() === selectedSource.toLowerCase();
}

export function prepareAutoApplyRun({ jobIds = [], source = "All" } = {}) {
  const recoveredState = recoverStaleApplyingJobs(readStateFile());
  const state = recoveredState.recovered ? writeStateFile(recoveredState.state) : recoveredState.state;
  const selected = state.jobs.filter((job) => {
    if (jobIds.length > 0 && !jobIds.includes(job.id)) {
      return false;
    }

    return matchesSelectedSource(job, source) && ["Siap Apply", "Ready", "Scheduled"].includes(job.pipelineStatus) && autoQueueDecision(job, state.rules).ok;
  });

  const blockedReasons = [];
  if (!state.answerBank.cvPath) blockedReasons.push("CV path is empty.");
  if (!state.answerBank.expectedSalary) blockedReasons.push("Expected salary is empty.");
  if (!state.answerBank.availability) blockedReasons.push("Availability is empty.");

  return {
    readyCount: blockedReasons.length ? 0 : selected.length,
    blockedReasons,
    jobs: blockedReasons.length ? [] : selected,
    selectedSource: clean(source) || "All",
    workerCommand: "cd server && npm run auto-apply",
  };
}

export function appendAutoApplyLog(message, data = {}) {
  const state = readStateFile();
  const nextState = {
    ...state,
    activityLog: addLog(state, message, data),
  };
  return writeStateFile(nextState);
}

export const autoApplyFilterInternals = {
  appliedIdentitySet,
  autoQueueDecision,
  buildScrapeTargets,
  canonicalJobUrl,
  matchesKeyword,
  matchesSelectedSource,
  matchesTargetLocation,
  parseJobDetailMarkdown,
  wasAlreadyApplied,
};
