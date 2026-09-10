import { spawnSync } from "child_process";
import fs from "fs";
import { pathToFileURL } from "url";
import {
  appendAutoApplyLog,
  getAutoApplyState,
  patchAutoApplyRun,
  prepareAutoApplyRun,
  recordAutoApplyQuestions,
  updateAutoApplyJob,
} from "../services/autoApply.service.js";
import {
  answerForApplicationQuestion,
  classifyApplicationQuestion,
  experienceToNumber,
  normalizeApplicationQuestion,
} from "../utils/applicationAnswer.util.js";

const BROWSER_ACT_BIN = process.platform === "win32" ? "browser-act.exe" : "browser-act";
const DEFAULT_LIMIT = Number(process.env.AUTO_APPLY_LIMIT || 5);
const ACTION_WAIT_MS = Math.max(250, Number(process.env.AUTO_APPLY_ACTION_WAIT_MS || 400) || 400);
const ACTION_TIMEOUT_MS = Math.max(5000, Number(process.env.AUTO_APPLY_ACTION_TIMEOUT_MS || 10000) || 10000);
const READ_TIMEOUT_MS = Math.max(5000, Number(process.env.AUTO_APPLY_READ_TIMEOUT_MS || 15000) || 15000);
const OPEN_TIMEOUT_MS = Math.max(10000, Number(process.env.AUTO_APPLY_OPEN_TIMEOUT_MS || 30000) || 30000);
const SESSION_CLOSE_TIMEOUT_MS = Math.max(2000, Number(process.env.AUTO_APPLY_SESSION_CLOSE_TIMEOUT_MS || 5000) || 5000);
const STEP_WAIT_TIMEOUT_MS = Math.max(3000, Number(process.env.AUTO_APPLY_STEP_WAIT_TIMEOUT_MS || 7000) || 7000);
const STEP_POLL_INTERVAL_MS = Math.max(150, Number(process.env.AUTO_APPLY_STEP_POLL_INTERVAL_MS || 300) || 300);
const STEP_MARKDOWN_INTERVAL_MS = Math.max(500, Number(process.env.AUTO_APPLY_STEP_MARKDOWN_INTERVAL_MS || 1200) || 1200);
const DRY_RUN = process.argv.includes("--dry-run");
const SLEEP_BUFFER = new SharedArrayBuffer(4);
const SLEEP_ARRAY = new Int32Array(SLEEP_BUFFER);

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function argList(name) {
  return argValue(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortUrl(value) {
  const text = clean(value);
  if (!text) return "";

  try {
    const url = new URL(text);
    return clean(`${url.hostname}${url.pathname}`).slice(0, 160);
  } catch {
    return text.slice(0, 160);
  }
}

function sleepSync(ms) {
  Atomics.wait(SLEEP_ARRAY, 0, 0, ms);
}

function truthyBrowserOutput(output) {
  return /clicked['"]?:\s*(true|True)|clicked:\s*(true|True)|submitted['"]?:\s*(true|True)|submitted:\s*(true|True)/.test(
    String(output || "")
  );
}

function browserOutputValue(output, key) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)`, "i");
  return clean(String(output || "").match(pattern)?.[1] || "");
}

function browserOutputNumber(output, key) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*(\\d+)`, "i");
  const value = Number(String(output || "").match(pattern)?.[1] || 0);
  return Number.isFinite(value) ? value : 0;
}

function summarizeStepResult(output = "") {
  const text = String(output || "");
  return {
    stage: browserOutputValue(text, "stage"),
    actionText: browserOutputValue(text, "text"),
    filled: browserOutputNumber(text, "filled"),
    clicked: truthyBrowserOutput(text),
    raw: clean(text).slice(0, 500),
  };
}

function runBrowserAct(args, { timeout = 120000 } = {}) {
  const result = spawnSync(BROWSER_ACT_BIN, args, {
    encoding: "utf8",
    timeout,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;

  if (result.status !== 0) {
    throw new Error(clean(output) || result.error?.message || `browser-act failed with status ${result.status}`);
  }

  return output;
}

function waitAfterAction(sessionName) {
  spawnSync(BROWSER_ACT_BIN, ["--session", sessionName, "wait", "stable", "--timeout", String(ACTION_WAIT_MS)], {
    encoding: "utf8",
    timeout: ACTION_WAIT_MS + 5000,
  });
}

function readLocation(sessionName) {
  return clean(runBrowserAct(["--session", sessionName, "eval", "location.href"], { timeout: ACTION_TIMEOUT_MS }));
}

function readMarkdown(sessionName) {
  return runBrowserAct(["--session", sessionName, "get", "markdown"], { timeout: READ_TIMEOUT_MS });
}

function detectJobStreetStage(location = "", markdown = "") {
  const text = `${location}\n${markdown}`;

  if (hasSuccessSignal(text)) return "success";
  if (hasBlockerSignal(text)) return "blocked";
  if (/\/apply\/role-requirements\b/i.test(location) || /Answer employer questions/i.test(markdown)) return "questions";
  if (/\/apply\/profile\b/i.test(location) || /Update Jobstreet Profile/i.test(markdown)) return "profile";
  if (/\/apply\/review\b/i.test(location) || (/Review and submit/i.test(markdown) && /Submit application|Send application|Kirim lamaran/i.test(markdown))) {
    return "review";
  }
  if (/\/apply\b/i.test(location) || /Choose documents/i.test(markdown)) return "documents";
  return "unknown";
}

function waitForJobStreetProgress(sessionName, beforeLocation, beforeMarkdown = "", { timeout = STEP_WAIT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const beforeStage = detectJobStreetStage(beforeLocation, beforeMarkdown);
  let lastLocation = beforeLocation;
  let lastMarkdown = beforeMarkdown;
  let lastStage = beforeStage;
  let nextMarkdownAt = startedAt + STEP_MARKDOWN_INTERVAL_MS;

  while (Date.now() - startedAt <= timeout) {
    lastLocation = readLocation(sessionName);
    const locationChanged = clean(lastLocation) !== clean(beforeLocation);
    if (!lastMarkdown || locationChanged || Date.now() >= nextMarkdownAt) {
      lastMarkdown = readMarkdown(sessionName);
      nextMarkdownAt = Date.now() + STEP_MARKDOWN_INTERVAL_MS;
    }
    lastStage = detectJobStreetStage(lastLocation, lastMarkdown);

    const text = `${lastMarkdown}\n${lastLocation}`;
    const stageChanged = lastStage !== "unknown" && lastStage !== beforeStage;
    const terminal = ["success", "blocked"].includes(lastStage);
    const validationFailed = /please make a selection|required field|please select|wajib diisi|harus diisi/i.test(text);

    if (locationChanged || stageChanged || terminal || validationFailed) {
      return {
        progressed: locationChanged || stageChanged || terminal,
        validationFailed,
        location: lastLocation,
        markdown: lastMarkdown,
        stage: lastStage,
        beforeStage,
        waitedMs: Date.now() - startedAt,
      };
    }

    sleepSync(STEP_POLL_INTERVAL_MS);
  }

  return {
    progressed: false,
    validationFailed: false,
    location: lastLocation,
    markdown: lastMarkdown,
    stage: lastStage,
    beforeStage,
    waitedMs: Date.now() - startedAt,
  };
}

function waitForPageProgress(sessionName, beforeLocation, beforeMarkdown = "", { timeout = STEP_WAIT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const beforeText = clean(beforeMarkdown).slice(0, 4000);
  let lastLocation = beforeLocation;
  let lastMarkdown = beforeMarkdown;
  let nextMarkdownAt = startedAt + STEP_MARKDOWN_INTERVAL_MS;

  while (Date.now() - startedAt <= timeout) {
    lastLocation = readLocation(sessionName);
    const locationChanged = clean(lastLocation) !== clean(beforeLocation);
    if (!lastMarkdown || locationChanged || Date.now() >= nextMarkdownAt) {
      lastMarkdown = readMarkdown(sessionName);
      nextMarkdownAt = Date.now() + STEP_MARKDOWN_INTERVAL_MS;
    }

    const text = `${lastMarkdown}\n${lastLocation}`;
    const contentChanged = beforeText && clean(lastMarkdown).slice(0, 4000) !== beforeText;
    const terminal = hasSuccessSignal(text) || hasBlockerSignal(text);
    const validationFailed = /please make a selection|required field|please select|wajib diisi|harus diisi/i.test(text);

    if (locationChanged || contentChanged || terminal || validationFailed) {
      return {
        progressed: locationChanged || contentChanged || terminal,
        validationFailed,
        location: lastLocation,
        markdown: lastMarkdown,
        waitedMs: Date.now() - startedAt,
      };
    }

    sleepSync(STEP_POLL_INTERVAL_MS);
  }

  return {
    progressed: false,
    validationFailed: false,
    location: lastLocation,
    markdown: lastMarkdown,
    waitedMs: Date.now() - startedAt,
  };
}

function checkBrowserAct() {
  const result = spawnSync(BROWSER_ACT_BIN, ["--version"], {
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    output: clean(`${result.stdout || ""}${result.stderr || ""}`),
  };
}

function indexedElementBlocks(stateText) {
  const lines = String(stateText || "").split(/\r?\n/);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*\[(\d+)]\s*(.+)$/);
    if (!match) continue;

    const content = [match[2]];
    for (let next = index + 1; next < lines.length && !/^\s*\[\d+]\s*/.test(lines[next]); next += 1) {
      content.push(lines[next]);
    }
    blocks.push({ index: Number(match[1]), text: clean(content.join(" ")) });
  }

  return blocks;
}

function findElementIndex(stateText, pattern) {
  for (const block of indexedElementBlocks(stateText)) {
    pattern.lastIndex = 0;
    if (pattern.test(block.text)) return block.index;
  }

  return null;
}

function findElementIndices(stateText, pattern) {
  const indices = [];

  for (const block of indexedElementBlocks(stateText)) {
    pattern.lastIndex = 0;
    if (pattern.test(block.text)) indices.push(block.index);
  }

  return indices;
}

function findApplyElementIndex(stateText) {
  return (
    indexedElementBlocks(stateText)
      .map((block) => ({
        ...block,
        label: clean(block.text.replace(/<[^>]+>/g, " ")),
      }))
      .filter(({ label }) => /\b(apply|lamar|easy apply|quick apply|lakukan lamaran|kirim lamaran)\b/i.test(label))
      .filter(({ label }) => !/chat.{0,30}aplikasi|aplikasi.{0,30}chat|download|unduh|scan|qr/i.test(label))
      .map((block) => ({
        ...block,
        score: /^lamar$/i.test(block.label)
          ? 120
          : /^(quick apply|easy apply|apply now|apply)$/i.test(block.label)
            ? 115
            : /\b(lamar sekarang|ajukan lamaran|kirim lamaran)\b/i.test(block.label)
              ? 105
              : 80,
      }))
      .sort((a, b) => b.score - a.score || a.label.length - b.label.length)[0]?.index || null
  );
}

function getApplyUrlFromMarkdown(markdown) {
  const match = String(markdown || "").match(/\[(quick apply|apply|lamar|ajukan lamaran)]\((https?:\/\/[^)\s]+)\)/i);
  return match?.[2] || "";
}

function getJobStreetApplyUrl(jobUrl = "") {
  try {
    const url = new URL(jobUrl);
    url.hash = "";
    url.search = "";
    url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/apply$/, "")}/apply`;
    return url.toString();
  } catch {
    return "";
  }
}

function buildAnswerPayload(answerBank = {}, job = {}) {
  return {
    coverNote: answerBank.defaultCoverNote || "",
    expectedSalary: answerBank.expectedSalary || "3000000",
    availability: answerBank.availability || "immediate",
    frontendExperience: answerBank.frontendExperience || "1-3 years",
    fullstackExperience: answerBank.fullstackExperience || "1-3 years",
    backendExperience: answerBank.backendExperience || "<1 year",
    educationLevel: answerBank.educationLevel || "Bachelor Degree (S1)",
    sqlExperience: answerBank.sqlExperience || "<1 year",
    rdbmsExperience: answerBank.rdbmsExperience || answerBank.sqlExperience || "<1 year",
    javascriptExperience: answerBank.javascriptExperience || answerBank.frontendExperience || "1-3 years",
    reactExperience: answerBank.reactExperience || answerBank.frontendExperience || "1-3 years",
    phpExperience: answerBank.phpExperience || answerBank.fullstackExperience || "1-3 years",
    laravelExperience: answerBank.laravelExperience || answerBank.fullstackExperience || "1-3 years",
    nodeExperience: answerBank.nodeExperience || answerBank.backendExperience || "<1 year",
    noticePeriod: answerBank.noticePeriod || "Immediately available",
    scrumAgileExperience: answerBank.scrumAgileExperience || "Yes",
    insuranceExperience: answerBank.insuranceExperience || "No",
    chatbotExperience: answerBank.chatbotExperience || "No",
    currentEmploymentStatus: answerBank.currentEmploymentStatus || "Not currently employed",
    workEligibility: answerBank.workEligibility || "Yes",
    onsiteAvailability: answerBank.onsiteAvailability || "Yes",
    primarySkillLevel: answerBank.primarySkillLevel || "Intermediate",
    secondarySkillLevel: answerBank.secondarySkillLevel || "Basic",
    outOfPortfolioSkillLevel: answerBank.outOfPortfolioSkillLevel || "No experience",
    emailAddress: answerBank.emailAddress || "",
    phoneCountryCode: answerBank.phoneCountryCode || "Indonesia (+62)",
    phoneNumber: answerBank.phoneNumber || "",
    currentLocation: answerBank.currentLocation || "",
    livesInJobLocation: answerBank.livesInJobLocation || "No",
    englishProficiency: answerBank.englishProficiency || "Conversational",
    graphqlExperience: answerBank.graphqlExperience || "No experience",
    computerSoftwareExperience: answerBank.computerSoftwareExperience || answerBank.fullstackExperience || "1-3 years",
    computerNetworkingExperience: answerBank.computerNetworkingExperience || "No experience",
    networkSecurityExperience: answerBank.networkSecurityExperience || "No experience",
    databases: answerBank.databases || "PostgreSQL, SQLite, MySQL",
    versionControlTools: answerBank.versionControlTools || "Git",
    fallbackScreeningAnswer:
      answerBank.fallbackScreeningAnswer ||
      "I have relevant web development experience and am willing to learn the specific tools required for this role.",
    jobTitle: job.jobTitle || "",
    company: job.company || "",
  };
}

function fillApplicationFields(sessionName, answerBank, job) {
  const payload = JSON.stringify(buildAnswerPayload(answerBank, job));
  const normalizeSource = normalizeApplicationQuestion.toString();
  const classifySource = classifyApplicationQuestion.toString();
  const answerSource = answerForApplicationQuestion.toString();
  const numberSource = experienceToNumber.toString();
  const script = `((answers) => {
    const events = ['input', 'change', 'blur'];
    const normalizeApplicationQuestion = ${normalizeSource};
    const classifyApplicationQuestion = ${classifySource};
    const experienceToNumber = ${numberSource};
    const answerForApplicationQuestion = ${answerSource};
    const normalize = (value) => String(value || '').replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    const lower = (value) => normalize(value).toLowerCase();
    const visible = (el) => !!(el && !el.disabled && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const roots = () => {
      const found = [document];
      for (let index = 0; index < found.length; index += 1) {
        for (const node of found[index].querySelectorAll('*')) {
          if (node.shadowRoot && !found.includes(node.shadowRoot)) found.push(node.shadowRoot);
        }
      }
      return found;
    };
    const allDeep = (selector) => Array.from(new Set(roots().flatMap((root) => Array.from(root.querySelectorAll(selector)))));
    const activeDialogs = allDeep('[role="dialog"],[aria-modal="true"],[class*="ModalContainer"],[class*="ApplicationModalContainer"]').filter(visible);
    const deepQueryAll = (selector) => allDeep(selector).filter((element) => !activeDialogs.length || activeDialogs.some((dialog) => dialog.contains(element)));
    const rootFor = (el) => el.getRootNode?.() || document;
    const labelFor = (el) => {
      if (!el.id) return null;
      try { return rootFor(el).querySelector('label[for="' + CSS.escape(el.id) + '"]'); } catch { return null; }
    };
    const referencedText = (el, attribute) => normalize(
      String(el.getAttribute(attribute) || '')
        .split(/\\s+/)
        .map((id) => {
          try { return rootFor(el).getElementById?.(id)?.innerText || rootFor(el).querySelector?.('#' + CSS.escape(id))?.textContent || ''; } catch { return ''; }
        })
        .join(' ')
    );
    const genericFieldHint = (value) => /^(?:(?:type|enter|write|input|masukkan|ketik|isi)\\s+)?(?:your\\s+)?(?:answer|response|jawaban)(?:\\s+(?:here|di sini))?[\\s*.:_-]*$/i.test(normalize(value));
    const questionSignal = /\\?|experience|pengalaman|salary|gaji|upah|kompensasi|compensation|remuneration|pay|ekspektasi|penghasilan|pendapatan|proficiency|kemahiran|notice|education|degree|qualification/i;
    const questionGroupCount = (node) => new Set(
      Array.from(node?.querySelectorAll?.('input:not([type="hidden"]),textarea,select') || [])
        .map((field) => field.type === 'radio' ? 'radio:' + (field.name || field.id) : field)
    ).size;
    const optionText = (el) => normalize(
      el.closest('label')?.innerText || labelFor(el)?.innerText || el.parentElement?.innerText || el.value || el.getAttribute('aria-label') || ''
    );
    const questionText = (el) => {
      const placeholder = normalize(el.getAttribute('placeholder'));
      const directLabel = normalize([
        labelFor(el)?.innerText,
        el.closest('label')?.innerText,
        referencedText(el, 'aria-labelledby'),
        referencedText(el, 'aria-describedby'),
        el.getAttribute('aria-label'),
        genericFieldHint(placeholder) ? '' : placeholder,
      ].filter(Boolean).join(' '));
      const isShortOption = el.type === 'radio' || /^(yes|no|ya|tidak|none|basic|intermediate|advanced)$/i.test(directLabel);
      if (directLabel && !isShortOption && !genericFieldHint(directLabel)) return directLabel;
      if (el.type === 'radio') {
        let sibling = el.closest('label')?.previousSibling;
        for (let index = 0; sibling && index < 10; index += 1, sibling = sibling.previousSibling) {
          const text = normalize(sibling.innerText || sibling.textContent || '');
          if (text && !/^(yes|no|ya|tidak|none|tidak berpengalaman|dasar|menengah|ahli|<1 thn|\\d+.*thn)$/i.test(text)) return text;
        }
      }
      let anchor = el;
      for (let depth = 0; anchor && depth < 5; depth += 1, anchor = anchor.parentElement) {
        let sibling = anchor.previousElementSibling;
        for (let index = 0; sibling && index < 8; index += 1, sibling = sibling.previousElementSibling) {
          const text = normalize(sibling.innerText || sibling.textContent || '');
          if (questionGroupCount(sibling) === 0 && text.length >= 4 && text.length <= 500 && questionSignal.test(text)) return text;
        }
      }
      let best = '';
      let node = el.type === 'radio' ? el.closest('label')?.parentElement || el.parentElement : el.parentElement;
      let currencyContext = '';
      for (let depth = 0; node && depth < 12; depth += 1) {
        const text = normalize(node.innerText || node.textContent || '');
        const ownsSingleQuestion = questionGroupCount(node) <= 1;
        if (ownsSingleQuestion && !currencyContext && text.length <= 350 && /(?:^|\\s)(?:rp\\.?|idr|usd|\\$)(?:\\s|$)/i.test(text)) currencyContext = 'expected salary ' + text;
        if (ownsSingleQuestion && text.length >= 4 && text.length <= 1400 && questionSignal.test(text)) {
          if (!best || text.length < best.length) best = text;
        }
        node = node.parentElement || node.getRootNode?.()?.host?.parentElement;
      }
      return best || currencyContext || directLabel || normalize([el.getAttribute('name'), el.id].filter(Boolean).join(' '));
    };
    const setValue = (el, value) => {
      if (value === undefined || value === null || value === '' || !visible(el)) return false;
      el.focus();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      events.forEach((type) => el.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    const patternsForAnswer = (value) => {
      const normalized = lower(value);
      if (/no experience|none|tidak ada|belum/.test(normalized)) return [/no experience|none|tidak ada|tidak berpengalaman|belum|0 year/i];
      if (/less|under|<\\s*1|kurang/.test(normalized)) return [/less than 1|under 1|<\\s*1|kurang dari 1/i, /no experience|0 year/i];
      if (/1\\s*[-–]\\s*3/.test(normalized)) return [/1\\s*[-–]\\s*3/i, /^1 year|1 tahun/i, /^2 years|2 tahun/i];
      if (/immediate|segera|langsung/.test(normalized)) return [/immediate|segera|no notice|0 day/i];
      if (/2\\s*week|14/.test(normalized)) return [/2 weeks|14 days|2 minggu/i];
      if (/1\\s*month|30/.test(normalized)) return [/1 month|30 days|1 bulan|4 weeks/i];
      if (/2\\s*month|60/.test(normalized)) return [/2 months|60 days|2 bulan|8 weeks/i];
      if (/bachelor|s1|sarjana/.test(normalized)) return [/bachelor|sarjana|\\bs1\\b|undergraduate/i];
      if (/^basic$/.test(normalized)) return [/basic|dasar/i];
      if (/^intermediate$/.test(normalized)) return [/intermediate|menengah/i];
      if (/^advanced$/.test(normalized)) return [/advanced|ahli|mahir/i];
      if (/conversational|menengah/.test(normalized)) return [/conversational|menengah|intermediate/i];
      if (/professional/.test(normalized)) return [/professional|business/i];
      return [new RegExp(normalized.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'i')];
    };
    const moneyValue = (value) => {
      const text = lower(value).replace(/,/g, '.');
      const number = Number(text.replace(/[^0-9.]/g, '').replace(/\\.(?=.*\\.)/g, '')) || 0;
      if (/million|juta|\\bjt\\b/.test(text) && number < 1000) return number * 1000000;
      return number;
    };
    const chooseOption = (select, context) => {
      const key = classifyApplicationQuestion(context);
      const desired = answerForApplicationQuestion(context, answers, 'select');
      const options = Array.from(select.options || []).filter((option) => option.value && !/please select|pilih|choose|select an option/i.test(option.textContent || option.value));
      let chosen = null;
      if (key === 'expectedSalary') {
        const target = moneyValue(desired);
        chosen = options.map((option) => ({ option, distance: Math.abs(moneyValue(option.textContent || option.value) - target) }))
          .filter((item) => moneyValue(item.option.textContent || item.option.value) > 0)
          .sort((a, b) => a.distance - b.distance)[0]?.option;
      }
      if (!chosen) {
        const patterns = patternsForAnswer(desired);
        chosen = options.find((option) => patterns.some((pattern) => pattern.test(option.textContent || option.value || '')));
      }
      chosen ||= options[0];
      if (!chosen) return false;
      select.value = chosen.value;
      events.forEach((type) => select.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    const skillLevelFor = (context) => {
      const text = lower(context);
      if (/react|javascript|typescript|php|laravel|html|css|mysql|full.?stack|front.?end/.test(text)) return answers.primarySkillLevel;
      if (/node|postgres|sql|git|tailwind|bootstrap|api/.test(text)) return answers.secondarySkillLevel;
      return answers.outOfPortfolioSkillLevel;
    };
    const chooseRadio = (group) => {
      const context = questionText(group[0]);
      const key = classifyApplicationQuestion(context);
      let desired = answerForApplicationQuestion(context, answers, 'radio');
      const optionLabels = group.map(optionText);
      if (/WORK_EXPERIENCE_DURATION/i.test(group[0].name || '')) desired = answers.fullstackExperience;
      if (optionLabels.some((text) => /basic|intermediate|advanced|no experience/i.test(text))) desired = skillLevelFor(context);
      const patterns = patternsForAnswer(desired);
      const yes = /^(yes|ya|true|available|eligible)/i.test(desired);
      const no = /^(no|tidak|false|not|belum)/i.test(desired);
      const chosen =
        group.find((item) => patterns.some((pattern) => pattern.test(optionText(item)))) ||
        group.find((item) => yes && /^(yes|ya)$/i.test(optionText(item))) ||
        group.find((item) => no && /no|tidak|none|belum/i.test(optionText(item))) ||
        group.find((item) => !/no|tidak|none/i.test(optionText(item))) ||
        group[0];
      if (!chosen) return false;
      chosen.click();
      events.forEach((type) => chosen.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    let filled = 0;
    for (const textarea of deepQueryAll('textarea').filter(visible)) {
      const context = questionText(textarea);
      const value = answerForApplicationQuestion(context, answers, 'textarea');
      if (setValue(textarea, value)) filled++;
    }
    for (const input of deepQueryAll('input').filter((el) => visible(el) && ['text','number','tel','search','email',''].includes((el.type || '').toLowerCase()))) {
      const context = questionText(input);
      const answerKey = classifyApplicationQuestion(context);
      const fallbackHasQuestion = /\\?|\\s/.test(context) && !genericFieldHint(context);
      if (answerKey === 'fallbackScreeningAnswer' && (!fallbackHasQuestion || input.type === 'number')) continue;
      const expectsYears = /Experience$/.test(answerKey) && /year|tahun|berapa lama/.test(context);
      let value = answerForApplicationQuestion(context, answers, input.type === 'number' || expectsYears ? 'number' : 'text');
      if (answerKey === 'expectedSalary') value = String(value).replace(/\\D/g, '');
      if (setValue(input, value)) filled++;
    }
    for (const select of deepQueryAll('select').filter(visible)) {
      if (chooseOption(select, questionText(select))) filled++;
    }
    const radioGroups = new Map();
    for (const radio of deepQueryAll('input[type="radio"]').filter(visible)) {
      const name = String(roots().indexOf(rootFor(radio))) + ':' + (radio.name || radio.getAttribute('aria-label') || radio.id || Math.random().toString(36));
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(radio);
    }
    for (const group of radioGroups.values()) {
      if (!group.some((item) => item.checked) && chooseRadio(group)) filled++;
    }
    const databases = lower(answers.databases).split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
    const versionTools = lower(answers.versionControlTools).split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
    for (const checkbox of deepQueryAll('input[type="checkbox"]').filter(visible)) {
      const text = lower(optionText(checkbox));
      const context = lower(questionText(checkbox));
      const selectedSkill = [...databases, ...versionTools, 'javascript', 'typescript', 'php', 'html', 'css', 'react.js', 'react', 'laravel', 'node.js', 'node', 'mysql']
        .some((item) => text === item || text.includes(item));
      const requiredConsent = checkbox.required && /agree|consent|privacy|terms|setuju|persetujuan/.test(context + ' ' + text);
      if (!/newsletter|marketing|promosi|job alert/i.test(text) && (selectedSkill || requiredConsent) && !checkbox.checked) {
        checkbox.click();
        events.forEach((type) => checkbox.dispatchEvent(new Event(type, { bubbles: true })));
        filled++;
      }
    }
    return { filled };
  })(${payload})`;
  const output = runBrowserAct(["--session", sessionName, "eval", script], { timeout: ACTION_TIMEOUT_MS });
  const match = output.match(/filled['"]?:\s*(\d+)|filled:\s*(\d+)/);
  return Number(match?.[1] || match?.[2] || 0);
}

function discoverApplicationQuestions(sessionName) {
  const script = `(() => {
    const normalize = (value) => String(value || '').replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot);
      }
    }
    const visible = (el) => !!(el && !el.disabled && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const allDeep = (selector) => Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(selector)))));
    const activeDialogs = allDeep('[role="dialog"],[aria-modal="true"],[class*="ModalContainer"],[class*="ApplicationModalContainer"]').filter(visible);
    const fields = allDeep('input,textarea,select,[role="radio"],[role="checkbox"]')
      .filter((element) => !activeDialogs.length || activeDialogs.some((dialog) => dialog.contains(element)));
    const genericFieldHint = (value) => /^(?:(?:type|enter|write|input|masukkan|ketik|isi)\\s+)?(?:your\\s+)?(?:answer|response|jawaban)(?:\\s+(?:here|di sini))?[\\s*.:_-]*$/i.test(normalize(value));
    const questionSignal = /\\?|experience|pengalaman|salary|gaji|upah|kompensasi|compensation|remuneration|pay|ekspektasi|penghasilan|pendapatan|proficiency|kemahiran|notice|education|degree|qualification/i;
    const questionGroupCount = (node) => new Set(
      Array.from(node?.querySelectorAll?.('input:not([type="hidden"]),textarea,select') || [])
        .map((field) => field.type === 'radio' ? 'radio:' + (field.name || field.id) : field)
    ).size;
    const questionFor = (el) => {
      const root = el.getRootNode?.() || document;
      let linkedLabel = null;
      try { linkedLabel = el.id ? root.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null; } catch {}
      const referencedText = (attribute) => normalize(
        String(el.getAttribute(attribute) || '')
          .split(/\\s+/)
          .map((id) => {
            try { return root.getElementById?.(id)?.innerText || root.querySelector?.('#' + CSS.escape(id))?.textContent || ''; } catch { return ''; }
          })
          .join(' ')
      );
      const placeholder = normalize(el.getAttribute('placeholder'));
      const directLabel = normalize([
        linkedLabel?.innerText,
        el.closest('label')?.innerText,
        referencedText('aria-labelledby'),
        referencedText('aria-describedby'),
        el.getAttribute('aria-label'),
        genericFieldHint(placeholder) ? '' : placeholder,
      ].filter(Boolean).join(' '));
      const isShortOption = el.type === 'radio' || /^(yes|no|ya|tidak|none|basic|intermediate|advanced)$/i.test(directLabel);
      if (directLabel && !isShortOption && !genericFieldHint(directLabel)) return directLabel.slice(0, 500);
      if (el.type === 'radio') {
        let sibling = el.closest('label')?.previousSibling;
        for (let index = 0; sibling && index < 10; index += 1, sibling = sibling.previousSibling) {
          const text = normalize(sibling.innerText || sibling.textContent || '');
          if (text && !/^(yes|no|ya|tidak|none|tidak berpengalaman|dasar|menengah|ahli|<1 thn|\\d+.*thn)$/i.test(text)) return text.slice(0, 500);
        }
      }
      let anchor = el;
      for (let depth = 0; anchor && depth < 5; depth += 1, anchor = anchor.parentElement) {
        let sibling = anchor.previousElementSibling;
        for (let index = 0; sibling && index < 8; index += 1, sibling = sibling.previousElementSibling) {
          const text = normalize(sibling.innerText || sibling.textContent || '');
          if (questionGroupCount(sibling) === 0 && text.length >= 4 && text.length <= 500 && questionSignal.test(text)) return text.slice(0, 500);
        }
      }
      let best = '';
      let node = el.type === 'radio' ? el.closest('label')?.parentElement || el.parentElement : el.parentElement;
      let currencyContext = '';
      for (let depth = 0; node && depth < 12; depth += 1) {
        const text = normalize(node.innerText || node.textContent || '');
        const ownsSingleQuestion = questionGroupCount(node) <= 1;
        if (ownsSingleQuestion && !currencyContext && text.length <= 350 && /(?:^|\\s)(?:rp\\.?|idr|usd|\\$)(?:\\s|$)/i.test(text)) currencyContext = 'expected salary ' + text;
        if (ownsSingleQuestion && text.length >= 4 && text.length <= 1400 && questionSignal.test(text)) {
          if (!best || text.length < best.length) best = text;
        }
        node = node.parentElement || node.getRootNode?.()?.host?.parentElement;
      }
      return (best || currencyContext || directLabel || normalize([el.getAttribute('name'), el.id].filter(Boolean).join(' '))).slice(0, 500);
    };
    const seen = new Set();
    const questions = [];
    for (const field of fields.filter(visible)) {
      const question = questionFor(field);
      const key = question.toLowerCase();
      if (!question || question.length < 4 || seen.has(key) || /search|cari lowongan|keyword|filter/i.test(question)) continue;
      seen.add(key);
      questions.push({ question, type: lowerType(field) });
      if (questions.length >= 50) break;
    }
    function lowerType(field) {
      return String(field.getAttribute('role') || field.type || field.tagName || 'field').toLowerCase();
    }
    return '__AUTO_QUESTIONS__' + JSON.stringify(questions);
  })()`;
  const output = runBrowserAct(["--session", sessionName, "eval", script], { timeout: ACTION_TIMEOUT_MS });
  const marker = "__AUTO_QUESTIONS__";
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0) return [];
  const payload = output.slice(markerIndex + marker.length);
  const start = payload.indexOf("[");
  const end = payload.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  const json = payload.slice(start, end + 1).replace(/\\"/g, '"');
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function discoverAndRecordQuestions(sessionName, job) {
  try {
    const questions = discoverApplicationQuestions(sessionName);
    if (questions.length) recordAutoApplyQuestions(job, questions);
    return questions.length;
  } catch {
    return 0;
  }
}

function uploadCvIfPresent(sessionName, cvPath, currentMarkdown = "") {
  if (!cvPath) return { uploaded: false, reason: "CV path empty" };
  if (!fs.existsSync(cvPath)) return { uploaded: false, reason: `CV file not found: ${cvPath}` };
  if (!fs.statSync(cvPath).isFile()) return { uploaded: false, reason: `CV path is not a file: ${cvPath}` };

  const fileName = String(cvPath).split(/[\\/]/).at(-1) || "";
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyAttached =
    (escapedFileName && new RegExp(escapedFileName, "i").test(currentMarkdown)) ||
    /(?:uploaded|diupload|terunggah|attached).{0,80}(?:pdf|resume|cv)|(?:pdf|resume|cv).{0,80}(?:uploaded|diupload|terunggah|attached)|hapus file|remove file/i.test(
      currentMarkdown
    );

  if (alreadyAttached) {
    return { uploaded: false, attached: true, reason: `Using attached CV${fileName ? `: ${fileName}` : ""}` };
  }

  const stateText = runBrowserAct(["--session", sessionName, "state"], { timeout: READ_TIMEOUT_MS });
  const fileIndex =
    findElementIndex(stateText, /<input\b[^>]*type=['"]?file|resume|curriculum|cv|upload|unggah/i) ||
    findElementIndex(stateText, /file/i);

  if (!fileIndex) {
    return { uploaded: false, reason: "File input not found" };
  }

  runBrowserAct(["--session", sessionName, "upload", String(fileIndex), cvPath], { timeout: ACTION_TIMEOUT_MS });
  waitAfterAction(sessionName);
  return { uploaded: true, attached: true, index: fileIndex };
}

function runJobStreetStep(sessionName, answerBank, job, { advance = true } = {}) {
  const payload = JSON.stringify({ ...buildAnswerPayload(answerBank, job), __advance: advance });
  const script = `((answers) => {
    const events = ['input', 'change', 'blur'];
    const normalize = (value) => String(value || '').replace(/[\\u200b\\u200c\\u200d\\u2060\\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    const lower = (value) => normalize(value).toLowerCase();
    const visible = (el) => !!(el && !el.disabled && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const setValue = (el, value) => {
      if (!el || !visible(el)) return false;
      el.focus();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      events.forEach((type) => el.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    const patternsForAnswer = (value) => {
      const normalized = lower(value);
      if (/s1|bachelor|sarjana/.test(normalized)) return ['\\\\bS1\\\\b', 'Bachelor', 'Sarjana', 'Undergraduate'];
      if (/d4|diploma 4/.test(normalized)) return ['Diploma 4', '\\\\bD4\\\\b'];
      if (/d3|diploma 3/.test(normalized)) return ['Diploma 3', '\\\\bD3\\\\b'];
      if (/immediate|segera|now|langsung/.test(normalized)) return ['Immediately', 'No notice period', 'Available immediately', 'Tidak perlu notice', '0'];
      if (/1\\s*month|one month|30/.test(normalized)) return ['1 month', '30 days', '4 weeks'];
      if (/2\\s*week|14/.test(normalized)) return ['2 weeks', '14 days'];
      if (/less|<|under|kurang/.test(normalized)) return ['^Less than 1 year$', '^Kurang dari 1 tahun$', '^< 1 year$', '^0 years?$', '^No experience$'];
      if (/1\\s*[-–]\\s*3|1-3|1 year|1 tahun/.test(normalized)) return ['^1 year$', '^1 tahun$', '1-3', '^2 years?$'];
      if (/2/.test(normalized)) return ['^2 years?$', '^2 tahun$', '^1 year$'];
      if (/3/.test(normalized)) return ['^3 years?$', '^3 tahun$', '^2 years?$'];
      return [value].filter(Boolean);
    };
    const selectOption = (select, patterns) => {
      const options = Array.from(select.options || []);
      const ranked = [];
      patterns.forEach((pattern, patternIndex) => {
        const regex = new RegExp(pattern, 'i');
        options.forEach((option, optionIndex) => {
          const text = option.textContent || option.value || '';
          if (regex.test(text)) ranked.push({ option, score: 1000 - patternIndex * 50 - optionIndex });
        });
      });
      const chosen =
        ranked.sort((a, b) => b.score - a.score)[0]?.option ||
        options.find((option) => option.value && !/please select|select a|pilih|choose/i.test(option.textContent || option.value || '')) ||
        options.find((option) => option.value) ||
        options[1];
      if (!chosen) return false;
      select.value = chosen.value;
      events.forEach((type) => select.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    const selectNearestSalary = (select, value) => {
      const targetDigits = Number(String(value || '').replace(/\\D/g, '')) || 0;
      const targetMillions = targetDigits >= 1000000 ? targetDigits / 1000000 : targetDigits;
      const candidates = Array.from(select.options || [])
        .filter((option) => option.value)
        .map((option) => ({ option, amount: Number(String(option.textContent || option.value).replace(',', '.').match(/\\d+(?:\\.\\d+)?/)?.[0] || 0) }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => Math.abs(a.amount - targetMillions) - Math.abs(b.amount - targetMillions));
      const chosen = candidates[0]?.option;
      if (!chosen) return false;
      select.value = chosen.value;
      events.forEach((type) => select.dispatchEvent(new Event(type, { bubbles: true })));
      return true;
    };
    const optionText = (input) => {
      const forLabel = input.id ? document.querySelector('label[for="' + CSS.escape(input.id) + '"]') : null;
      const label = input.closest('label') || forLabel || input.parentElement;
      return normalize(label?.innerText || label?.textContent || input.value || input.getAttribute('aria-label') || '');
    };
    const questionText = (input) => {
      let node = input.parentElement;
      while (node && node !== document.body) {
        const text = normalize(node.innerText || node.textContent || '');
        if (
          text.length > 10 &&
          text.length < 1200 &&
          /\\?|salary|gaji|qualification|kualifikasi|experience|pengalaman|database|revision control|version control|notice|availability/i.test(text)
        ) return text;
        node = node.parentElement;
      }
      return normalize(input.closest('form, main, section')?.innerText || document.body?.innerText || '');
    };
    const answerLooksYes = (value) => /^(yes|ya|true|available|eligible)/i.test(normalize(value));
    const answerLooksNo = (value) => /^(no|tidak|false|not|belum)/i.test(normalize(value));
    const radioGroupKey = (input) => input.name || input.closest('[role="radiogroup"], fieldset, div') || input.id || input;
    const answerRadioGroups = () => {
      const groups = new Map();
      for (const input of Array.from(document.querySelectorAll('input[type="radio"]')).filter(visible)) {
        const key = radioGroupKey(input);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
      }

      let clicked = 0;
      for (const group of groups.values()) {
        if (group.some((input) => input.checked)) continue;
        const context = lower(questionText(group[0]));
        let desired = 'Yes';
        if (/scrum|agile/.test(context)) desired = answers.scrumAgileExperience;
        else if (/insurance|asuransi/.test(context)) desired = answers.insuranceExperience;
        else if (/chatbot|chat bot/.test(context)) desired = answers.chatbotExperience;
        else if (/currently employed|current employer|sedang bekerja/.test(context)) desired = /not currently/i.test(answers.currentEmploymentStatus) ? 'No' : 'Yes';
        else if (/eligible|eligibility|legally|work in indonesia|hak bekerja/.test(context)) desired = answers.workEligibility;
        else if (/onsite|on-site|work from office|wfo|hybrid|relocate|location|penempatan/.test(context)) desired = answers.onsiteAvailability;
        else if (/overtime|shift|weekend|public holiday|lembur|akhir pekan/.test(context)) desired = 'Yes';

        const wantsYes = answerLooksYes(desired);
        const wantsNo = answerLooksNo(desired);
        const picked =
          group.find((input) => wantsYes && /^(yes|ya)$/i.test(optionText(input))) ||
          group.find((input) => wantsNo && /^(no|tidak)$/i.test(optionText(input))) ||
          group.find((input) => wantsYes && !/^(no|tidak)$/i.test(optionText(input))) ||
          group.find((input) => wantsNo && /no|tidak|none|belum/i.test(optionText(input))) ||
          group[0];

        if (picked) {
          picked.click();
          events.forEach((type) => picked.dispatchEvent(new Event(type, { bubbles: true })));
          clicked++;
        }
      }
      return clicked;
    };
    const clickCheckbox = (patterns) => {
      let clicked = 0;
      for (const input of Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(visible)) {
        const text = optionText(input);
        if (patterns.some((pattern) => new RegExp('^' + pattern + '$', 'i').test(text)) && !input.checked) {
          input.click();
          events.forEach((type) => input.dispatchEvent(new Event(type, { bubbles: true })));
          clicked++;
        }
      }
      return clicked;
    };
    const checkboxGroupKey = (input) => {
      let node = input.parentElement;
      while (node && node !== document.body) {
        const count = node.querySelectorAll('input[type="checkbox"]').length;
        if (count > 1 && count <= 30) return node;
        node = node.parentElement;
      }
      return input.name || input.id || input;
    };
    const ensureEveryCheckboxGroupAnswered = () => {
      const groups = new Map();
      for (const input of Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(visible)) {
        const key = checkboxGroupKey(input);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(input);
      }
      let clicked = 0;
      for (const group of groups.values()) {
        if (group.some((input) => input.checked)) continue;
        const picked =
          group.find((input) => /javascript|typescript|php|html|css|react|bootstrap|sass|node|mysql|postgres|sql/i.test(optionText(input))) ||
          group.find((input) => !/none of these|tidak ada|none/i.test(optionText(input))) ||
          group[0];
        if (picked && !picked.checked) {
          picked.click();
          events.forEach((type) => picked.dispatchEvent(new Event(type, { bubbles: true })));
          clicked++;
        }
      }
      return clicked;
    };
    const clickButton = (labels) => {
      window.scrollTo(0, document.body.scrollHeight);
      const selectors = 'button,a,[role="button"],input[type="submit"],span,div';
      const interactiveTarget = (item) =>
        item.matches('button,a,[role="button"],input[type="submit"]')
          ? item
          : item.closest('button,a,[role="button"],input[type="submit"]') ||
            item.querySelector?.('button,a,[role="button"],input[type="submit"]') ||
            item;
      const labelsLower = labels.map((label) => lower(label));
      const isActionText = (text) => {
        const value = lower(text);
        return labelsLower.some((label) => value === label || value === lower(label + ' ' + label));
      };
      const clickTarget = (target, text) => {
        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return { clicked: true, text, url: location.href };
      };
      const exactAction = Array.from(document.querySelectorAll(selectors))
        .map((item) => {
          const target = interactiveTarget(item);
          const text = normalize([item.innerText, item.textContent, item.value, item.getAttribute('aria-label')].filter(Boolean).join(' '));
          return { item, target, text };
        })
        .filter(({ target, text }) => target && text && text.length <= 80 && isActionText(text) && visible(target) && !target.disabled)
        .sort((a, b) => {
          const aInteractive = a.target.matches('button,a,[role="button"],input[type="submit"]') ? 1 : 0;
          const bInteractive = b.target.matches('button,a,[role="button"],input[type="submit"]') ? 1 : 0;
          return bInteractive - aInteractive || b.target.getBoundingClientRect().top - a.target.getBoundingClientRect().top;
        })[0];

      if (exactAction) {
        return clickTarget(exactAction.target, exactAction.text);
      }

      const buttons = Array.from(document.querySelectorAll(selectors))
        .map((item) => ({
          button: interactiveTarget(item),
          source: item,
        }))
        .filter(({ button }) => button && visible(button) && !button.disabled);
      const stepTab = (text) => {
        const value = lower(text);
        return [
          'choose documents',
          'choose documents choose documents',
          'answer employer questions',
          'answer employer questions answer employer questions',
          'update jobstreet profile',
          'update jobstreet profile update jobstreet profile',
          'review and submit',
          'review and submit review and submit',
        ].includes(value);
      };
      const ranked = buttons
        .map(({ button, source }) => {
          const text = normalize([source.innerText, source.textContent, button.value, button.getAttribute('aria-label')].filter(Boolean).join(' '));
          const exactIndex = labels.findIndex((label) => lower(text) === lower(label) || lower(text) === lower(label + ' ' + label));
          const includesIndex = labels.findIndex((label) => lower(text).includes(lower(label)));
          const isShortAction = text.length <= 120;
          const bottomBonus = Math.max(0, Math.round(button.getBoundingClientRect().top / 100));
          return { button, text, rank: exactIndex >= 0 ? 100 - exactIndex + bottomBonus : includesIndex >= 0 && isShortAction ? 50 - includesIndex + bottomBonus : -1 };
        })
        .filter((item) => item.rank >= 0)
        .filter((item) => !stepTab(item.text))
        .sort((a, b) => b.rank - a.rank || a.text.length - b.text.length);
      const target = ranked[0]?.button;
      if (!target) return { clicked: false, labels, candidates: buttons.map(({ button, source }) => normalize(source.innerText || source.textContent || button.value || button.getAttribute('aria-label'))).slice(0, 20) };
      return clickTarget(target, ranked[0].text);
    };

    let filled = 0;
    const path = location.pathname;
    const markdownish = normalize(document.body?.innerText || '');

    if (/\\/apply\\/?$/i.test(path)) {
      for (const select of Array.from(document.querySelectorAll('select')).filter(visible)) {
        if (selectOption(select, ['Tirta\\\\.pdf', 'Tirta'])) filled++;
      }
      for (const textarea of Array.from(document.querySelectorAll('textarea')).filter(visible)) {
        if (setValue(textarea, answers.coverNote)) filled++;
      }
      return { stage: 'documents', filled, action: answers.__advance ? clickButton(['Continue', 'Next', 'Selanjutnya', 'Lanjut']) : { clicked: false, text: 'audit-only' } };
    }

    if (/role-requirements/i.test(path)) {
      const selects = Array.from(document.querySelectorAll('select')).filter(visible);
      selects.forEach((select) => {
        const context = lower(questionText(select));
        if (/salary|gaji/.test(context)) {
          if (selectNearestSalary(select, answers.expectedSalary)) filled++;
        } else if (/notice|current employer|give your current|availability|available|kapan/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.noticePeriod))) filled++;
        } else if (/qualification|qualifications|pendidikan/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.educationLevel))) filled++;
        } else if (/sql/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.sqlExperience))) filled++;
        } else if (/rdbms|database|mysql|postgres|postgresql|relational/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.rdbmsExperience))) filled++;
        } else if (/react/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.reactExperience))) filled++;
        } else if (/javascript|typescript/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.javascriptExperience))) filled++;
        } else if (/laravel/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.laravelExperience))) filled++;
        } else if (/php/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.phpExperience))) filled++;
        } else if (/node/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.nodeExperience))) filled++;
        } else if (/experience|pengalaman/.test(context)) {
          if (selectOption(select, patternsForAnswer(answers.fullstackExperience))) filled++;
        }
      });

      filled += answerRadioGroups();
      const configuredCheckboxes = [answers.databases, answers.versionControlTools, 'JavaScript, PHP, HTML, CSS, React.js, Laravel, Node.js']
        .join(',')
        .split(/[,;]+/)
        .map((item) => normalize(item))
        .filter(Boolean)
        .map((item) => item.replace(/[.*+?^$()|[\]\\]/g, '\\\\$&'));
      filled += clickCheckbox(configuredCheckboxes);
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(visible);
      const checkboxGroups = new Map();
      checkboxes.forEach((input) => {
        const key = checkboxGroupKey(input);
        if (!checkboxGroups.has(key)) checkboxGroups.set(key, []);
        checkboxGroups.get(key).push(input);
      });
      for (const group of checkboxGroups.values()) {
        const hasRealSelection = group.some((input) => input.checked && !/none of these|tidak satupun|tidak ada|^none$/i.test(optionText(input)));
        if (hasRealSelection) {
          group.filter((input) => input.checked && /none of these|tidak satupun|tidak ada|^none$/i.test(optionText(input))).forEach((input) => {
            input.click();
            events.forEach((type) => input.dispatchEvent(new Event(type, { bubbles: true })));
          });
        }
      }
      filled += ensureEveryCheckboxGroupAnswered();
      return { stage: 'questions', filled, action: answers.__advance ? clickButton(['Continue', 'Next', 'Selanjutnya', 'Lanjut', 'Review and submit']) : { clicked: false, text: 'audit-only' } };
    }

    if (/review/i.test(path)) {
      return { stage: 'review', filled, action: clickButton(['Submit application', 'Send application', 'Kirim lamaran', 'Submit', 'Send', 'Kirim']) };
    }

    if (/profile/i.test(path) || /update jobstreet profile/i.test(markdownish)) {
      return { stage: 'profile', filled, action: clickButton(['Continue', 'Next', 'Selanjutnya', 'Lanjut']) };
    }

    return { stage: 'unknown', filled, action: clickButton(['Continue', 'Next', 'Submit application', 'Send application', 'Kirim lamaran']) };
  })(${payload})`;
  return clean(runBrowserAct(["--session", sessionName, "eval", script], { timeout: ACTION_TIMEOUT_MS }));
}

function submitJobStreetApplicationForm(sessionName, answerBank, job) {
  const steps = [];
  const applyUrl = `${String(job.jobUrl || "").replace(/\/+$/, "")}/apply`;

  for (let step = 1; step <= 8; step += 1) {
    let currentLocation = readLocation(sessionName);
    let beforeMarkdown = "";
    if (!/\/apply\b/i.test(currentLocation) && /jobstreet\./i.test(currentLocation) && applyUrl) {
      patchAutoApplyRun(
        {
          phase: "jobstreet_open_apply",
          currentStep: step,
          currentStepTotal: 8,
          currentStage: detectJobStreetStage(currentLocation, ""),
          currentUrl: shortUrl(currentLocation),
          lastAction: "Navigating to JobStreet apply URL",
          waitStatus: "opening_apply",
        },
        "JobStreet apply URL opened.",
        { jobId: job.id, from: shortUrl(currentLocation), to: shortUrl(applyUrl) }
      );
      runBrowserAct(["--session", sessionName, "navigate", applyUrl], { timeout: ACTION_TIMEOUT_MS });
      const openTransition = waitForJobStreetProgress(sessionName, currentLocation, "", { timeout: STEP_WAIT_TIMEOUT_MS });
      currentLocation = openTransition.location;
      beforeMarkdown = openTransition.markdown;
      patchAutoApplyRun(
        {
          currentStage: openTransition.stage,
          currentUrl: shortUrl(openTransition.location),
          lastAction: openTransition.progressed ? `Loaded ${openTransition.stage}` : "Waiting for apply page timed out",
          waitStatus: openTransition.progressed ? `changed after ${openTransition.waitedMs}ms` : `no change after ${openTransition.waitedMs}ms`,
        },
        "JobStreet apply URL load checked.",
        {
          jobId: job.id,
          fromStage: openTransition.beforeStage,
          toStage: openTransition.stage,
          waitedMs: openTransition.waitedMs,
          progressed: openTransition.progressed,
        }
      );
    }

    if (!beforeMarkdown) beforeMarkdown = readMarkdown(sessionName);
    const currentStage = detectJobStreetStage(currentLocation, beforeMarkdown);
    patchAutoApplyRun(
      {
        phase: "jobstreet_form",
        currentStep: step,
        currentStepTotal: 8,
        currentStage,
        currentUrl: shortUrl(currentLocation),
        lastAction: "Reading JobStreet form step",
        waitStatus: "ready",
        fieldsFilled: 0,
      },
      "JobStreet form step detected.",
      { jobId: job.id, step, stage: currentStage, url: shortUrl(currentLocation) }
    );

    if (hasSuccessSignal(`${beforeMarkdown}\n${currentLocation}`)) {
      patchAutoApplyRun(
        {
          phase: "submitted",
          currentStage: "success",
          currentUrl: shortUrl(currentLocation),
          lastAction: "Application success detected",
          waitStatus: "complete",
        },
        "JobStreet submitted signal detected.",
        { jobId: job.id, step, url: shortUrl(currentLocation) }
      );
      return {
        submitted: true,
        needsConfirmation: false,
        filled: steps.length,
        upload: { uploaded: false, reason: "Used saved JobStreet resume" },
        message: "Application submitted successfully.",
      };
    }

    if (hasBlockerSignal(beforeMarkdown)) {
      patchAutoApplyRun(
        {
          phase: "blocked",
          currentStage,
          currentUrl: shortUrl(currentLocation),
          lastAction: "Login or verification blocker detected",
          waitStatus: "blocked",
        },
        "JobStreet blocker detected.",
        { jobId: job.id, step, stage: currentStage, url: shortUrl(currentLocation) }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: steps.length,
        upload: { uploaded: false, reason: "Blocked by login/verification" },
        message: "Login/verification required during submit.",
      };
    }

    discoverAndRecordQuestions(sessionName, job);
    const result = runJobStreetStep(sessionName, answerBank, job);
    const stepSummary = summarizeStepResult(result);
    steps.push(`${step}:${currentLocation}:${result}`);
    patchAutoApplyRun(
      {
        phase: "jobstreet_form",
        currentStep: step,
        currentStepTotal: 8,
        currentStage: stepSummary.stage || currentStage,
        currentUrl: shortUrl(currentLocation),
        lastAction: stepSummary.actionText ? `Clicked ${stepSummary.actionText}` : "Clicked next/submit action",
        waitStatus: "waiting_for_page_change",
        fieldsFilled: stepSummary.filled,
        lastStepResult: stepSummary.raw,
      },
      "JobStreet form action executed.",
      {
        jobId: job.id,
        step,
        stage: stepSummary.stage || currentStage,
        filled: stepSummary.filled,
        clicked: stepSummary.clicked,
        action: stepSummary.actionText,
      }
    );

    if (!truthyBrowserOutput(result)) {
      patchAutoApplyRun(
        {
          phase: "needs_review",
          currentStage: stepSummary.stage || currentStage,
          currentUrl: shortUrl(currentLocation),
          lastAction: "Next/submit button not found",
          waitStatus: "needs_manual_review",
        },
        "JobStreet step button not found.",
        { jobId: job.id, step, stage: stepSummary.stage || currentStage, result: stepSummary.raw }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: steps.length,
        upload: { uploaded: false, reason: "Used saved JobStreet resume" },
        message: `JobStreet step button not found. Last step: ${result}`,
      };
    }

    const transition = waitForJobStreetProgress(sessionName, currentLocation, beforeMarkdown, { timeout: STEP_WAIT_TIMEOUT_MS });
    const afterMarkdown = transition.markdown;
    const afterLocation = transition.location;
    patchAutoApplyRun(
      {
        phase: "jobstreet_form",
        currentStep: step,
        currentStepTotal: 8,
        currentStage: transition.stage,
        currentUrl: shortUrl(afterLocation),
        lastAction: transition.progressed ? `Moved to ${transition.stage}` : "Waiting for next step timed out",
        waitStatus: transition.validationFailed
          ? "validation_blocked"
          : transition.progressed
            ? `changed after ${transition.waitedMs}ms`
            : `no change after ${transition.waitedMs}ms`,
      },
      "JobStreet form transition checked.",
      {
        jobId: job.id,
        step,
        fromStage: transition.beforeStage,
        toStage: transition.stage,
        waitedMs: transition.waitedMs,
        progressed: transition.progressed,
        validationFailed: transition.validationFailed,
      }
    );

    if (hasSuccessSignal(`${afterMarkdown}\n${afterLocation}`)) {
      patchAutoApplyRun(
        {
          phase: "submitted",
          currentStage: "success",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Application submitted",
          waitStatus: "complete",
        },
        "JobStreet application submitted.",
        { jobId: job.id, step, waitedMs: transition.waitedMs }
      );
      return {
        submitted: true,
        needsConfirmation: false,
        filled: steps.length,
        upload: { uploaded: false, reason: "Used saved JobStreet resume" },
        message: "Application submitted successfully.",
      };
    }

    if (transition.validationFailed) {
      patchAutoApplyRun(
        {
          phase: "validation_blocked",
          currentStage: transition.stage,
          currentUrl: shortUrl(afterLocation),
          lastAction: "Validation blocked next step",
          waitStatus: "validation_blocked",
        },
        "JobStreet validation blocked progress.",
        { jobId: job.id, step, stage: transition.stage, result: stepSummary.raw }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: steps.length,
        upload: { uploaded: false, reason: "Used saved JobStreet resume" },
        message: `JobStreet validation blocked progress on ${transition.stage}. Last step: ${result}`,
      };
    }
  }

  patchAutoApplyRun(
    {
      phase: "needs_review",
      currentStep: 8,
      currentStepTotal: 8,
      lastAction: "JobStreet step limit reached",
      waitStatus: "needs_manual_review",
    },
    "JobStreet step limit reached.",
    { jobId: job.id, steps: steps.slice(-4) }
  );

  return {
    submitted: false,
    needsConfirmation: true,
    filled: steps.length,
    upload: { uploaded: false, reason: "Used saved JobStreet resume" },
    message: `JobStreet flow reached step limit. Steps: ${steps.join(" | ")}`,
  };
}

function clickButtonWithDom(sessionName, patternSource) {
  const script = `(() => {
    const pattern = new RegExp(${JSON.stringify(patternSource)}, 'i');
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot);
      }
    }
    const deepQueryAll = (selector) => Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(selector)))));
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const textOf = (item) => [item.innerText, item.textContent, item.value, item.getAttribute('aria-label'), item.href]
      .filter(Boolean)
      .join(' ')
      .replace(/[\\u200b\\u200c\\u200d\\u2060\\ufeff]/g, '')
      .replace(/\\s+/g, ' ')
      .trim();
    const interactive = (item) =>
      item.matches('button,a,[role="button"],input[type="submit"]')
        ? item
        : item.closest('button,a,[role="button"],input[type="submit"]') ||
          item.querySelector?.('button,a,[role="button"],input[type="submit"]');
    const normalized = (text) => text.replace(/[\\u200b\\u200c\\u200d\\u2060\\ufeff]/g, '').replace(/\\s+/g, ' ').trim();
    const stepTab = (text) => {
      const value = normalized(text).toLowerCase();
      return [
        'choose documents',
        'choose documents choose documents',
        'answer employer questions',
        'answer employer questions answer employer questions',
        'update jobstreet profile',
        'update jobstreet profile update jobstreet profile',
        'review and submit',
        'review and submit review and submit',
      ].includes(value);
    };
    const score = (text) => {
      const value = normalized(text);
      if (/^(submit application|send application|kirim lamaran|ajukan lamaran)$/i.test(value)) return 120;
      if (/^(continue|next|selanjutnya|lanjut|berikutnya)$/i.test(value)) return 110;
      if (/\\b(submit application|send application|kirim lamaran|ajukan lamaran)\\b/i.test(value)) return 100;
      if (/\\b(continue|next|selanjutnya|lanjut|berikutnya)\\b/i.test(value)) return 95;
      if (/\\b(apply now|lamar sekarang|send|kirim|submit)\\b/i.test(value)) return 80;
      return 10;
    };
    const candidates = deepQueryAll('button,a,[role="button"],input[type="submit"],span,div')
      .map((item) => ({ item, target: interactive(item), text: textOf(item) }))
      .filter(({ target, text }) => target && text && pattern.test(text) && visible(target) && !target.disabled)
      .filter(({ text }) => !/cancel|batal|back|kembali|save|simpan|share|bagikan|lowongan kerja|perusahaan|blog|unduh app/i.test(text));
    const ranked = candidates.filter(({ text }) => !stepTab(text)).sort((a, b) => score(b.text) - score(a.text) || a.text.length - b.text.length);
    const el = ranked[0]?.target;
    if (!el) return { clicked: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return { clicked: true, text: textOf(el), href: el.href || '' };
  })()`;
  const output = runBrowserAct(["--session", sessionName, "eval", script], { timeout: ACTION_TIMEOUT_MS });
  return truthyBrowserOutput(output);
}

function clickApplyWithDom(sessionName) {
  const script = `(() => {
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const node of roots[index].querySelectorAll('*')) {
        if (node.shadowRoot && !roots.includes(node.shadowRoot)) roots.push(node.shadowRoot);
      }
    }
    const deepQueryAll = (selector) => Array.from(new Set(roots.flatMap((root) => Array.from(root.querySelectorAll(selector)))));
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const textOf = (item) => [item.innerText, item.textContent, item.getAttribute('aria-label'), item.value, item.href]
      .filter(Boolean)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const score = (text) => {
      if (/^quick apply$/i.test(text)) return 100;
      if (/^lamar$/i.test(text)) return 95;
      if (/^apply$/i.test(text)) return 90;
      if (/^ajukan lamaran$/i.test(text)) return 85;
      if (/\\blamar\\b|quick apply|apply for|apply now|ajukan lamaran|kirim lamaran/i.test(text)) return 70;
      return 0;
    };
    const candidates = deepQueryAll('button,a,[role="button"],input[type="submit"],span,div')
      .map((item) => {
        const target = item.matches('button,a,[role="button"],input[type="submit"]')
          ? item
          : item.closest('button,a,[role="button"],input[type="submit"]');
        const text = textOf(item);
        return { target, text, rank: score(text) };
      })
      .filter(({ target, text, rank }) => target && text && rank > 0 && visible(target) && !target.disabled)
      .filter(({ text }) => !/lowongan kerja|perusahaan|blog|unduh app|share|bagikan|similar|rekomendasi/i.test(text))
      .sort((a, b) => b.rank - a.rank || a.text.length - b.text.length);
    const el = candidates[0]?.target;
    if (!el) return { clicked: false, candidates: candidates.slice(0, 8).map((item) => item.text) };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return { clicked: true, text: textOf(el), href: el.href || '', candidates: candidates.slice(0, 5).map((item) => item.text) };
  })()`;
  const output = runBrowserAct(["--session", sessionName, "eval", script], { timeout: ACTION_TIMEOUT_MS });
  return truthyBrowserOutput(output);
}

function hasAppliedSignal(text) {
  return (
    /\b(already applied|you applied|application submitted|application sent|submitted application|applied on)\b/i.test(text) ||
    /\b(lamaran terkirim|lamaran berhasil|sudah melamar|anda sudah melamar|telah melamar|sudah dilamar)\b/i.test(text) ||
    /^\s*(applied|dilamar)\s*$/im.test(text)
  );
}

function hasSuccessSignal(text) {
  return (
    /\b(application submitted|application sent|thank you for applying|your application has been submitted|successfully applied|you applied)\b/i.test(text) ||
    /\b(lamaran terkirim|lamaran berhasil|berhasil melamar|anda sudah melamar|sudah melamar|berhasil dikirim|terima kasih telah melamar)\b/i.test(text) ||
    /\b(apply\/success|application\/submitted|application-complete|application complete|application received)\b/i.test(text) ||
    /^\s*(applied|dilamar)\s*$/im.test(text)
  );
}

function hasBlockerSignal(text) {
  return /\b(login|sign in|masuk|captcha|verification|verifikasi|otp|kode verifikasi|verify you are human)\b/i.test(text);
}

function hasFinalSubmitSignal(text) {
  return /\b(submit|send application|kirim lamaran|ajukan lamaran|upload|unggah|resume|resumé|cv|expected salary|gaji yang diharapkan|cover letter|pertanyaan|question|selanjutnya|lanjut|berikutnya|review|continue|next|choose documents|answer employer questions|review and submit|select a resumé)\b/i.test(
    text
  );
}

function submitApplicationForm(sessionName, answerBank, job, rules = {}) {
  if (/jobstreet/i.test(job.source || "") || /jobstreet\./i.test(job.jobUrl || "")) {
    return submitJobStreetApplicationForm(sessionName, answerBank, job);
  }

  let totalFilled = 0;
  let upload = { uploaded: false, attached: false, reason: "No upload attempted" };
  const clickedSteps = [];
  const isGlints = /glints/i.test(job.source || "") || /glints\./i.test(job.jobUrl || "");
  const submitPattern =
    "submit application|submit|send application|kirim lamaran|ajukan lamaran|apply now|lamar sekarang|send|kirim|selanjutnya|lanjut|berikutnya|review application|review|continue|next";

  for (let step = 1; step <= 7; step += 1) {
    const beforeMarkdown = readMarkdown(sessionName);
    const locationText = isGlints ? job.jobUrl : readLocation(sessionName);
    patchAutoApplyRun(
      {
        phase: "generic_form",
        currentStep: step,
        currentStepTotal: 7,
        currentStage: "form",
        currentUrl: shortUrl(locationText),
        lastAction: "Reading application form",
        waitStatus: "ready",
        fieldsFilled: totalFilled,
      },
      "Application form step detected.",
      { jobId: job.id, step, url: shortUrl(locationText) }
    );

    if (hasSuccessSignal(`${beforeMarkdown}\n${locationText}`)) {
      patchAutoApplyRun(
        {
          phase: "submitted",
          currentStage: "success",
          currentUrl: shortUrl(locationText),
          lastAction: "Application success detected",
          waitStatus: "complete",
        },
        "Application submitted signal detected.",
        { jobId: job.id, step, url: shortUrl(locationText) }
      );
      return {
        submitted: true,
        needsConfirmation: false,
        filled: totalFilled,
        upload,
        message: "Application submitted successfully.",
      };
    }

    if (hasBlockerSignal(beforeMarkdown)) {
      patchAutoApplyRun(
        {
          phase: "blocked",
          currentStage: "form",
          currentUrl: shortUrl(locationText),
          lastAction: "Login or verification blocker detected",
          waitStatus: "blocked",
        },
        "Application blocker detected.",
        { jobId: job.id, step, url: shortUrl(locationText) }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: totalFilled,
        upload,
        message: "Login/verification required during submit.",
      };
    }

    discoverAndRecordQuestions(sessionName, job);
    const filledThisStep = fillApplicationFields(sessionName, answerBank, job);
    totalFilled += filledThisStep;
    const stepUpload = upload.attached ? upload : uploadCvIfPresent(sessionName, answerBank.cvPath, beforeMarkdown);
    if (stepUpload.attached || stepUpload.uploaded || upload.reason === "No upload attempted") {
      upload = stepUpload;
    }
    patchAutoApplyRun(
      {
        phase: "generic_form",
        currentStep: step,
        currentStepTotal: 7,
        currentStage: "form",
        currentUrl: shortUrl(locationText),
        lastAction: stepUpload.uploaded ? "Filled fields and uploaded CV" : "Filled fields and checked CV upload",
        waitStatus: "ready_to_click",
        fieldsFilled: totalFilled,
      },
      "Application fields prepared.",
      {
        jobId: job.id,
        step,
        filledThisStep,
        filled: totalFilled,
        upload: stepUpload.uploaded ? "uploaded" : stepUpload.reason,
      }
    );

    let clickMethod = "";
    if (clickButtonWithDom(sessionName, submitPattern)) {
      clickMethod = "dom";
      clickedSteps.push(clickMethod);
    } else {
      const stateText = runBrowserAct(["--session", sessionName, "state"], { timeout: READ_TIMEOUT_MS });
      const submitIndex =
        findElementIndex(stateText, /\b(submit application|send application|kirim lamaran|ajukan lamaran|submit|send|kirim)\b/i) ||
        findElementIndex(stateText, /\b(review application|continue|next|selanjutnya|lanjut|berikutnya)\b/i) ||
        findElementIndices(stateText, /\b(apply|lamar)\b/i).at(-1);

      if (submitIndex) {
        runBrowserAct(["--session", sessionName, "click", String(submitIndex)], { timeout: ACTION_TIMEOUT_MS });
        clickMethod = `state:${submitIndex}`;
        clickedSteps.push(clickMethod);
      }
    }

    if (!clickMethod) {
      patchAutoApplyRun(
        {
          phase: "needs_review",
          currentStage: "form",
          currentUrl: shortUrl(locationText),
          lastAction: "Submit/next button not found",
          waitStatus: "needs_manual_review",
        },
        "Application submit button not found.",
        { jobId: job.id, step, filled: totalFilled }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: totalFilled,
        upload,
        message: `Submit/next button not found after ${step - 1} step(s).`,
      };
    }

    patchAutoApplyRun(
      {
        phase: "generic_form",
        currentStep: step,
        currentStepTotal: 7,
        currentStage: "form",
        currentUrl: shortUrl(locationText),
        lastAction: `Clicked ${clickMethod}`,
        waitStatus: "waiting_for_page_change",
        fieldsFilled: totalFilled,
      },
      "Application next action clicked.",
      { jobId: job.id, step, clickMethod, filled: totalFilled }
    );

    const transition = isGlints
      ? (() => {
          const startedAt = Date.now();
          waitAfterAction(sessionName);
          const markdown = readMarkdown(sessionName);
          const text = `${markdown}\n${locationText}`;
          return {
            progressed: clean(markdown).slice(0, 4000) !== clean(beforeMarkdown).slice(0, 4000) || hasSuccessSignal(text),
            validationFailed: /please make a selection|required field|please select|wajib diisi|harus diisi/i.test(text),
            location: locationText,
            markdown,
            waitedMs: Date.now() - startedAt,
          };
        })()
      : waitForPageProgress(sessionName, locationText, beforeMarkdown, { timeout: STEP_WAIT_TIMEOUT_MS });
    const afterSubmit = transition.markdown;
    const afterLocation = transition.location;
    patchAutoApplyRun(
      {
        phase: "generic_form",
        currentStep: step,
        currentStepTotal: 7,
        currentStage: hasSuccessSignal(`${afterSubmit}\n${afterLocation}`) ? "success" : "form",
        currentUrl: shortUrl(afterLocation),
        lastAction: transition.progressed ? "Page changed after click" : "Waiting for page change timed out",
        waitStatus: transition.validationFailed
          ? "validation_blocked"
          : transition.progressed
            ? `changed after ${transition.waitedMs}ms`
            : `no change after ${transition.waitedMs}ms`,
        fieldsFilled: totalFilled,
      },
      "Application form transition checked.",
      {
        jobId: job.id,
        step,
        waitedMs: transition.waitedMs,
        progressed: transition.progressed,
        validationFailed: transition.validationFailed,
      }
    );

    if (hasSuccessSignal(`${afterSubmit}\n${afterLocation}`)) {
      patchAutoApplyRun(
        {
          phase: "submitted",
          currentStage: "success",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Application submitted",
          waitStatus: "complete",
          fieldsFilled: totalFilled,
        },
        "Application submitted.",
        { jobId: job.id, step, waitedMs: transition.waitedMs, filled: totalFilled }
      );
      return {
        submitted: true,
        needsConfirmation: false,
        filled: totalFilled,
        upload,
        message: "Application submitted successfully.",
      };
    }

    if (transition.validationFailed) {
      patchAutoApplyRun(
        {
          phase: "validation_blocked",
          currentStage: "form",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Validation blocked next step",
          waitStatus: "validation_blocked",
          fieldsFilled: totalFilled,
        },
        "Application validation blocked progress.",
        { jobId: job.id, step, filled: totalFilled }
      );
      return {
        submitted: false,
        needsConfirmation: true,
        filled: totalFilled,
        upload,
        message: `Form validation blocked progress after ${step} step(s).`,
      };
    }
  }

  patchAutoApplyRun(
    {
      phase: "needs_review",
      currentStep: 7,
      currentStepTotal: 7,
      lastAction: "Submit step limit reached",
      waitStatus: "needs_manual_review",
      fieldsFilled: totalFilled,
    },
    "Application submit step limit reached.",
    { jobId: job.id, clickedSteps }
  );

  return {
    submitted: false,
    needsConfirmation: true,
    filled: totalFilled,
    upload,
    message: `Submit flow reached step limit. Clicked steps: ${clickedSteps.join(", ") || "none"}.`,
  };
}

function sessionNameFor(job, runId) {
  const runPart = String(runId || "run").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-12);
  const jobPart = String(job.id || Date.now()).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(-12);
  return `auto-apply-${runPart || "run"}-${jobPart || "job"}`.slice(0, 64);
}

function markJob(job, patch, message) {
  updateAutoApplyJob(job.id, {
    ...patch,
    notes: clean(`${job.notes || ""} ${message || ""}`),
  });
}

function processJob(job, { runId, browserId, answerBank, rules }) {
  const sessionName = sessionNameFor(job, runId);

  if (!job.jobUrl) {
    patchAutoApplyRun(
      {
        phase: "needs_review",
        currentJobId: job.id,
        currentJobTitle: job.jobTitle,
        currentCompany: job.company,
        lastAction: "Missing job URL",
        waitStatus: "needs_manual_review",
        message: `URL lowongan kosong untuk ${job.company || job.source} - ${job.jobTitle}`,
      },
      "Auto apply stopped: missing job URL.",
      { jobId: job.id }
    );
    markJob(job, { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: "URL lowongan belum tersedia" }, "Auto apply skipped: missing job URL.");
    return { status: "skipped", message: "Missing job URL; continued to next job." };
  }

  try {
    patchAutoApplyRun(
      {
        status: "running",
        currentJobId: job.id,
        currentJobTitle: job.jobTitle,
        currentCompany: job.company,
        phase: "opening_job",
        currentStage: "job_page",
        currentStep: "",
        currentStepTotal: "",
        currentUrl: shortUrl(job.jobUrl),
        lastAction: "Opening job detail",
        waitStatus: "opening_browser",
        fieldsFilled: 0,
        lastStepResult: "",
        message: `Membuka ${job.company || job.source} - ${job.jobTitle}`,
      },
      "Opening job page.",
      { jobId: job.id, source: job.source, company: job.company, url: shortUrl(job.jobUrl) }
    );

    runBrowserAct(["--session", sessionName, "browser", "open", browserId, job.jobUrl, "--headed"], { timeout: OPEN_TIMEOUT_MS });
    waitAfterAction(sessionName);

    const initialMarkdown = runBrowserAct(["--session", sessionName, "get", "markdown"], { timeout: READ_TIMEOUT_MS });
    if (hasAppliedSignal(initialMarkdown)) {
      patchAutoApplyRun(
        {
          phase: "already_applied",
          currentStage: "job_page",
          currentUrl: shortUrl(job.jobUrl),
          lastAction: "Existing applied status detected",
          waitStatus: "complete",
        },
        "Existing applied status detected.",
        { jobId: job.id, url: shortUrl(job.jobUrl) }
      );
      markJob(
        job,
        {
          pipelineStatus: "Sudah Dilamar",
          automationStatus: "submitted",
          appliedAt: new Date().toISOString(),
          nextAction: "Track response",
          responseStatus: "Menunggu HR",
        },
        "Auto apply detected existing applied status."
      );
      return { status: "applied", message: "Already applied." };
    }

    if (hasBlockerSignal(initialMarkdown)) {
      patchAutoApplyRun(
        {
          phase: "blocked",
          currentStage: "job_page",
          currentUrl: shortUrl(job.jobUrl),
          lastAction: "Login or verification blocker detected",
          waitStatus: "blocked",
        },
        "Opening job page blocked by login/verification.",
        { jobId: job.id, url: shortUrl(job.jobUrl) }
      );
      markJob(
        job,
        { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: "Perlu login atau verifikasi sebelum dicoba lagi", browserSessionName: "", remoteAssist: "" },
        "Auto apply skipped this job and continued: login or verification required."
      );
      return { status: "skipped", message: "Login or verification required; continued to next job." };
    }

    const isJobStreet = /jobstreet/i.test(job.source || "") || /jobstreet\./i.test(job.jobUrl || "");
    const applyUrl = isJobStreet ? getJobStreetApplyUrl(job.jobUrl) : getApplyUrlFromMarkdown(initialMarkdown);
    const stateText = applyUrl ? "" : runBrowserAct(["--session", sessionName, "state"], { timeout: READ_TIMEOUT_MS });
    const applyIndex = findApplyElementIndex(stateText);
    const applyMethod = applyIndex ? `state:${applyIndex}` : applyUrl ? "url" : "dom";

    patchAutoApplyRun(
      {
        phase: "opening_apply",
        currentStage: "job_page",
        currentUrl: shortUrl(job.jobUrl),
        lastAction: applyIndex ? `Clicking apply element ${applyIndex}` : applyUrl ? "Navigating apply URL" : "Finding apply button with DOM",
        waitStatus: "ready_to_open_apply",
        message: `Membuka form apply untuk ${job.company || job.source} - ${job.jobTitle}`,
      },
      "Opening apply action.",
      { jobId: job.id, elementIndex: applyIndex, applyUrl: shortUrl(applyUrl), method: applyMethod }
    );

    if (applyIndex) {
      runBrowserAct(["--session", sessionName, "click", String(applyIndex)], { timeout: ACTION_TIMEOUT_MS });
    } else if (applyUrl) {
      runBrowserAct(["--session", sessionName, "navigate", applyUrl], { timeout: ACTION_TIMEOUT_MS });
    } else if (!clickApplyWithDom(sessionName)) {
      patchAutoApplyRun(
        {
          phase: "needs_review",
          currentStage: "job_page",
          currentUrl: shortUrl(job.jobUrl),
          lastAction: "Apply button not found",
          waitStatus: "needs_manual_review",
        },
        "Apply button not found.",
        { jobId: job.id, method: applyMethod }
      );
      markJob(
        job,
        { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: "Tombol lamar tidak ditemukan; periksa detail lowongan", browserSessionName: "", remoteAssist: "" },
        "Auto apply skipped this job and continued: apply button not found."
      );
      return { status: "skipped", message: "Apply button not found; continued to next job." };
    }

    const applyTransition = /glints/i.test(job.source || "") || /glints\./i.test(job.jobUrl || "")
      ? (() => {
          const startedAt = Date.now();
          waitAfterAction(sessionName);
          const markdown = readMarkdown(sessionName);
          return {
            progressed: true,
            validationFailed: false,
            location: job.jobUrl,
            markdown,
            waitedMs: Date.now() - startedAt,
          };
        })()
      : waitForPageProgress(sessionName, job.jobUrl, initialMarkdown, { timeout: STEP_WAIT_TIMEOUT_MS });
    const afterMarkdown = applyTransition.markdown;
    const afterLocation = applyTransition.location;
    const afterText = `${afterMarkdown}\n${afterLocation}`;
    patchAutoApplyRun(
      {
        phase: "opening_apply",
        currentStage: /\/apply\b/i.test(afterLocation) ? "apply_form" : "job_page",
        currentUrl: shortUrl(afterLocation),
        lastAction: `Apply action opened via ${applyMethod}`,
        waitStatus: "apply_page_checked",
      },
      "Apply action result checked.",
      { jobId: job.id, method: applyMethod, url: shortUrl(afterLocation) }
    );

    if (hasAppliedSignal(afterText)) {
      patchAutoApplyRun(
        {
          phase: "submitted",
          currentStage: "success",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Application success detected after apply action",
          waitStatus: "complete",
        },
        "Application success detected after apply action.",
        { jobId: job.id, url: shortUrl(afterLocation) }
      );
      markJob(
        job,
        {
          pipelineStatus: "Sudah Dilamar",
          automationStatus: "submitted",
          appliedAt: new Date().toISOString(),
          nextAction: "Track response",
          responseStatus: "Menunggu HR",
        },
        "Auto apply detected successful application."
      );
      return { status: "applied", message: "Application appears submitted." };
    }

    if (hasBlockerSignal(afterText)) {
      patchAutoApplyRun(
        {
          phase: "blocked",
          currentStage: /\/apply\b/i.test(afterLocation) ? "apply_form" : "job_page",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Login or verification blocker detected",
          waitStatus: "blocked",
        },
        "Apply action blocked by login/verification.",
        { jobId: job.id, url: shortUrl(afterLocation) }
      );
      markJob(
        job,
        { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: "Perlu login atau verifikasi sebelum dicoba lagi", browserSessionName: "", remoteAssist: "" },
        "Auto apply skipped this job and continued: login or verification required."
      );
      return { status: "skipped", message: "Login or verification required; continued to next job." };
    }

    if (/\/apply\b/i.test(afterLocation) || hasFinalSubmitSignal(afterText)) {
      patchAutoApplyRun(
        {
          phase: "filling_form",
          currentStage: /jobstreet/i.test(job.source || "") || /jobstreet\./i.test(job.jobUrl || "") ? detectJobStreetStage(afterLocation, afterMarkdown) : "apply_form",
          currentUrl: shortUrl(afterLocation),
          lastAction: "Filling form and submitting",
          waitStatus: "running_form_steps",
          fieldsFilled: 0,
          message: `Mengisi form dan submit lamaran ${job.company || job.source} - ${job.jobTitle}`,
        },
        "Filling and submitting application form.",
        { jobId: job.id, url: shortUrl(afterLocation) }
      );
      const submitResult = submitApplicationForm(sessionName, answerBank, job, rules);

      if (submitResult.submitted) {
        patchAutoApplyRun(
          {
            phase: "submitted",
            currentStage: "success",
            lastAction: "Application submitted successfully",
            waitStatus: "complete",
            fieldsFilled: submitResult.filled,
            message: `Lamaran berhasil: ${job.company || job.source} - ${job.jobTitle}`,
          },
          "Auto apply submitted successfully.",
          {
            jobId: job.id,
            filled: submitResult.filled,
            upload: submitResult.upload.uploaded ? "uploaded" : submitResult.upload.reason,
          }
        );
        markJob(
          job,
          {
            pipelineStatus: "Sudah Dilamar",
            automationStatus: "submitted",
            appliedAt: new Date().toISOString(),
            nextAction: "Track response",
            responseStatus: "Menunggu HR",
          },
          `Auto apply submitted successfully. Fields filled: ${submitResult.filled}. CV upload: ${
            submitResult.upload.uploaded ? "yes" : submitResult.upload.reason
          }.`
        );
        return { status: "applied", message: "Application submitted successfully." };
      }

      patchAutoApplyRun(
        {
          phase: "needs_review",
          lastAction: "Submit flow needs manual review",
          waitStatus: "needs_manual_review",
          fieldsFilled: submitResult.filled,
          message: submitResult.message,
        },
        "Auto apply needs review after submit attempt.",
        {
          jobId: job.id,
          message: submitResult.message,
          filled: submitResult.filled,
          upload: submitResult.upload.uploaded ? "uploaded" : submitResult.upload.reason,
        }
      );
      markJob(
        job,
        { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: submitResult.message, browserSessionName: "", remoteAssist: "" },
        `Auto apply skipped this job and continued. ${submitResult.message} Fields filled: ${submitResult.filled}. CV upload: ${
          submitResult.upload.uploaded ? "yes" : submitResult.upload.reason
        }.`
      );
      return { status: "skipped", message: `${submitResult.message} Continued to next job.` };
    }

    patchAutoApplyRun(
      {
        phase: "needs_review",
        currentStage: "unknown",
        currentUrl: shortUrl(afterLocation),
        lastAction: "Application form not recognized",
        waitStatus: "needs_manual_review",
      },
      "Application page needs review.",
      { jobId: job.id, url: shortUrl(afterLocation) }
    );
    markJob(
      job,
      { pipelineStatus: "Siap Dilamar", automationStatus: "needs_review", nextAction: "Halaman lamaran belum dikenali; perlu diperiksa", browserSessionName: "", remoteAssist: "" },
      "Auto apply skipped this job and continued: application page not recognized."
    );
    return { status: "skipped", message: "Application page not recognized; continued to next job." };
  } finally {
    try {
      runBrowserAct(["session", "close", sessionName], { timeout: SESSION_CLOSE_TIMEOUT_MS });
    } catch {
      // Session may already be gone; the run progress is more important than cleanup noise.
    }
  }
}

function main() {
  const runId = argValue("--run-id", process.env.AUTO_APPLY_RUN_ID || `RUN-${Date.now()}`);
  const limit = Math.max(1, Number(argValue("--limit", DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const jobIds = argList("--job-ids");
  const browserAct = checkBrowserAct();

  if (!browserAct.ok) {
    patchAutoApplyRun(
      {
        id: runId,
        status: "failed",
        phase: "startup",
        lastAction: "BrowserAct CLI check failed",
        waitStatus: "blocked",
        finishedAt: new Date().toISOString(),
        message: "BrowserAct CLI tidak tersedia.",
      },
      "BrowserAct worker failed before start.",
      { output: browserAct.output }
    );
    appendAutoApplyLog("BrowserAct worker blocked because browser-act CLI is unavailable.", {
      output: browserAct.output,
    });
    return;
  }

  const state = getAutoApplyState();
  const prepared = prepareAutoApplyRun({ jobIds });
  const jobs = prepared.jobs.slice(0, limit);

  if (prepared.blockedReasons.length) {
    patchAutoApplyRun(
      {
        id: runId,
        status: "blocked",
        phase: "answer_bank",
        lastAction: "Answer bank incomplete",
        waitStatus: "blocked",
        blockedReasons: prepared.blockedReasons,
        finishedAt: new Date().toISOString(),
        message: "Answer bank belum lengkap.",
      },
      "BrowserAct worker blocked by incomplete answer bank.",
      { blockedReasons: prepared.blockedReasons }
    );
    return;
  }

  if (!jobs.length) {
    patchAutoApplyRun(
      {
        id: runId,
        status: "idle",
        phase: "queue",
        lastAction: "No ready jobs",
        waitStatus: "idle",
        total: 0,
        processed: 0,
        finishedAt: new Date().toISOString(),
        message: "Tidak ada lowongan siap apply.",
      },
      "BrowserAct worker found no ready jobs."
    );
    return;
  }

  if (DRY_RUN) {
    console.log(`Dry run: ${jobs.length} jobs are ready for BrowserAct.`);
    jobs.forEach((job) => console.log(`${job.id}: ${job.source} - ${job.company} - ${job.jobTitle}`));
    return;
  }

  const browserId = clean(state.rules?.browserActBrowserId) || "chrome_local_117425860971069553";
  let processed = 0;
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  patchAutoApplyRun(
    {
      id: runId,
      status: "running",
      total: jobs.length,
      processed: 0,
      phase: "queue",
      currentStage: "ready",
      currentStep: "",
      currentStepTotal: "",
      currentUrl: "",
      lastAction: "Worker started",
      waitStatus: "ready",
      fieldsFilled: 0,
      lastStepResult: "",
      message: "Worker BrowserAct berjalan.",
    },
    "BrowserAct worker running.",
    { total: jobs.length }
  );

  for (const job of jobs) {
    try {
      updateAutoApplyJob(job.id, {
        pipelineStatus: "Siap Dilamar",
        automationStatus: "processing",
        nextAction: "Sedang diproses oleh BrowserAct",
      });
      const jobStartedAt = Date.now();
      const result = processJob(job, { runId, browserId, answerBank: state.answerBank, rules: state.rules });
      result.durationMs = Date.now() - jobStartedAt;
      processed += 1;
      if (result.status === "applied") applied += 1;
      if (result.status === "skipped") skipped += 1;

      patchAutoApplyRun(
        {
          status: "running",
          processed,
          applied,
          skipped,
          failed,
          phase: "job_done",
          lastAction: `Job finished as ${result.status}`,
          waitStatus: "next_job",
          message: result.message,
        },
        "Job processed.",
        { jobId: job.id, result }
      );
    } catch (error) {
      processed += 1;
      failed += 1;
      updateAutoApplyJob(job.id, {
        pipelineStatus: "Siap Dilamar",
        automationStatus: "failed",
        nextAction: "Proses gagal; periksa error BrowserAct lalu coba lagi",
        notes: clean(`${job.notes || ""} Auto apply error: ${error.message}`),
      });
      patchAutoApplyRun(
        {
          status: "running",
          processed,
          applied,
          skipped,
          failed,
          phase: "error",
          lastAction: "Job failed",
          waitStatus: "error",
          message: error.message,
        },
        "Job failed.",
        { jobId: job.id, error: error.message }
      );
    }
  }

  const finalStatus = failed > 0 ? "completed_with_errors" : "completed";
  patchAutoApplyRun(
    {
      status: finalStatus,
      processed,
      applied,
      skipped,
      failed,
      phase: "finished",
      currentStage: finalStatus,
      currentStep: "",
      currentStepTotal: "",
      currentUrl: "",
      currentJobId: "",
      currentJobTitle: "",
      currentCompany: "",
      lastAction: "Run finished",
      waitStatus: "idle",
      finishedAt: new Date().toISOString(),
      message: skipped > 0 ? "Run auto apply selesai; job yang terblokir dilewati otomatis." : "Run auto apply selesai.",
    },
    "BrowserAct worker finished.",
    { processed, applied, skipped, failed }
  );
}

export const browserActWorkerInternals = {
  buildAnswerPayload,
  discoverApplicationQuestions,
  fillApplicationFields,
  runJobStreetStep,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
