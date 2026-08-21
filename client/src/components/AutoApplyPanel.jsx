import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAutoApplyState,
  prepareAutoApplyRun,
  queueEligibleAutoApplyJobs,
  runAutoApply,
  saveAutoApplySettings,
  scrapeAutoApplyJobs,
  stopAutoApply,
  updateAutoApplyJob,
} from "../api/client.js";

const jobStatusOptions = [
  "Belum direview",
  "Review perusahaan",
  "Favorit",
  "Siap Apply",
  "Scheduled",
  "Applying",
  "Applied",
  "Skipped",
  "Failed",
  "Rejected",
  "Interview",
  "Offer",
  "Archived",
];

const exploreStatusOptions = ["All", "Belum direview", "Review perusahaan", "Favorit", "Siap Apply", "Archived"];
const applicationStatusOptions = ["All", "Applied", "Skipped", "Interview", "Offer", "Rejected", "Failed"];
const autoApplyStatusOptions = ["All", "Siap Apply", "Scheduled", "Applying", "Skipped", "Failed"];
const sourceOptions = ["All", "Glints", "JobStreet", "LinkedIn", "Company Website", "Manual"];
const salaryOptions = ["3.000.000", "3.500.000", "4.000.000", "4.500.000", "5.000.000", "6.000.000", "8.000.000"];
const experienceOptions = ["No experience", "<1 year", "1-3 years", "1 year", "2 years", "3 years", "4 years", "5 years", ">5 years"];
const educationOptions = ["Bachelor Degree (S1)", "Diploma 4", "Diploma 3", "SMA/SMK", "Masters Degree (S2)"];
const noticeOptions = ["Immediately available", "2 weeks", "1 month", "2 months"];
const yesNoOptions = ["Yes", "No"];
const employmentOptions = ["Not currently employed", "Currently employed"];
const skillLevelOptions = ["No experience", "Basic", "Intermediate", "Advanced"];
const englishOptions = ["None", "Conversational", "Professional", "Native / Fluent"];
const databaseOptions = ["PostgreSQL", "MySQL", "SQLite", "Microsoft SQL", "Oracle", "DB2", "Informix", "Teradata", "Sybase"];
const versionControlOptions = ["Git", "SVN", "TFS", "Mercurial", "CVS", "Perforce", "IBM ClearCase", "AccuRev"];
const scrapingSourceOptions = [
  { value: "Glints", label: "Glints" },
  { value: "JobStreet", label: "JobStreet" },
  { value: "LinkedIn", label: "LinkedIn Easy Apply" },
];
const keywordPresetOptions = [
  { value: "Fullstack Web Developer", label: "Fullstack Web Developer" },
  { value: "Fullstack Developer", label: "Fullstack Developer" },
  { value: "Junior Fullstack Developer", label: "Junior Fullstack Developer" },
  { value: "Frontend React", label: "Frontend React" },
  { value: "Frontend Developer", label: "Frontend Developer" },
  { value: "Junior Frontend Developer", label: "Junior Frontend Developer" },
  { value: "React Developer", label: "React Developer" },
  { value: "Next.js Developer", label: "Next.js Developer" },
  { value: "JavaScript Developer", label: "JavaScript Developer" },
  { value: "TypeScript Developer", label: "TypeScript Developer" },
  { value: "Laravel Developer", label: "Laravel Developer" },
  { value: "Backend Laravel", label: "Backend Laravel" },
  { value: "PHP Developer", label: "PHP Developer" },
  { value: "Backend PHP", label: "Backend PHP" },
  { value: "Junior Web Developer", label: "Junior Web Developer" },
  { value: "Web Developer", label: "Web Developer" },
  { value: "Web Application Developer", label: "Web Application Developer" },
];
const scrapingFrequencyOptions = [{ value: "Manual", label: "Manual - saat tombol Scrape ditekan" }];
const scrapeLimitOptions = ["10", "20", "30", "40", "50", "75", "100"];
const autoApplyLimitOptions = ["1", "3", "5", "10", "15", "20"];
const targetLocationOptions = [
  { value: "Jabodetabek", label: "Seluruh Jabodetabek" },
  { value: "Jakarta", label: "Jakarta" },
  { value: "Jakarta Selatan", label: "Jakarta Selatan" },
  { value: "Jakarta Pusat", label: "Jakarta Pusat" },
  { value: "Jakarta Barat", label: "Jakarta Barat" },
  { value: "Jakarta Timur", label: "Jakarta Timur" },
  { value: "Jakarta Utara", label: "Jakarta Utara" },
  { value: "Bogor", label: "Bogor" },
  { value: "Depok", label: "Depok" },
  { value: "Tangerang", label: "Tangerang" },
  { value: "Tangerang Selatan", label: "Tangerang Selatan" },
  { value: "Bekasi", label: "Bekasi" },
  { value: "Bandung", label: "Bandung" },
  { value: "Cimahi", label: "Cimahi" },
  { value: "Yogyakarta", label: "Yogyakarta" },
  { value: "Sleman", label: "Sleman" },
  { value: "Surabaya", label: "Surabaya" },
  { value: "Semarang", label: "Semarang" },
  { value: "Malang", label: "Malang" },
  { value: "Bali", label: "Bali" },
  { value: "Remote Indonesia", label: "Remote Indonesia" },
  { value: "Hybrid", label: "Hybrid semua lokasi" },
];
const filterReasonLabels = {
  "already applied": "Lowongan ini sudah pernah dilamar",
  "closed job": "Lowongan sudah ditutup",
  "blacklisted company": "Perusahaan masuk blacklist",
  "senior/lead role": "Posisi senior atau lead",
  "unpaid role": "Lowongan tidak berbayar",
  "dominant out-of-target stack": "Stack utama di luar target",
  "outside target keywords": "Judul tidak cocok dengan target role",
  "weak portfolio match": "Kecocokan portfolio terlalu lemah",
  "outside target location": "Lokasi di luar target",
};
const TABLE_PAGE_SIZE = 10;

function emptyState() {
  return {
    jobs: [],
    answerBank: {},
    rules: {},
    activityLog: [],
  };
}

function countByStatus(jobs) {
  return jobs.reduce((counts, job) => {
    const key = job.pipelineStatus || "Belum direview";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

function normalizedIdentityText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function jobIdentityKeys(job = {}) {
  const keys = [];
  const url = String(job.jobUrl || "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  const jobStreetId = url.match(/jobstreet\.[^/]+\/job\/(\d+)/)?.[1];
  const glintsId = url.match(/\/opportunities\/jobs\/[^/]+\/([a-f0-9-]{20,})$/)?.[1];
  const linkedInId = url.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d+)/)?.[1];
  if (jobStreetId) keys.push(`jobstreet:${jobStreetId}`);
  else if (glintsId) keys.push(`glints:${glintsId}`);
  else if (linkedInId) keys.push(`linkedin:${linkedInId}`);
  else if (url) keys.push(`url:${url}`);

  const title = normalizedIdentityText(job.jobTitle);
  const company = normalizedIdentityText(job.company);
  if (title && company) keys.push(`role-company:${title}|${company}`);
  return keys;
}

function appliedJobIdentitySet(jobs = []) {
  const appliedStatuses = new Set(["applied", "interview", "offer", "rejected"]);
  return new Set(
    jobs
      .filter((job) => appliedStatuses.has(normalizeStatus(job.pipelineStatus)))
      .flatMap(jobIdentityKeys)
  );
}

function selectedStatusFor(options, selectedStatus) {
  return options.includes(selectedStatus) ? selectedStatus : "All";
}

function matchesJobSearch(job, query) {
  if (!query) return true;

  return [job.jobTitle, job.company, job.source, job.location, job.workArrangement, job.employmentType, job.matchedPortfolioSkills, job.jobDescription, job.notes, ...(job.filterReasons || [])]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function filterReasonsForJob(job) {
  const structuredReasons = Array.isArray(job.filterReasons) ? job.filterReasons.filter(Boolean) : [];
  if (structuredReasons.length) return [...new Set(structuredReasons)];

  const notes = String(job.notes || "").toLowerCase();
  return Object.keys(filterReasonLabels).filter((reason) => notes.includes(reason));
}

function isApplication(job) {
  return ["applied", "skipped", "failed", "rejected", "interview", "offer", "scheduled", "applying"].includes(
    normalizeStatus(job.pipelineStatus)
  );
}

function isAutoApplyQueue(job) {
  return ["siap apply", "scheduled", "applying", "skipped", "failed"].includes(normalizeStatus(job.pipelineStatus));
}

function formatLogData(data = {}) {
  if (!data || typeof data !== "object") return "";

  const parts = [];
  const add = (value) => {
    const text = String(value || "").trim();
    if (text) parts.push(text.length > 72 ? `${text.slice(0, 69)}...` : text);
  };

  add(data.jobId);
  if (data.step) add(`step ${data.step}`);
  if (data.stage) add(`stage ${data.stage}`);
  if (data.fromStage || data.toStage) add(`${data.fromStage || "?"} -> ${data.toStage || "?"}`);
  if (data.filledThisStep !== undefined) add(`+${data.filledThisStep} field`);
  if (data.filled !== undefined) add(`${data.filled} field`);
  if (data.waitedMs !== undefined) add(`${data.waitedMs}ms`);
  if (data.action) add(data.action);
  if (data.method) add(data.method);
  if (data.error) add(data.error);
  if (data.matchedFilters !== undefined) add(`${data.matchedFilters} lolos filter`);
  if (data.filteredOut !== undefined) add(`${data.filteredOut} tidak lolos`);
  if (data.detailsEnriched !== undefined) add(`${data.detailsEnriched} detail dibaca`);

  return parts.slice(0, 6).join(" | ");
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function dateValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortNewestAppliedFirst(jobs) {
  return [...jobs].sort((first, second) => {
    const appliedDiff = dateValue(second.appliedAt) - dateValue(first.appliedAt);
    if (appliedDiff) return appliedDiff;
    return dateValue(second.updatedAt) - dateValue(first.updatedAt);
  });
}

function statusClass(status) {
  const value = normalizeStatus(status);
  if (value === "applied" || value === "siap apply" || value === "scheduled") return "ready";
  if (value === "skipped" || value === "review perusahaan" || value === "applying") return "review";
  if (value === "failed" || value === "rejected") return "danger";
  return "";
}

function priorityClass(priority) {
  return String(priority || "low").toLowerCase();
}

function sourceClass(source) {
  return String(source || "manual")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function sourceMark(source) {
  const normalized = normalizeStatus(source);
  if (normalized === "jobstreet") return "JS";
  if (normalized === "linkedin") return "in";
  if (normalized === "glints") return "G";
  if (normalized === "company website") return "CW";
  return "M";
}

function splitJobSkills(value) {
  return String(value || "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function SoftSelect({ name = "", value = "", options = [], placeholder = "", onChange, onValueChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );
  const allOptions = placeholder ? [{ value: "", label: placeholder, placeholder: true }, ...normalizedOptions] : normalizedOptions;
  const selected = allOptions.find((option) => option.value === value);
  const selectedLabel = selected?.label || placeholder || "Pilih";

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function chooseOption(nextValue) {
    onValueChange?.(nextValue);
    onChange?.({ target: { name, value: nextValue } });
    setOpen(false);
  }

  return (
    <div className={`soft-select ${open ? "open" : ""} ${className}`} ref={rootRef}>
      <button
        className="soft-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabel}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="soft-select-menu" role="listbox">
          {allOptions.map((option) => (
            <button
              className={`${option.value === value ? "selected" : ""} ${option.placeholder ? "placeholder" : ""}`}
              key={option.value || option.label}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => chooseOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSoftSelect({
  name = "",
  value = "",
  options = [],
  placeholder = "Pilih beberapa opsi",
  maxSelections,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );
  const optionValues = new Set(normalizedOptions.map((option) => option.value));
  const selectedValues = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && optionValues.has(item));
  const selectedSet = new Set(selectedValues);
  const selectedLabels = normalizedOptions.filter((option) => selectedSet.has(option.value)).map((option) => option.label);
  const selectionLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} pilihan dipilih`;

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function emit(nextValues) {
    onChange?.({ target: { name, value: nextValues.join(", ") } });
  }

  function toggleOption(optionValue) {
    if (selectedSet.has(optionValue)) {
      emit(selectedValues.filter((item) => item !== optionValue));
      return;
    }

    if (maxSelections && selectedValues.length >= maxSelections) return;
    emit([...selectedValues, optionValue]);
  }

  return (
    <div className={`soft-select multi-soft-select ${open ? "open" : ""}`} ref={rootRef}>
      <button
        className="soft-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectionLabel}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="soft-select-menu multi-select-menu" role="listbox" aria-multiselectable="true">
          <div className="multi-select-summary">
            <strong>{selectedValues.length} dipilih{maxSelections ? ` / maksimal ${maxSelections}` : ""}</strong>
            {selectedValues.length > 0 && (
              <button type="button" onClick={() => emit([])}>
                Bersihkan
              </button>
            )}
          </div>
          {normalizedOptions.map((option) => {
            const selected = selectedSet.has(option.value);
            const disabled = !selected && Boolean(maxSelections && selectedValues.length >= maxSelections);
            return (
              <button
                className={`multi-select-option ${selected ? "selected" : ""}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => toggleOption(option.value)}
              >
                <span className="multi-select-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
          <button className="multi-select-done" type="button" onClick={() => setOpen(false)}>
            Selesai
          </button>
        </div>
      )}
    </div>
  );
}

function AnswerSelect({ label, name, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <SoftSelect name={name} value={value || ""} options={options} placeholder="Pilih jawaban" onChange={onChange} />
    </label>
  );
}

export default function AutoApplyPanel({ view = "jobs" }) {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [runningApply, setRunningApply] = useState(false);
  const [stoppingApply, setStoppingApply] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedSource, setSelectedSource] = useState("All");
  const [search, setSearch] = useState("");
  const [tablePages, setTablePages] = useState({
    explore: 1,
    applications: 1,
    autoApply: 1,
  });

  const counts = useMemo(() => countByStatus(state.jobs || []), [state.jobs]);
  const applicationJobs = useMemo(() => sortNewestAppliedFirst((state.jobs || []).filter(isApplication)), [state.jobs]);
  const readyJobs = useMemo(() => (state.jobs || []).filter((job) => job.pipelineStatus === "Siap Apply"), [state.jobs]);
  const readyJobsForSelectedSource = useMemo(
    () => readyJobs.filter((job) => selectedSource === "All" || normalizeStatus(job.source) === normalizeStatus(selectedSource)),
    [readyJobs, selectedSource]
  );
  const autoApplyJobs = useMemo(() => (state.jobs || []).filter(isAutoApplyQueue), [state.jobs]);
  const exploreJobs = useMemo(() => {
    const jobs = state.jobs || [];
    const appliedIdentities = appliedJobIdentitySet(jobs);
    return jobs.filter(
      (job) => !isApplication(job) && !jobIdentityKeys(job).some((key) => appliedIdentities.has(key))
    );
  }, [state.jobs]);

  const filteredExploreJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeStatus = selectedStatusFor(exploreStatusOptions, selectedStatus);

    return exploreJobs.filter((job) => {
      const statusMatch = activeStatus === "All" || job.pipelineStatus === activeStatus;
      const sourceMatch = selectedSource === "All" || job.source === selectedSource;
      return statusMatch && sourceMatch && matchesJobSearch(job, query);
    });
  }, [exploreJobs, selectedStatus, selectedSource, search]);

  const filteredApplicationJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeStatus = selectedStatusFor(applicationStatusOptions, selectedStatus);

    return sortNewestAppliedFirst(applicationJobs.filter((job) => {
      const statusMatch = activeStatus === "All" || job.pipelineStatus === activeStatus;
      const sourceMatch = selectedSource === "All" || job.source === selectedSource;
      return statusMatch && sourceMatch && matchesJobSearch(job, query);
    }));
  }, [applicationJobs, selectedStatus, selectedSource, search]);

  const filteredAutoApplyJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeStatus = selectedStatusFor(autoApplyStatusOptions, selectedStatus);

    return autoApplyJobs.filter((job) => {
      const statusMatch = activeStatus === "All" || job.pipelineStatus === activeStatus;
      const sourceMatch = selectedSource === "All" || job.source === selectedSource;
      return statusMatch && sourceMatch && matchesJobSearch(job, query);
    });
  }, [autoApplyJobs, selectedStatus, selectedSource, search]);

  async function loadState({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const response = await getAutoApplyState();
      setState(response.data);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    const runStatus = normalizeStatus(state.automationRun?.status);
    if (!["starting", "running"].includes(runStatus)) return undefined;

    const interval = window.setInterval(() => {
      loadState({ silent: true });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [state.automationRun?.status]);

  useEffect(() => {
    setTablePages({
      explore: 1,
      applications: 1,
      autoApply: 1,
    });
  }, [selectedStatus, selectedSource, search]);

  function updateAnswerBankField(event) {
    const { name, value } = event.target;
    setState((current) => ({
      ...current,
      answerBank: { ...current.answerBank, [name]: value },
    }));
  }

  function updateRuleField(event) {
    const { name, checked, type, value } = event.target;
    setState((current) => ({
      ...current,
      rules: { ...current.rules, [name]: type === "checkbox" ? checked : value },
    }));
  }

  async function handleSaveSettings() {
    try {
      setSaving(true);
      setStatus({ type: "", message: "" });
      const response = await saveAutoApplySettings({
        answerBank: state.answerBank,
        rules: state.rules,
      });
      setState(response.data);
      setStatus({ type: "success", message: "Pengaturan tersimpan." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function patchJob(jobId, patch, message) {
    try {
      const nextPatch =
        patch.pipelineStatus === "Applied" && !patch.appliedAt
          ? { ...patch, appliedAt: new Date().toISOString() }
          : patch;
      const response = await updateAutoApplyJob(jobId, nextPatch);
      setState(response.data);
      setStatus({ type: "success", message });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  function setTablePage(mode, page) {
    setTablePages((current) => ({
      ...current,
      [mode]: Math.max(1, page),
    }));
  }

  async function handleQueueAllEligibleJobs() {
    try {
      const response = await queueEligibleAutoApplyJobs([], { all: true });
      setState(response.data);
      const summary = response.data.queueSummary;
      setStatus({
        type: "success",
        message: `${summary.considered} lowongan diperiksa sekaligus: ${summary.queued} menjadi Siap Apply, ${summary.skipped} tidak lolos filter.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function handleScrapeWebsites() {
    try {
      setScraping(true);
      setStatus({ type: "warning", message: "Scraping Glints/JobStreet sedang berjalan lewat BrowserAct..." });
      const response = await scrapeAutoApplyJobs();
      setState(response.data);
      const scrape = response.data.scrapeSummary;
      const imported = response.data.importSummary;
      const queued = scrape.autoQueue || { queued: 0, skipped: 0 };
      const rejected = scrape.rejectionBreakdown || {};
      const rejectionDetails = [
        rejected.alreadyApplied ? `${rejected.alreadyApplied} sudah pernah dilamar` : "",
        rejected.closedJob ? `${rejected.closedJob} lowongan sudah ditutup` : "",
        rejected.keywordMismatch ? `${rejected.keywordMismatch} keyword tidak cocok` : "",
        rejected.outsideTargetLocation ? `${rejected.outsideTargetLocation} lokasi di luar target` : "",
        rejected.missingLocation ? `${rejected.missingLocation} lokasi tidak terbaca` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const detailLimitNotice = scrape.detailLimitReached
        ? ` Batas pemeriksaan ${scrape.detailLimit} halaman detail tercapai.`
        : "";
      setStatus({
        type: scrape.matchedFilters ? "success" : "warning",
        message: `Scraping selesai: ${scrape.extracted} ditemukan, ${scrape.detailsEnriched || 0}/${scrape.detailsAttempted || 0} detail berhasil dibaca, ${scrape.matchedFilters} lolos filter, ${scrape.filteredOut} tidak sesuai, ${scrape.duplicatesRemoved} duplikat, ${imported.imported} baru, ${queued.queued} masuk queue.${rejectionDetails ? ` Alasan: ${rejectionDetails}.` : ""}${detailLimitNotice}`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setScraping(false);
    }
  }

  async function handlePrepareRun() {
    try {
      const response = await prepareAutoApplyRun(
        readyJobsForSelectedSource.map((job) => job.id),
        selectedSource
      );

      if (response.data.blockedReasons?.length) {
        setStatus({
          type: "warning",
          message: `Belum bisa jalan: ${response.data.blockedReasons.join(" ")}`,
        });
        return;
      }

      setStatus({
        type: "success",
        message: `${response.data.readyCount} lamaran ${selectedSource === "All" ? "dari semua sumber" : `dari ${selectedSource}`} siap dikirim oleh worker BrowserAct.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function handleRunAutoApply() {
    try {
      setRunningApply(true);
      setStatus({
        type: "warning",
        message: `Menjalankan worker BrowserAct untuk ${selectedSource === "All" ? "semua sumber" : selectedSource}...`,
      });
      const response = await runAutoApply(
        readyJobsForSelectedSource.map((job) => job.id),
        state.rules?.autoApplyLimitPerRun,
        selectedSource
      );
      setState(response.data);

      if (!response.data.startSummary?.started) {
        setStatus({ type: "warning", message: response.data.startSummary?.reason || "Auto apply tidak dimulai." });
        return;
      }

      setStatus({
        type: "success",
        message: `Auto apply ${selectedSource === "All" ? "semua sumber" : selectedSource} mulai: ${response.data.startSummary.total} lowongan diproses.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setRunningApply(false);
    }
  }

  async function handleStopAutoApply() {
    try {
      setStoppingApply(true);
      setStatus({ type: "warning", message: "Menghentikan auto apply..." });
      const response = await stopAutoApply();
      setState(response.data);

      if (!response.data.stopSummary?.stopped) {
        setStatus({
          type: "warning",
          message: response.data.stopSummary?.reason || "Tidak ada auto apply yang sedang berjalan.",
        });
        return;
      }

      setStatus({ type: "success", message: "Auto apply dihentikan." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setStoppingApply(false);
    }
  }

  function renderRunProgress() {
    const run = state.automationRun;
    if (!run) {
      return <div className="empty-state compact-empty">Belum ada run auto apply.</div>;
    }

    const total = Number(run.total || 0);
    const processed = Number(run.processed || 0);
    const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const logs = run.logs || [];
    const stepValue = run.currentStep ? `${run.currentStep}${run.currentStepTotal ? `/${run.currentStepTotal}` : ""}` : "";
    const fieldsValue = run.fieldsFilled !== undefined && run.fieldsFilled !== "" ? `${run.fieldsFilled} field` : "";
    const detailItems = [
      ["Fase", run.phase],
      ["Stage", run.currentStage],
      ["Step", stepValue],
      ["Aksi", run.lastAction],
      ["Wait", run.waitStatus],
      ["Terisi", fieldsValue],
      ["URL", run.currentUrl],
    ]
      .map(([label, value]) => [label, value === null || value === undefined ? "" : String(value)])
      .filter(([, value]) => value.trim());

    return (
      <div className="run-progress">
        <div className="run-progress-header">
          <div>
            <strong>{run.status || "idle"}</strong>
            <span>{run.message || "Menunggu proses."}</span>
          </div>
          <small>
            {processed}/{total} selesai
          </small>
        </div>
        <div className="progress-track" aria-label="Progress auto apply">
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="run-stats">
          <span>Applied: {run.applied || 0}</span>
          <span>Skipped: {run.skipped || 0}</span>
          <span>Failed: {run.failed || 0}</span>
        </div>
        {(run.currentJobTitle || run.currentCompany) && (
          <p className="current-job">
            {run.currentCompany || "-"} - {run.currentJobTitle || "-"}
          </p>
        )}
        {detailItems.length > 0 && (
          <div className="run-detail-grid">
            {detailItems.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="run-log">
          {logs.slice(0, 10).map((log) => {
            const detail = formatLogData(log.data);
            return (
              <div key={log.id}>
                <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                <p>
                  {log.message}
                  {detail && <small>{detail}</small>}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSummary() {
    return (
      <div className="auto-summary-grid">
        <div className="metric-card">
          <span>{state.jobs?.length || 0}</span>
          <small>Lowongan masuk</small>
        </div>
        <div className="metric-card">
          <span>{applicationJobs.length}</span>
          <small>Total lamaran</small>
        </div>
        <div className="metric-card">
          <span>{counts.Applied || 0}</span>
          <small>Sudah applied</small>
        </div>
        <div className="metric-card">
          <span>{readyJobs.length}</span>
          <small>Siap dikirim</small>
        </div>
      </div>
    );
  }

  function renderStatus() {
    return status.message ? <p className={`status ${status.type}`}>{status.message}</p> : null;
  }

  function renderFilters(statusFilterOptions, searchPlaceholder = "Role, perusahaan, skill, lokasi") {
    const activeStatus = selectedStatusFor(statusFilterOptions, selectedStatus);

    return (
      <div className="queue-filters three-filter-row">
        <label className="field">
          <span>Cari</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} />
        </label>
        <label className="field">
          <span>Sumber</span>
          <SoftSelect value={selectedSource} options={sourceOptions} onValueChange={setSelectedSource} />
        </label>
        <label className="field">
          <span>Status</span>
          <SoftSelect value={activeStatus} options={statusFilterOptions} onValueChange={setSelectedStatus} />
        </label>
      </div>
    );
  }

  function renderScrapeToolbar() {
    return (
      <div className="auto-toolbar">
        <button className="primary-button" type="button" onClick={handleScrapeWebsites} disabled={loading || scraping}>
          {scraping ? "Scraping..." : "Scrape Website & Auto Queue"}
        </button>
        <button className="secondary-button" type="button" onClick={handleQueueAllEligibleJobs} disabled={loading || !state.jobs?.length}>
          Jadikan Semua yang Lolos Filter Siap Apply
        </button>
        <button className="secondary-button" type="button" onClick={loadState} disabled={loading}>
          Refresh
        </button>
      </div>
    );
  }

  function renderJobsTable(jobs, mode = "explore") {
    if (loading) return <div className="empty-state">Memuat data...</div>;
    if (!jobs.length) return <div className="empty-state">Belum ada data pada tampilan ini.</div>;

    const showAppliedAt = mode !== "explore";
    const totalPages = Math.max(1, Math.ceil(jobs.length / TABLE_PAGE_SIZE));
    const currentPage = Math.min(tablePages[mode] || 1, totalPages);
    const startIndex = (currentPage - 1) * TABLE_PAGE_SIZE;
    const visibleJobs = jobs.slice(startIndex, startIndex + TABLE_PAGE_SIZE);
    const endIndex = Math.min(startIndex + visibleJobs.length, jobs.length);

    return (
      <div className="table-block">
        <div className="job-list">
          {visibleJobs.map((job) => {
            const filterReasons = filterReasonsForJob(job);
            const showFilterReasons = normalizeStatus(job.pipelineStatus) === "archived" && filterReasons.length > 0;
            const normalizedJobStatus = normalizeStatus(job.pipelineStatus);
            const skills = splitJobSkills(job.matchedPortfolioSkills);
            const canRetry = ["skipped", "failed"].includes(normalizedJobStatus);
            const showQueueAction = mode === "explore" || canRetry;
            const contextLabel = mode === "applications" ? "Status respons" : mode === "autoApply" ? "Langkah berikutnya" : "Kecocokan pencarian";
            const contextValue =
              mode === "applications"
                ? job.responseStatus || job.nextAction || "Menunggu pembaruan"
                : mode === "autoApply"
                  ? job.nextAction || "Menunggu worker auto apply"
                  : job.matchedQuery || job.nextAction || "Belum ada catatan kecocokan";

            return (
            <article className={`job-card job-card-${mode}`} key={job.id}>
              <header className="job-card-header">
                <div className={`job-source-mark source-${sourceClass(job.source)}`} aria-hidden="true">
                  {sourceMark(job.source)}
                </div>
                <div className="job-heading">
                  <div className="job-card-eyebrow">
                    <span>{job.source || "Manual"}</span>
                    <i aria-hidden="true" />
                    <span>{job.id}</span>
                  </div>
                  {job.jobUrl ? (
                    <a className="job-title-link" href={job.jobUrl} target="_blank" rel="noreferrer">
                      {job.jobTitle || "Untitled role"}
                    </a>
                  ) : (
                    <strong className="job-title-link">{job.jobTitle || "Untitled role"}</strong>
                  )}
                  <p>{job.company || "Perusahaan belum terbaca"}</p>
                </div>
                <div className="job-card-status">
                  <div className="job-status-badges">
                    <span className={`tag ${statusClass(job.pipelineStatus)}`}>{job.pipelineStatus || "Belum direview"}</span>
                    <span className={`tag priority-${priorityClass(job.priority)}`}>{job.priority || "Low"}</span>
                  </div>
                  <SoftSelect
                    className="status-soft-select"
                    value={job.pipelineStatus || "Belum direview"}
                    options={jobStatusOptions}
                    onValueChange={(nextStatus) => patchJob(job.id, { pipelineStatus: nextStatus }, `Status diubah ke ${nextStatus}.`)}
                  />
                </div>
              </header>

              <div className="job-facts">
                <div>
                  <span>Lokasi</span>
                  <strong>{job.location || "Belum terbaca"}</strong>
                </div>
                <div>
                  <span>Gaji</span>
                  <strong>{job.salaryRaw || "Tidak ditampilkan"}</strong>
                </div>
                <div>
                  <span>Tipe kerja</span>
                  <strong>{job.employmentType || "Tidak disebutkan"}</strong>
                </div>
                <div>
                  <span>Sistem kerja</span>
                  <strong>{job.workArrangement || "Tidak disebutkan"}</strong>
                </div>
              </div>

              {skills.length > 0 && (
                <div className="job-skill-row">
                  <span>Skill cocok</span>
                  <div>
                    {skills.map((skill) => (
                      <em key={skill}>{skill}</em>
                    ))}
                  </div>
                </div>
              )}

              {showFilterReasons && (
                <div className="filter-reason-box">
                  <strong>Tidak lolos filter</strong>
                  <div>
                    {filterReasons.map((reason) => (
                      <span key={reason}>{filterReasonLabels[reason] || reason}</span>
                    ))}
                  </div>
                </div>
              )}

              <footer className="job-card-footer">
                <div className="job-context">
                  <span>{contextLabel}</span>
                  <strong>{contextValue}</strong>
                  {showAppliedAt && job.appliedAt && <small>Applied {formatDateTime(job.appliedAt)}</small>}
                </div>
                <div className="job-card-actions">
                  {job.jobUrl && (
                    <a className="job-action job-action-detail" href={job.jobUrl} target="_blank" rel="noreferrer">
                      Buka detail
                    </a>
                  )}
                  {mode === "explore" && normalizedJobStatus !== "favorit" && (
                    <button className="job-action" type="button" onClick={() => patchJob(job.id, { pipelineStatus: "Favorit" }, "Lowongan disimpan ke favorit.")}>
                      Simpan
                    </button>
                  )}
                  {showQueueAction && (
                    <button className="job-action job-action-primary" type="button" onClick={() => patchJob(job.id, { pipelineStatus: "Siap Apply" }, "Lowongan masuk queue Lamar Otomatis.")}>
                      {canRetry ? "Coba lagi" : "Masuk queue"}
                    </button>
                  )}
                  {normalizedJobStatus !== "archived" && (
                    <button className="job-action job-action-muted" type="button" onClick={() => patchJob(job.id, { pipelineStatus: "Archived" }, "Lowongan diarsipkan.")}>
                      Arsipkan
                    </button>
                  )}
                </div>
              </footer>
            </article>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="table-pagination">
            <span>
              {startIndex + 1}-{endIndex} dari {jobs.length} data
            </span>
            <div>
              <button className="secondary-button pagination-button" type="button" disabled={currentPage <= 1} onClick={() => setTablePage(mode, currentPage - 1)}>
                Prev
              </button>
              <strong>
                Halaman {currentPage}/{totalPages}
              </strong>
              <button className="secondary-button pagination-button" type="button" disabled={currentPage >= totalPages} onClick={() => setTablePage(mode, currentPage + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderJobsExplorer() {
    return (
      <div className="auto-apply-layout">
        <section className="panel auto-apply-control">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2>Jelajahi Lowongan</h2>
              <p className="section-subtitle">Temukan role yang cocok, simpan, lalu kirim ke queue auto apply.</p>
            </div>
          </div>
          {renderSummary()}
          {renderScrapeToolbar()}
          {renderStatus()}
        </section>

        <section className="panel">
          {renderFilters(exploreStatusOptions)}
          {renderJobsTable(filteredExploreJobs, "explore")}
        </section>
      </div>
    );
  }

  function renderApplications() {
    return (
      <div className="auto-apply-layout">
        <section className="panel auto-apply-control">
          <div className="section-heading">
            <span className="section-number">02</span>
            <div>
              <h2>Lamaran Saya</h2>
              <p className="section-subtitle">Lamaran terbaru tampil paling atas, lengkap dengan waktu apply.</p>
            </div>
          </div>
          {renderSummary()}
          {renderStatus()}
        </section>

        <section className="panel">
          {renderFilters(applicationStatusOptions, "Role, perusahaan, sumber, lokasi, atau catatan")}
          {renderJobsTable(filteredApplicationJobs, "applications")}
        </section>
      </div>
    );
  }

  function renderAutoApply() {
    const autoApplyIsActive = ["starting", "running"].includes(normalizeStatus(state.automationRun?.status));
    const answerBankFieldNames = [
      "cvPath",
      "emailAddress",
      "phoneCountryCode",
      "phoneNumber",
      "currentLocation",
      "livesInJobLocation",
      "expectedSalary",
      "availability",
      "noticePeriod",
      "educationLevel",
      "currentEmploymentStatus",
      "frontendExperience",
      "fullstackExperience",
      "backendExperience",
      "javascriptExperience",
      "reactExperience",
      "phpExperience",
      "laravelExperience",
      "nodeExperience",
      "sqlExperience",
      "rdbmsExperience",
      "graphqlExperience",
      "computerSoftwareExperience",
      "computerNetworkingExperience",
      "networkSecurityExperience",
      "englishProficiency",
      "databases",
      "versionControlTools",
      "scrumAgileExperience",
      "insuranceExperience",
      "chatbotExperience",
      "workEligibility",
      "onsiteAvailability",
      "primarySkillLevel",
      "secondarySkillLevel",
      "outOfPortfolioSkillLevel",
      "fallbackScreeningAnswer",
      "defaultCoverNote",
    ];
    const completedAnswerCount = answerBankFieldNames.filter((name) => String(state.answerBank?.[name] || "").trim()).length;
    const answerCompletion = Math.round((completedAnswerCount / answerBankFieldNames.length) * 100);

    return (
      <div className="auto-apply-layout">
        <section className="panel auto-apply-control">
          <div className="section-heading">
            <span className="section-number">03</span>
            <div>
              <h2>Lamar Otomatis</h2>
              <p className="section-subtitle">Assistant membuka lowongan, memetakan pertanyaan, submit otomatis, lalu lanjut ke job berikutnya jika portal memblokir.</p>
            </div>
          </div>
          {renderSummary()}
          <div className="auto-apply-source-scope">
            <div className="auto-apply-source-picker">
              <span>Target auto apply</span>
              <SoftSelect value={selectedSource} options={sourceOptions} onValueChange={setSelectedSource} />
            </div>
            <small>{readyJobsForSelectedSource.length} lowongan siap dari sumber ini</small>
          </div>
          <div className="auto-toolbar">
            <button className="primary-button" type="button" onClick={handleRunAutoApply} disabled={runningApply || autoApplyIsActive || !readyJobsForSelectedSource.length}>
              {runningApply || autoApplyIsActive
                ? "Auto Apply Berjalan..."
                : selectedSource === "All"
                  ? "Run Semua Sumber"
                  : `Run ${selectedSource}`}
            </button>
            <button className="danger-button" type="button" onClick={handleStopAutoApply} disabled={stoppingApply || !autoApplyIsActive}>
              {stoppingApply ? "Menghentikan..." : "Stop Auto Apply"}
            </button>
            <button className="secondary-button" type="button" onClick={handlePrepareRun}>
              Cek Kesiapan{selectedSource === "All" ? "" : ` ${selectedSource}`}
            </button>
            <button className="secondary-button" type="button" onClick={loadState} disabled={loading}>
              Refresh
            </button>
          </div>
          {renderStatus()}
        </section>

        <section className="panel">
          <div className="section-heading">
            <span className="section-number">P</span>
            <div>
              <h2>Progress Auto Apply</h2>
              <p className="section-subtitle">Lihat assistant sedang berada di step mana dan apa aksi terakhirnya.</p>
            </div>
          </div>
          {renderRunProgress()}
        </section>

        <section className="panel">
          <div className="section-heading">
            <span className="section-number">A</span>
            <div>
              <h2>Answer Bank</h2>
              <p className="section-subtitle">Jawaban siap pakai agar form screening tidak bikin proses stuck.</p>
            </div>
          </div>

          <div className="answer-bank-overview">
            <div>
              <span className="answer-bank-eyebrow">Kelengkapan jawaban</span>
              <strong>{answerCompletion}% siap digunakan</strong>
              <p>{completedAnswerCount} dari {answerBankFieldNames.length} jawaban sudah terisi.</p>
            </div>
            <div className="answer-bank-progress" aria-label={`Kelengkapan Answer Bank ${answerCompletion}%`}>
              <span style={{ width: `${answerCompletion}%` }} />
            </div>
          </div>

          <div className="answer-bank-groups">
            <section className="answer-bank-group">
              <div className="answer-bank-group-heading">
                <span>01</span>
                <div>
                  <h3>Dokumen & Kesiapan</h3>
                  <p>Informasi dasar yang paling sering diminta sebelum screening.</p>
                </div>
              </div>
              <div className="form-grid two-columns">
                <label className="field answer-bank-full-field">
                  <span>Lokasi File CV</span>
                  <input name="cvPath" value={state.answerBank?.cvPath || ""} onChange={updateAnswerBankField} />
                  <small>File ini digunakan saat portal meminta upload CV baru.</small>
                </label>
                <label className="field">
                  <span>Email Lamaran</span>
                  <input name="emailAddress" type="email" value={state.answerBank?.emailAddress || ""} onChange={updateAnswerBankField} />
                </label>
                <label className="field">
                  <span>Kode Negara Telepon</span>
                  <input name="phoneCountryCode" value={state.answerBank?.phoneCountryCode || ""} onChange={updateAnswerBankField} />
                </label>
                <label className="field">
                  <span>Nomor Telepon</span>
                  <input name="phoneNumber" inputMode="tel" value={state.answerBank?.phoneNumber || ""} onChange={updateAnswerBankField} />
                </label>
                <label className="field">
                  <span>Domisili Saat Ini</span>
                  <input name="currentLocation" value={state.answerBank?.currentLocation || ""} onChange={updateAnswerBankField} />
                </label>
                <AnswerSelect label="Sudah Tinggal di Lokasi Lowongan" name="livesInJobLocation" value={state.answerBank?.livesInJobLocation} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Ekspektasi Gaji" name="expectedSalary" value={state.answerBank?.expectedSalary} options={salaryOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Kesiapan Mulai Kerja" name="availability" value={state.answerBank?.availability} options={["immediate", "2 weeks", "1 month"]} onChange={updateAnswerBankField} />
                <AnswerSelect label="Notice Period" name="noticePeriod" value={state.answerBank?.noticePeriod} options={noticeOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Pendidikan Terakhir" name="educationLevel" value={state.answerBank?.educationLevel} options={educationOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Status Pekerjaan Saat Ini" name="currentEmploymentStatus" value={state.answerBank?.currentEmploymentStatus} options={employmentOptions} onChange={updateAnswerBankField} />
              </div>
            </section>

            <section className="answer-bank-group">
              <div className="answer-bank-group-heading">
                <span>02</span>
                <div>
                  <h3>Screening Umum</h3>
                  <p>Jawaban ya/tidak untuk pertanyaan perusahaan dan kesiapan kerja.</p>
                </div>
              </div>
              <div className="form-grid two-columns">
                <AnswerSelect label="Pengalaman Scrum / Agile" name="scrumAgileExperience" value={state.answerBank?.scrumAgileExperience} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Pengalaman Industri Asuransi" name="insuranceExperience" value={state.answerBank?.insuranceExperience} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Pengalaman Chatbot" name="chatbotExperience" value={state.answerBank?.chatbotExperience} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Izin / Kelayakan Bekerja" name="workEligibility" value={state.answerBank?.workEligibility} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Bersedia Onsite / Hybrid" name="onsiteAvailability" value={state.answerBank?.onsiteAvailability} options={yesNoOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Kemampuan Bahasa Inggris" name="englishProficiency" value={state.answerBank?.englishProficiency} options={englishOptions} onChange={updateAnswerBankField} />
              </div>
            </section>

            <section className="answer-bank-group answer-bank-wide-group">
              <div className="answer-bank-group-heading">
                <span>03</span>
                <div>
                  <h3>Pengalaman Teknis</h3>
                  <p>Durasi pengalaman yang dipakai untuk pertanyaan role dan teknologi.</p>
                </div>
              </div>
              <div className="form-grid answer-bank-technical-grid">
                <AnswerSelect label="Frontend" name="frontendExperience" value={state.answerBank?.frontendExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Fullstack" name="fullstackExperience" value={state.answerBank?.fullstackExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Backend" name="backendExperience" value={state.answerBank?.backendExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="JavaScript" name="javascriptExperience" value={state.answerBank?.javascriptExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="React" name="reactExperience" value={state.answerBank?.reactExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="PHP" name="phpExperience" value={state.answerBank?.phpExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Laravel" name="laravelExperience" value={state.answerBank?.laravelExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Node.js" name="nodeExperience" value={state.answerBank?.nodeExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="SQL" name="sqlExperience" value={state.answerBank?.sqlExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="RDBMS" name="rdbmsExperience" value={state.answerBank?.rdbmsExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="GraphQL" name="graphqlExperience" value={state.answerBank?.graphqlExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Industri Computer Software" name="computerSoftwareExperience" value={state.answerBank?.computerSoftwareExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Industri Computer Networking" name="computerNetworkingExperience" value={state.answerBank?.computerNetworkingExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Industri Network Security" name="networkSecurityExperience" value={state.answerBank?.networkSecurityExperience} options={experienceOptions} onChange={updateAnswerBankField} />
                <label className="field">
                  <span>Database yang Dikuasai</span>
                  <MultiSoftSelect name="databases" value={state.answerBank?.databases || ""} options={databaseOptions} placeholder="Pilih database" onChange={updateAnswerBankField} />
                </label>
                <label className="field">
                  <span>Version Control</span>
                  <MultiSoftSelect name="versionControlTools" value={state.answerBank?.versionControlTools || ""} options={versionControlOptions} placeholder="Pilih version control" onChange={updateAnswerBankField} />
                </label>
              </div>
            </section>

            <section className="answer-bank-group answer-bank-wide-group">
              <div className="answer-bank-group-heading">
                <span>04</span>
                <div>
                  <h3>Level Jawaban Otomatis</h3>
                  <p>Fallback saat pertanyaan skill tidak menyebut teknologi secara spesifik.</p>
                </div>
              </div>
              <div className="form-grid answer-bank-level-grid">
                <AnswerSelect label="Skill Utama" name="primarySkillLevel" value={state.answerBank?.primarySkillLevel} options={skillLevelOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Skill Pendukung" name="secondarySkillLevel" value={state.answerBank?.secondarySkillLevel} options={skillLevelOptions} onChange={updateAnswerBankField} />
                <AnswerSelect label="Skill di Luar Portofolio" name="outOfPortfolioSkillLevel" value={state.answerBank?.outOfPortfolioSkillLevel} options={skillLevelOptions} onChange={updateAnswerBankField} />
              </div>
            </section>

            <section className="answer-bank-group answer-bank-wide-group answer-bank-cover-group">
              <div className="answer-bank-group-heading">
                <span>05</span>
                <div>
                  <h3>Cover Note Default</h3>
                  <p>Digunakan ketika form menyediakan pesan singkat atau cover letter.</p>
                </div>
              </div>
              <label className="field answer-note">
                <span>Isi Cover Note</span>
                <textarea name="defaultCoverNote" rows={5} value={state.answerBank?.defaultCoverNote || ""} onChange={updateAnswerBankField} />
              </label>
              <label className="field answer-note">
                <span>Jawaban Screening Fallback</span>
                <textarea name="fallbackScreeningAnswer" rows={3} value={state.answerBank?.fallbackScreeningAnswer || ""} onChange={updateAnswerBankField} />
                <small>Dipakai hanya untuk pertanyaan teks yang belum dikenali; tidak pernah menggantikan jawaban pengalaman atau cover letter.</small>
              </label>
            </section>

            <section className="answer-bank-group answer-bank-wide-group">
              <div className="answer-bank-group-heading">
                <span>06</span>
                <div>
                  <h3>Pertanyaan yang Pernah Ditemukan</h3>
                  <p>Worker mencatat pertanyaan baru dari setiap form dan menunjukkan jawaban Answer Bank yang dipakai.</p>
                </div>
              </div>
              <div className="run-log">
                {(state.answerBank?.discoveredQuestions || []).slice(0, 12).map((item) => (
                  <div key={item.id || `${item.source}-${item.question}`}>
                    <span>{item.source || "Portal"}</span>
                    <p>
                      {item.question}
                      <small>Jawaban: {item.mappedAnswerKey || "fallbackScreeningAnswer"} · ditemukan {item.count || 1}x</small>
                    </p>
                  </div>
                ))}
                {!state.answerBank?.discoveredQuestions?.length && <div className="empty-state compact-empty">Belum ada pertanyaan tercatat.</div>}
              </div>
            </section>
          </div>

          <div className="answer-bank-actions settings-actions">
            <div>
              <strong>Simpan sebelum menjalankan auto apply</strong>
              <span>Perubahan belum digunakan worker sampai pengaturan disimpan.</span>
            </div>
            <button className="primary-button" type="button" onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Answer Bank"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <span className="section-number">Q</span>
            <div>
              <h2>Queue Lamar Otomatis</h2>
              <p className="section-subtitle">Filter queue hanya untuk status yang relevan dengan proses otomatisasi.</p>
            </div>
          </div>
          {renderFilters(autoApplyStatusOptions)}
          {renderJobsTable(filteredAutoApplyJobs, "autoApply")}
        </section>
      </div>
    );
  }

  function renderSources() {
    return (
      <div className="auto-apply-layout">
        <section className="panel">
          <div className="section-heading">
            <span className="section-number">04</span>
            <div>
              <h2>Pengaturan Sumber</h2>
              <p className="section-subtitle">Atur portal, keyword, frekuensi scraping, dan guardrail otomatisasi.</p>
            </div>
          </div>

          <div className="form-grid two-columns">
            <label className="field">
              <span>Sumber Aktif</span>
              <MultiSoftSelect
                name="sources"
                value={state.rules?.sources || ""}
                options={scrapingSourceOptions}
                placeholder="Pilih website sumber"
                maxSelections={3}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Target Role</span>
              <MultiSoftSelect
                name="keywords"
                value={state.rules?.keywords || ""}
                options={keywordPresetOptions}
                placeholder="Pilih satu atau beberapa role"
                maxSelections={8}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Frekuensi Scraping</span>
              <SoftSelect
                name="scrapingFrequency"
                value={state.rules?.scrapingFrequency || "Manual"}
                options={scrapingFrequencyOptions}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Target Lokasi</span>
              <MultiSoftSelect
                name="targetLocation"
                value={state.rules?.targetLocation || ""}
                options={targetLocationOptions}
                placeholder="Pilih satu atau beberapa lokasi"
                maxSelections={6}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>BrowserAct Browser ID</span>
              <input name="browserActBrowserId" value={state.rules?.browserActBrowserId || ""} onChange={updateRuleField} />
            </label>
            <label className="field">
              <span>Scrape Limit</span>
              <SoftSelect
                name="scrapeLimitPerRun"
                value={state.rules?.scrapeLimitPerRun || "40"}
                options={scrapeLimitOptions}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Auto Apply Limit</span>
              <SoftSelect
                name="autoApplyLimitPerRun"
                value={state.rules?.autoApplyLimitPerRun || "5"}
                options={autoApplyLimitOptions}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Blacklist Companies</span>
              <input name="blacklistCompanies" value={state.rules?.blacklistCompanies || ""} onChange={updateRuleField} />
            </label>
          </div>

          <div className="rule-grid">
            {[
              ["skipUnpaid", "Skip unpaid jobs"],
              ["skipSeniorLead", "Skip senior/lead roles"],
              ["skipDominantJavaGolangDotnet", "Skip dominant Java/Golang/.NET roles"],
              ["skipOutsideTargetLocation", "Skip outside target location"],
              ["skipWithoutCv", "Skip job jika CV tidak tersedia"],
              ["pauseOnCaptchaOrVerification", "Skip job jika CAPTCHA/verifikasi memblokir"],
              ["autoQueueImportedJobs", "Auto queue imported/scraped jobs"],
            ].map(([name, label]) => (
              <label className="check-field" key={name}>
                <input type="checkbox" name={name} checked={Boolean(state.rules?.[name])} onChange={updateRuleField} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="action-row settings-actions">
            <button className="primary-button" type="button" onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
          {renderStatus()}
        </section>

        <section className="panel">
          <div className="section-heading">
            <span className="section-number">I</span>
            <div>
              <h2>Scraping Lowongan</h2>
              <p className="section-subtitle">Ambil lowongan dari Glints, JobStreet, dan LinkedIn Easy Apply lalu auto queue jika lolos filter.</p>
            </div>
          </div>
          {renderScrapeToolbar()}
        </section>
      </div>
    );
  }

  if (view === "applications") return renderApplications();
  if (view === "autoApply") return renderAutoApply();
  if (view === "sources") return renderSources();
  return renderJobsExplorer();
}
