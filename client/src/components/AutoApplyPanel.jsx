import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bookmark,
  BriefcaseBusiness,
  CheckSquare,
  FileText,
  MapPin,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  deleteAutoApplyJob,
  deleteAutoApplyJobs,
  getAutoApplyState,
  prepareAutoApplyRun,
  queueEligibleAutoApplyJobs,
  runAutoApply,
  saveAutoApplySettings,
  scrapeAutoApplyJobs,
  stopAutoApply,
  updateAutoApplyJob,
} from "../api/client.js";

function JobSkills({ skills, compact }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSkills = compact && !expanded ? skills.slice(0, 3) : skills;

  return (
    <div className="job-skill-row">
      <span>Skill cocok</span>
      <div>
        {visibleSkills.map((skill) => <em key={skill}>{skill}</em>)}
        {compact && skills.length > 3 && (
          <button
            type="button"
            className="skill-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Lebih sedikit" : `+${skills.length - 3} lainnya`}
          </button>
        )}
      </div>
    </div>
  );
}

function formatSalary(value) {
  if (!value?.trim()) return "Tidak ditampilkan";
  return value.trim()
    .replace(/(\d[\d.,]*)\s*(?:[-–—]|sampai|hingga|to)\s*(?=(?:Rp\s*)?\d)/gi, "$1 - ")
    .replace(/(\d[\d.,]*)\s+(?=(?:Rp\s*)?\d)/g, "$1 - ")
    .replace(/\bRp\s*(?=\d)/gi, "Rp ")
    .replace(/\s*\/\s*bulan/gi, " / bulan");
}

const jobStatusOptions = ["Disimpan", "Siap Dilamar", "Sudah Dilamar"];
const applicationStatusOptions = ["All", "Sudah Dilamar"];
const autoApplyStatusOptions = ["All", "Siap Dilamar"];
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
    const key = job.pipelineStatus || "Disimpan";
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
  const appliedStatuses = new Set(["sudah dilamar", "applied", "interview", "offer", "rejected"]);
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
  return normalizeStatus(job.pipelineStatus) === "sudah dilamar";
}

function isAutoApplyQueue(job) {
  return normalizeStatus(job.pipelineStatus) === "siap dilamar";
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

function JobSourceLogo({ job }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = job.companyLogoUrl || job.logoUrl || job.logo || "";

  return (
    <div className={`job-source-mark source-${sourceClass(job.source)}`} aria-label={`Logo ${job.company || job.source || "perusahaan"}`}>
      {logoUrl && !imageFailed ? (
        <img src={logoUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
      ) : (
        <span aria-hidden="true">{sourceMark(job.source)}</span>
      )}
    </div>
  );
}

function formatRelativeTime(value) {
  const time = new Date(value || "").getTime();
  if (Number.isNaN(time)) return "Baru saja";

  const elapsedHours = Math.max(1, Math.floor((Date.now() - time) / 3600000));
  if (elapsedHours < 24) return `${elapsedHours} jam yang lalu`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} hari yang lalu`;
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
  if (value === "siap dilamar") return "ready";
  if (value === "sudah dilamar") return "applied-tag";
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

const REJECTION_LABELS = {
  alreadyApplied: "Sudah pernah dilamar",
  closedJob: "Lowongan sudah ditutup",
  keywordMismatch: "Keyword tidak cocok",
  outsideTargetLocation: "Lokasi di luar target",
  missingLocation: "Lokasi tidak terbaca",
};

function RejectionGroup({ reasonKey, count, items }) {
  const [open, setOpen] = useState(false);
  const label = REJECTION_LABELS[reasonKey] || reasonKey;

  return (
    <div className={`rejection-group${open ? " is-open" : ""}`} data-reason={reasonKey}>
      <button type="button" className="rejection-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="rejection-dot" aria-hidden="true" />
        <span className="rejection-label">{label}</span>
        <em className="rejection-count">{count}</em>
        <span className="rejection-caret" aria-hidden="true">{"\u25b8"}</span>
      </button>
      {open && (
        <div className="rejection-detail">
          {items.length === 0 ? (
            <p className="modal-note">Detail per lowongan tidak tersimpan untuk kategori ini.</p>
          ) : (
            <ul className="rejection-job-list">
              {items.map((item, index) => (
                <li key={`${item.jobUrl || item.jobTitle}-${index}`}>
                  <div className="rejection-job-head">
                    {item.jobUrl ? (
                      <a href={item.jobUrl} target="_blank" rel="noreferrer">{item.jobTitle || "(tanpa judul)"}</a>
                    ) : (
                      <strong>{item.jobTitle || "(tanpa judul)"}</strong>
                    )}
                    <small>{[item.company, item.source, item.location].filter(Boolean).join(" \u00b7 ")}</small>
                  </div>
                  <p className="rejection-why">{item.detail}</p>
                  {(item.missingKeywords || []).length > 0 && (
                    <div className="modal-chip-row">
                      <span className="rejection-why-label">Keyword hilang:</span>
                      {item.missingKeywords.map((word) => (
                        <span className="modal-chip modal-chip-warning" key={word}>{word}</span>
                      ))}
                    </div>
                  )}
                  {item.keyword && <small className="rejection-source-keyword">Dicari dengan: {item.keyword}</small>}
                </li>
              ))}
            </ul>
          )}
          {count > items.length && (
            <p className="modal-note">Menampilkan {items.length} dari {count} lowongan.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ScrapeReportModal({ report, onClose }) {
  const [showRejections, setShowRejections] = useState(true);
  const rejected = report.rejectionBreakdown || {};
  const queued = report.autoQueue || { queued: 0, skipped: 0 };
  const imported = report.importSummary || { imported: 0, updated: 0 };
  const samples = report.rejectionSamples || [];
  const missingTerms = report.keywordMissingTerms || [];
  const scrapeErrors = report.errors || [];

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const groups = Object.keys(REJECTION_LABELS)
    .map((key) => ({
      key,
      count: rejected[key] || 0,
      items: samples.filter((item) => item.reason === key),
    }))
    .filter((group) => group.count > 0);

  const stats = [
    { label: "Ditemukan", value: report.extracted || 0 },
    { label: "Detail terbaca", value: `${report.detailsEnriched || 0}/${report.detailsAttempted || 0}` },
    { label: "Lolos filter", value: report.matchedFilters || 0, accent: true },
    { label: "Tidak sesuai", value: report.filteredOut || 0, expandable: true },
    { label: "Duplikat", value: report.duplicatesRemoved || 0 },
    { label: "Lowongan baru", value: imported.imported || 0 },
    { label: "Masuk queue", value: queued.queued || 0, accent: true },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scrape-report-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-head-icon" aria-hidden="true">{"\u2691"}</span>
          <div className="modal-head-text">
            <h3 id="scrape-report-title">Hasil Scraping</h3>
            <p className="section-subtitle">Ringkasan lengkap plus alasan tiap lowongan tersaring.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Tutup" onClick={onClose}>{"\u00d7"}</button>
        </div>

        <div className="modal-body">
          <div className="modal-stat-grid">
            {stats.map((stat) =>
              stat.expandable && groups.length > 0 ? (
                <button
                  type="button"
                  key={stat.label}
                  className={`modal-stat modal-stat-button${showRejections ? " is-open" : ""}`}
                  aria-expanded={showRejections}
                  onClick={() => setShowRejections((value) => !value)}
                >
                  <strong>{stat.value}</strong>
                  <small>
                    {stat.label}
                    <span className="modal-stat-caret" aria-hidden="true">{"\u25b8"}</span>
                  </small>
                </button>
              ) : (
                <div className={`modal-stat${stat.accent ? " modal-stat-accent" : ""}`} key={stat.label}>
                  <strong>{stat.value}</strong>
                  <small>{stat.label}</small>
                </div>
              )
            )}
          </div>

          {report.detailLimitReached && (
            <p className="modal-note">Batas pemeriksaan {report.detailLimit} halaman detail tercapai.</p>
          )}
          {scrapeErrors.length > 0 && (
            <p className="modal-note modal-note-warning">
              {scrapeErrors.length} pencarian gagal. {scrapeErrors[0].source}: {scrapeErrors[0].error}
            </p>
          )}

          {showRejections && groups.length > 0 && (
            <section className="modal-section">
              <h4>Alasan tidak sesuai</h4>
              <div className="rejection-list">
                {groups.map((group) => (
                  <RejectionGroup key={group.key} reasonKey={group.key} count={group.count} items={group.items} />
                ))}
              </div>
            </section>
          )}

          {missingTerms.length > 0 && (
            <section className="modal-section">
              <h4>Keyword yang paling sering tidak cocok</h4>
              <div className="modal-chip-row">
                {missingTerms.map((item) => (
                  <span className="modal-chip" key={item.term}>
                    {item.term}
                    <em>{item.count}</em>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="modal-foot">
          <p className="modal-foot-hint">Tekan Esc atau klik di luar untuk menutup.</p>
          <button type="button" className="primary-button" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
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
  const [scrapeReport, setScrapeReport] = useState(null);
  const [scrapeReportOpen, setScrapeReportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [deletingJobs, setDeletingJobs] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedSource, setSelectedSource] = useState("All");
  const [search, setSearch] = useState("");
  const [exploreLocation, setExploreLocation] = useState("Semua Lokasi");
  const [exploreEmploymentType, setExploreEmploymentType] = useState("Semua Tipe");
  const [exploreLevel, setExploreLevel] = useState("Semua Level");
  const [exploreSort, setExploreSort] = useState("Terbaru");
  const [autoApplySection, setAutoApplySection] = useState("queue");
  const [tablePages, setTablePages] = useState({
    explore: 1,
    applications: 1,
    autoApply: 1,
  });

  const counts = useMemo(() => countByStatus(state.jobs || []), [state.jobs]);
  const autoApplyActive = ["starting", "running"].includes(normalizeStatus(state.automationRun?.status));
  const applicationJobs = useMemo(() => sortNewestAppliedFirst((state.jobs || []).filter(isApplication)), [state.jobs]);
  const readyJobs = useMemo(() => (state.jobs || []).filter((job) => job.pipelineStatus === "Siap Dilamar"), [state.jobs]);
  const readyJobsForSelectedSource = useMemo(
    () => readyJobs.filter(
      (job) =>
        ["", "queued"].includes(normalizeStatus(job.automationStatus)) &&
        (selectedSource === "All" || normalizeStatus(job.source) === normalizeStatus(selectedSource))
    ),
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

  const exploreLocationOptions = useMemo(
    () => ["Semua Lokasi", ...new Set(exploreJobs.map((job) => job.location).filter(Boolean))],
    [exploreJobs]
  );
  const exploreEmploymentOptions = useMemo(
    () => ["Semua Tipe", ...new Set(exploreJobs.map((job) => job.employmentType).filter(Boolean))],
    [exploreJobs]
  );
  const responseCount = useMemo(
    () => applicationJobs.filter((job) => job.responseStatus && !/belum ada|menunggu/i.test(job.responseStatus)).length,
    [applicationJobs]
  );

  const filteredExploreJobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filteredJobs = exploreJobs.filter((job) => {
      const locationMatch = exploreLocation === "Semua Lokasi" || job.location === exploreLocation;
      const employmentMatch = exploreEmploymentType === "Semua Tipe" || job.employmentType === exploreEmploymentType;
      const detectedLevel = job.experienceLevel || job.seniorityLevel || "";
      const levelMatch = exploreLevel === "Semua Level" || normalizeStatus(detectedLevel).includes(normalizeStatus(exploreLevel.replace(" Level", "")));
      return locationMatch && employmentMatch && levelMatch && matchesJobSearch(job, query);
    });

    return [...filteredJobs].sort((first, second) => {
      if (exploreSort === "A-Z") return String(first.jobTitle || "").localeCompare(String(second.jobTitle || ""));
      if (exploreSort === "Gaji Tertinggi") return String(second.salaryRaw || "").localeCompare(String(first.salaryRaw || ""), undefined, { numeric: true });
      return dateValue(second.createdAt || second.updatedAt) - dateValue(first.createdAt || first.updatedAt);
    });
  }, [exploreJobs, search, exploreLocation, exploreEmploymentType, exploreLevel, exploreSort]);

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
    setStatus({ type: "", message: "" });
    setSelectionMode(false);
    setSelectedJobIds([]);
  }, [view]);

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
    setSelectionMode(false);
    setSelectedJobIds([]);
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
        patch.pipelineStatus === "Sudah Dilamar" && !patch.appliedAt
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
        message: `${summary.considered} lowongan diperiksa: ${summary.queued} menjadi Siap Dilamar, ${summary.skipped} tetap Disimpan karena tidak lolos filter.`,
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
      const scrapeErrors = scrape.errors || [];
      setScrapeReport({ ...scrape, importSummary: imported });
      setScrapeReportOpen(true);
      setStatus({
        type: scrape.matchedFilters && !scrapeErrors.length ? "success" : "warning",
        message: `Scraping selesai: ${scrape.extracted} ditemukan, ${scrape.matchedFilters} lolos filter, ${imported.imported} baru, ${queued.queued} masuk queue.`,
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
    const statusLabels = {
      idle: "Belum berjalan",
      starting: "Menyiapkan",
      running: "Sedang berjalan",
      stopped: "Dihentikan",
      completed: "Selesai",
      completed_with_errors: "Selesai dengan catatan",
      blocked: "Perlu tindakan",
      failed: "Gagal",
    };
    const runStatus = normalizeStatus(run.status) || "idle";

    return (
      <div className="run-progress">
        <div className="run-progress-header">
          <div>
            <strong><i className={`run-status-dot ${runStatus}`} />{statusLabels[runStatus] || run.status}</strong>
            <span>{run.message || "Menunggu proses."}</span>
          </div>
          <small>{percent}%</small>
        </div>
        <div className="progress-track" aria-label="Progress auto apply">
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="run-stats">
          <div><strong>{processed}/{total}</strong><span>Diproses</span></div>
          <div><strong>{run.applied || 0}</strong><span>Berhasil</span></div>
          <div><strong>{run.skipped || 0}</strong><span>Perlu ditinjau</span></div>
          <div><strong>{run.failed || 0}</strong><span>Gagal</span></div>
        </div>
        {(run.currentJobTitle || run.currentCompany) && (
          <div className="current-job">
            <span>Sedang diproses</span>
            <strong>{run.currentCompany || "-"} · {run.currentJobTitle || "-"}</strong>
          </div>
        )}
        {(detailItems.length > 0 || logs.length > 0) && (
          <details className="run-technical-details">
            <summary>Detail aktivitas <span>{logs.length}</span></summary>
            {detailItems.length > 0 && (
              <div className="run-detail-grid">
                {detailItems.map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            )}
            <div className="run-log">
              {logs.slice(0, 10).map((log) => {
                const detail = formatLogData(log.data);
                return (
                  <div key={log.id}>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                    <p>{log.message}{detail && <small>{detail}</small>}</p>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    );
  }

  function renderSummary(variant = "default") {
    if (variant === "explore") {
      const metrics = [
        { Icon: BriefcaseBusiness, label: "Total Lowongan", value: state.jobs?.length || 0, note: "data saat ini" },
        { Icon: FileText, label: "Disimpan", value: counts.Disimpan || 0, note: "siap ditinjau" },
        { Icon: Send, label: "Sudah Dilamar", value: counts["Sudah Dilamar"] || 0, note: "lamaran terkirim" },
        { Icon: Star, label: "Respons", value: responseCount, note: "respons diterima" },
      ];

      return (
        <div className="auto-summary-grid explore-summary-grid">
          {metrics.map(({ Icon, ...metric }) => (
            <div className="metric-card explore-metric-card" key={metric.label}>
              <span className="metric-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span>
              <div className="metric-content">
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <em><b>↗</b> {metric.note}</em>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="auto-summary-grid">
        <div className="metric-card">
          <span>{state.jobs?.length || 0}</span>
          <small>Total lowongan</small>
        </div>
        <div className="metric-card">
          <span>{counts.Disimpan || 0}</span>
          <small>Disimpan</small>
        </div>
        <div className="metric-card">
          <span>{readyJobs.length}</span>
          <small>Siap dilamar</small>
        </div>
        <div className="metric-card">
          <span>{counts["Sudah Dilamar"] || 0}</span>
          <small>Sudah dilamar</small>
        </div>
      </div>
    );
  }

  function renderStatus() {
    if (!status.message) return null;
    return (
      <p role="status" aria-live="polite" className={`status ${status.type}`}>
        <span>{status.message}</span>
        {scrapeReport && (
          <button type="button" className="status-detail-button" onClick={() => setScrapeReportOpen(true)}>
            Lihat detail
          </button>
        )}
      </p>
    );
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

  function toggleJobSelection(jobId) {
    setSelectedJobIds((current) =>
      current.includes(jobId)
        ? current.filter((selectedId) => selectedId !== jobId)
        : [...current, jobId]
    );
  }

  function closeSelectionMode() {
    setSelectionMode(false);
    setSelectedJobIds([]);
  }

  async function handleDeleteJob(job) {
    const title = job.jobTitle || "lowongan ini";
    if (!window.confirm(`Hapus ${title}? Lowongan yang dihapus tidak dapat dikembalikan.`)) return;

    try {
      setDeletingJobs(true);
      const response = await deleteAutoApplyJob(job.id);
      setState(response.data);
      setSelectedJobIds((current) => current.filter((jobId) => jobId !== job.id));
      setStatus({ type: "success", message: `Lowongan ${title} berhasil dihapus.` });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setDeletingJobs(false);
    }
  }

  async function handleDeleteSelected(jobIds) {
    if (!jobIds.length) return;
    if (!window.confirm(`Hapus ${jobIds.length} lowongan terpilih? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      setDeletingJobs(true);
      const response = await deleteAutoApplyJobs(jobIds);
      setState(response.data);
      closeSelectionMode();
      setStatus({
        type: "success",
        message: `${response.data.deleteSummary.deleted} lowongan berhasil dihapus.`,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setDeletingJobs(false);
    }
  }

  function renderExploreFilters() {
    return (
      <div className="explore-filter-bar">
        <label className="explore-search-field">
          <Search className="filter-icon" aria-hidden="true" size={19} strokeWidth={1.8} />
          <span className="sr-only">Cari lowongan</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari posisi, perusahaan, atau kata kunci..."
          />
        </label>
        <label className="explore-select-field location-filter">
          <MapPin className="filter-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="sr-only">Lokasi</span>
          <SoftSelect value={exploreLocation} options={exploreLocationOptions} onValueChange={setExploreLocation} />
        </label>
        <label className="explore-select-field type-filter">
          <BriefcaseBusiness className="filter-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="sr-only">Tipe pekerjaan</span>
          <SoftSelect value={exploreEmploymentType} options={exploreEmploymentOptions} onValueChange={setExploreEmploymentType} />
        </label>
        <label className="explore-select-field level-filter">
          <BarChart3 className="filter-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="sr-only">Level pekerjaan</span>
          <SoftSelect value={exploreLevel} options={["Semua Level", "Entry Level", "Junior Level", "Mid Level", "Senior Level"]} onValueChange={setExploreLevel} />
        </label>
        <label className="explore-select-field sort-filter">
          <SlidersHorizontal className="filter-icon" aria-hidden="true" size={18} strokeWidth={1.8} />
          <span className="sr-only">Urutkan lowongan</span>
          <SoftSelect value={exploreSort} options={["Terbaru", "A-Z", "Gaji Tertinggi"]} onValueChange={setExploreSort} />
        </label>
      </div>
    );
  }

  function renderScrapeToolbar() {
    return (
      <div className="auto-toolbar">
        <button className="primary-button" type="button" onClick={handleScrapeWebsites} disabled={loading || scraping}>
          {scraping ? "Mencari lowongan..." : "Cari lowongan baru"}
        </button>
        <button className="secondary-button" type="button" onClick={handleQueueAllEligibleJobs} disabled={loading || !state.jobs?.length}>
          Siapkan yang lolos filter
        </button>
        <button className="secondary-button" type="button" onClick={loadState} disabled={loading}>
          Refresh
        </button>
      </div>
    );
  }

  function renderJobsTable(jobs, mode = "explore") {
    if (loading) return <div className="empty-state">Memuat data...</div>;
    if (!jobs.length) return (
      <div className="empty-state">
        <strong>{mode === "explore" ? "Belum ada lowongan yang ditampilkan" : "Belum ada lamaran pada tampilan ini"}</strong>
        <p>{mode === "explore" ? "Klik Cari lowongan baru untuk mulai, atau sesuaikan filter jika Anda sudah memiliki lowongan." : "Lowongan yang Anda proses akan muncul di sini. Coba periksa filter yang dipilih."}</p>
      </div>
    );

    const showAppliedAt = mode !== "explore";
    const totalPages = Math.max(1, Math.ceil(jobs.length / TABLE_PAGE_SIZE));
    const currentPage = Math.min(tablePages[mode] || 1, totalPages);
    const startIndex = (currentPage - 1) * TABLE_PAGE_SIZE;
    const visibleJobs = jobs.slice(startIndex, startIndex + TABLE_PAGE_SIZE);
    const endIndex = Math.min(startIndex + visibleJobs.length, jobs.length);
    const jobIds = jobs.map((job) => job.id);
    const selectedInView = selectedJobIds.filter((jobId) => jobIds.includes(jobId));
    const allSelected = jobIds.length > 0 && selectedInView.length === jobIds.length;

    function toggleAllJobs() {
      if (allSelected) {
        setSelectedJobIds((current) => current.filter((jobId) => !jobIds.includes(jobId)));
        return;
      }
      setSelectedJobIds((current) => [...new Set([...current, ...jobIds])]);
    }

    return (
      <div className="table-block">
        <div className={`job-selection-toolbar ${selectionMode ? "is-active" : ""}`}>
          <div>
            <button
              className="selection-mode-button"
              type="button"
              onClick={() => selectionMode ? closeSelectionMode() : setSelectionMode(true)}
              disabled={deletingJobs || autoApplyActive}
              title={autoApplyActive ? "Hentikan auto apply sebelum menghapus lowongan" : undefined}
            >
              <CheckSquare aria-hidden="true" size={17} strokeWidth={1.8} />
              {selectionMode ? "Batal memilih" : "Pilih lowongan"}
            </button>
            {selectionMode && <span>{selectedInView.length} dari {jobs.length} dipilih</span>}
          </div>
          {selectionMode && (
            <div>
              <button className="selection-all-button" type="button" onClick={toggleAllJobs} disabled={deletingJobs || autoApplyActive}>
                {allSelected ? "Batalkan semua" : "Pilih semua hasil"}
              </button>
              <button
                className="selection-delete-button"
                type="button"
                onClick={() => handleDeleteSelected(selectedInView)}
                disabled={deletingJobs || autoApplyActive || !selectedInView.length}
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={1.8} />
                {deletingJobs ? "Menghapus..." : `Hapus terpilih${selectedInView.length ? ` (${selectedInView.length})` : ""}`}
              </button>
            </div>
          )}
        </div>
        <div className={`job-list job-list-${mode}`}>
          {visibleJobs.map((job) => {
            const filterReasons = filterReasonsForJob(job);
            const showFilterReasons = normalizeStatus(job.pipelineStatus) === "disimpan" && filterReasons.length > 0;
            const normalizedJobStatus = normalizeStatus(job.pipelineStatus);
            const automationStatus = normalizeStatus(job.automationStatus);
            const skills = splitJobSkills(job.matchedPortfolioSkills);
            const isQueued = normalizedJobStatus === "siap dilamar";
            const showQueueAction = mode === "explore" && normalizedJobStatus === "disimpan";
            const showRetryAction = mode === "autoApply" && ["failed", "needs_review"].includes(automationStatus);
            const compactCard = true;
            const contextLabel = mode === "applications" ? "Status respons" : mode === "autoApply" ? "Langkah berikutnya" : "Kecocokan pencarian";
            const contextValue =
              mode === "applications"
                ? job.responseStatus || job.nextAction || "Menunggu pembaruan"
                : mode === "autoApply"
                  ? job.nextAction || "Menunggu worker auto apply"
                  : isQueued
                    ? "Sudah di antrean. Pantau proses di Lamar Otomatis."
                    : job.matchedQuery || "Tinjau detail lowongan sebelum masuk antrean.";

            if (mode === "explore") {
              const jobLevel = job.experienceLevel || job.seniorityLevel || "Level belum tersedia";
              const jobDescription = String(job.jobDescription || job.notes || "Tinjau detail lowongan dan persyaratan lengkap pada halaman perusahaan.").trim();
              const exploreStatus = normalizedJobStatus === "siap dilamar" ? "Siap Dilamar" : normalizedJobStatus === "sudah dilamar" ? "Sudah Dilamar" : "Baru";
              const exploreStatusTone = normalizedJobStatus === "siap dilamar" ? "is-ready" : normalizedJobStatus === "sudah dilamar" ? "is-applied" : "is-new";

              return (
                <article className={`job-card job-card-explore ${selectionMode ? "is-selecting" : ""} ${selectedJobIds.includes(job.id) ? "is-selected" : ""}`} key={job.id}>
                  {selectionMode && (
                    <label className="job-selection-check">
                      <input
                        type="checkbox"
                        checked={selectedJobIds.includes(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                      />
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Pilih {job.jobTitle || "lowongan"}</span>
                    </label>
                  )}
                  <JobSourceLogo job={job} />

                  <div className="explore-job-content">
                    {job.jobUrl ? (
                      <a className="job-title-link" href={job.jobUrl} target="_blank" rel="noreferrer">
                        {job.jobTitle || "Posisi belum tersedia"}
                      </a>
                    ) : (
                      <strong className="job-title-link">{job.jobTitle || "Posisi belum tersedia"}</strong>
                    )}
                    <p className="explore-job-company">{job.company || "Perusahaan belum terbaca"}</p>

                    <div className="explore-job-meta">
                      <span><MapPin className="meta-icon" aria-hidden="true" />{job.location || "Lokasi belum tersedia"}</span>
                      <span><BriefcaseBusiness className="meta-icon" aria-hidden="true" />{job.employmentType || "Tipe belum tersedia"}</span>
                      <span><BarChart3 className="meta-icon" aria-hidden="true" />{jobLevel}</span>
                      <span><WalletCards className="meta-icon" aria-hidden="true" />{formatSalary(job.salaryRaw)}</span>
                    </div>

                    <p className="explore-job-description">{jobDescription}</p>
                    {skills.length > 0 && <JobSkills skills={skills} compact />}
                  </div>

                  <div className="explore-job-side">
                    <div className="explore-status-row">
                      <span className={`explore-status ${exploreStatusTone}`}><i />{exploreStatus}</span>
                      <time>{formatRelativeTime(job.createdAt || job.updatedAt)}</time>
                      {!selectionMode && (
                        <button
                          className="job-delete-icon"
                          type="button"
                          onClick={() => handleDeleteJob(job)}
                          disabled={deletingJobs || autoApplyActive}
                          aria-label={`Hapus ${job.jobTitle || "lowongan"}`}
                          title="Hapus lowongan"
                        >
                          <Trash2 aria-hidden="true" size={17} strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                    <div className="explore-card-actions">
                      <button
                        className="job-action explore-save-action"
                        type="button"
                        onClick={() => patchJob(job.id, { pipelineStatus: "Disimpan" }, "Lowongan disimpan.")}
                      >
                        <Bookmark aria-hidden="true" size={16} strokeWidth={1.8} />
                        Simpan
                      </button>
                      {job.jobUrl ? (
                        <a className="job-action job-action-primary" href={job.jobUrl} target="_blank" rel="noreferrer">Lamar Sekarang</a>
                      ) : (
                        <button className="job-action job-action-primary" type="button" onClick={() => patchJob(job.id, { pipelineStatus: "Siap Dilamar" }, "Lowongan siap dilamar.")}>Lamar Sekarang</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            }

            return (
            <article className={`job-card job-card-${mode} ${selectionMode ? "is-selecting" : ""} ${selectedJobIds.includes(job.id) ? "is-selected" : ""}`} key={job.id}>
              {selectionMode && (
                <label className="job-selection-check">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.includes(job.id)}
                    onChange={() => toggleJobSelection(job.id)}
                  />
                  <span aria-hidden="true">✓</span>
                  <span className="sr-only">Pilih {job.jobTitle || "lowongan"}</span>
                </label>
              )}
              <header className="job-card-header">
                <div className={`job-source-mark source-${sourceClass(job.source)}`} aria-hidden="true">
                  {sourceMark(job.source)}
                </div>
                <div className="job-heading">
                  <div className="job-card-eyebrow">
                    <span>{job.source || "Manual"}</span>
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
                    <span className={`tag ${statusClass(job.pipelineStatus)}`}>{job.pipelineStatus || "Disimpan"}</span>
                  </div>

                </div>
              </header>

              {compactCard ? (
                <div className="compact-job-info">
                  <strong className="compact-salary">{formatSalary(job.salaryRaw)}</strong>
                  <span className="compact-location">{job.location || "Lokasi belum tersedia"}</span>
                  <div className="compact-work-tags">
                    {[job.employmentType, job.workArrangement].filter(Boolean).map((value, index) => <span key={index}>{value}</span>)}
                  </div>
                </div>
              ) : (
              <div className="job-facts">
                <div>
                  <span>Lokasi</span>
                  <strong>{job.location || "Belum terbaca"}</strong>
                </div>
                <div>
                  <span>Gaji</span>
                  <strong>{formatSalary(job.salaryRaw)}</strong>
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

              )}
              {skills.length > 0 && <JobSkills skills={skills} compact={compactCard} />}

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

              {mode === "autoApply" && (
                <div className="auto-queue-note">
                  <span>Proses</span>
                  <p>{contextValue}</p>
                </div>
              )}

              <footer className="job-card-footer">
                {mode === "applications" && <div className="job-context">
                  <span>{mode === "explore" && isQueued ? "Langkah berikutnya" : contextLabel}</span>
                  <strong>{contextValue}</strong>
                  {showAppliedAt && job.appliedAt && <small>Dilamar {formatDateTime(job.appliedAt)}</small>}
                </div>
                }
                <div className="job-card-actions">
                  {job.jobUrl && (
                    <a className="job-action job-action-detail" href={job.jobUrl} target="_blank" rel="noreferrer">
                      Buka detail
                    </a>
                  )}
                  {showQueueAction && (
                    <button className="job-action job-action-primary" type="button" onClick={() => patchJob(job.id, { pipelineStatus: "Siap Dilamar" }, "Lowongan siap diproses di Lamar Otomatis.")}>
                      Siapkan
                    </button>
                  )}
                  {showRetryAction && (
                    <button
                      className="job-action job-action-primary"
                      type="button"
                      onClick={() => patchJob(job.id, { automationStatus: "queued", nextAction: "Siap dicoba kembali oleh BrowserAct" }, "Lowongan siap dicoba kembali.")}
                    >
                      Coba lagi
                    </button>
                  )}
                  {!selectionMode && (
                    <button className="job-action job-action-delete" type="button" onClick={() => handleDeleteJob(job)} disabled={deletingJobs || autoApplyActive}>
                      <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
                      Hapus
                    </button>
                  )}
                  <details className="job-manage">
                    <summary className="job-action" aria-label="Kelola lowongan">Kelola</summary>
                    <div className="job-manage-content">
                      <span className="job-manage-label">Ubah status</span>
                  <SoftSelect
                    className="status-soft-select"
                    value={job.pipelineStatus || "Disimpan"}
                    options={jobStatusOptions}
                    onValueChange={(nextStatus) => patchJob(job.id, { pipelineStatus: nextStatus }, `Status diubah ke ${nextStatus}.`)}
                  />
                    </div>
                  </details>
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
        <section className="explorer-overview" aria-labelledby="explorer-title">
          <div className="explorer-title-row">
            <div>
              <h1 id="explorer-title">Lowongan</h1>
              <p>Temukan dan siapkan peluang yang cocok untuk Anda.</p>
            </div>
            <button className="primary-button" type="button" onClick={handleScrapeWebsites} disabled={loading || scraping}>
              {scraping ? "Mencari lowongan..." : "+ Cari lowongan baru"}
            </button>
          </div>
          {renderSummary("explore")}
          {renderStatus()}
        </section>

        <section className="explore-results" aria-label={`${filteredExploreJobs.length} lowongan ditemukan`}>
          {renderExploreFilters()}
          {renderJobsTable(filteredExploreJobs, "explore")}
        </section>
      </div>
    );
  }

  function renderApplications() {
    return (
      <div className="auto-apply-layout">
        <section className="explorer-overview" aria-labelledby="applications-title">
          <div className="explorer-title-row">
            <div>
              <h1 id="applications-title">Lamaran Saya</h1>
              <p>Lamaran terbaru tampil paling atas, lengkap dengan waktu apply.</p>
            </div>
            <button className="primary-button" type="button" onClick={loadState} disabled={loading}>
              {loading ? "Memuat..." : "Perbarui data"}
            </button>
          </div>
          {renderSummary()}
          {renderStatus()}
        </section>

        <section className="panel">
          <div className="home-results-heading">
            <div><h2>Daftar lamaran <span className="result-count">{filteredApplicationJobs.length}</span></h2></div>
          </div>
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
        <section className="explorer-overview" aria-labelledby="auto-apply-title">
          <div className="explorer-title-row">
            <div>
              <h1 id="auto-apply-title">Lamar Otomatis</h1>
              <p>Kelola antrean, pantau proses, dan siapkan jawaban screening.</p>
            </div>
            <div className="auto-apply-ready-count">
              <strong>{readyJobsForSelectedSource.length}</strong>
              <span>siap diproses</span>
            </div>
          </div>
          {renderSummary()}
        </section>

        <div className="auto-apply-section-tabs" role="tablist" aria-label="Bagian Lamar Otomatis">
          <button
            type="button"
            role="tab"
            aria-selected={autoApplySection === "queue"}
            className={autoApplySection === "queue" ? "active" : ""}
            onClick={() => setAutoApplySection("queue")}
          >
            Antrean & Progres
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={autoApplySection === "answers"}
            className={autoApplySection === "answers" ? "active" : ""}
            onClick={() => setAutoApplySection("answers")}
          >
            Answer Bank
            <span>{answerCompletion}%</span>
          </button>
        </div>

        {autoApplySection === "queue" && <>
        <section className="panel auto-apply-control">
          <div className="queue-control-heading">
            <div>
              <h2>Jalankan antrean</h2>
              <p>Pilih sumber lowongan, lalu jalankan lamaran yang sudah siap.</p>
            </div>
            <button
              className={`answer-readiness-chip ${answerCompletion === 100 ? "is-complete" : ""}`}
              type="button"
              onClick={() => setAutoApplySection("answers")}
              aria-label={`Buka Answer Bank, ${answerCompletion}% lengkap`}
            >
              <span className="answer-readiness-dot" aria-hidden="true" />
              <span>Answer Bank</span>
              <strong>{answerCompletion}%</strong>
            </button>
          </div>

          <div className="queue-control-body">
            <div className="queue-source-control">
              <span>Sumber lowongan</span>
              <SoftSelect value={selectedSource} options={sourceOptions} onValueChange={setSelectedSource} />
            </div>
            <div className="queue-ready-summary" aria-live="polite">
              <strong>{readyJobsForSelectedSource.length}</strong>
              <span>lowongan siap diproses</span>
            </div>
            <button className="primary-button queue-run-button" type="button" onClick={handleRunAutoApply} disabled={runningApply || autoApplyIsActive || !readyJobsForSelectedSource.length}>
              {runningApply || autoApplyIsActive
                ? "Sedang berjalan..."
                : "Jalankan antrean"}
            </button>
          </div>

          <div className="queue-control-actions">
            <button className="queue-secondary-button" type="button" onClick={handlePrepareRun}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" />
                <path d="m6.7 10 2.05 2.05 4.55-4.55" />
              </svg>
              Periksa kesiapan{selectedSource === "All" ? "" : ` ${selectedSource}`}
            </button>
            <button className={`queue-secondary-button refresh ${loading ? "is-loading" : ""}`} type="button" onClick={loadState} disabled={loading}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M15.2 6.2V2.8m0 3.4h-3.4" />
                <path d="M15 6.1A6.5 6.5 0 1 0 16.4 12" />
              </svg>
              {loading ? "Memperbarui..." : "Perbarui data"}
            </button>
            {(autoApplyIsActive || stoppingApply) && (
              <button className="danger-button queue-stop-button" type="button" onClick={handleStopAutoApply} disabled={stoppingApply}>
                {stoppingApply ? "Menghentikan..." : "Hentikan proses"}
              </button>
            )}
          </div>
          {renderStatus()}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Progres pengiriman</h2>
              <p className="section-subtitle">Pantau lowongan yang sedang diproses dan tindakan terakhir.</p>
            </div>
          </div>
          {renderRunProgress()}
        </section>
        </>}

        {autoApplySection === "answers" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Answer Bank</h2>
              <p className="section-subtitle">Siapkan jawaban yang akan dipakai saat mengisi formulir screening.</p>
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
        )}

        {autoApplySection === "queue" && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Antrean lamaran <span className="result-count">{filteredAutoApplyJobs.length}</span></h2>
              <p className="section-subtitle">Lowongan berstatus Siap Dilamar yang menunggu proses.</p>
            </div>
          </div>
          {renderFilters(autoApplyStatusOptions)}
          {renderJobsTable(filteredAutoApplyJobs, "autoApply")}
        </section>
        )}
      </div>
    );
  }

  function renderSources() {
    return (
      <div className="auto-apply-layout">
        <section className="explorer-overview" aria-labelledby="settings-title">
          <div className="explorer-title-row">
            <div>
              <h1 id="settings-title">Pengaturan</h1>
              <p>Atur sumber lowongan, target pencarian, dan batas aman otomatisasi.</p>
            </div>
            <button className="primary-button" type="button" onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-heading">
            <div>
              <h2>Sumber &amp; target pencarian</h2>
              <p className="section-subtitle">Pilih portal, role, lokasi, serta batas proses per sesi.</p>
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
              <span>Batas Hasil per Pencarian</span>
              <SoftSelect
                name="scrapeLimitPerRun"
                value={state.rules?.scrapeLimitPerRun || "40"}
                options={scrapeLimitOptions}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Batas Lamaran per Proses</span>
              <SoftSelect
                name="autoApplyLimitPerRun"
                value={state.rules?.autoApplyLimitPerRun || "5"}
                options={autoApplyLimitOptions}
                onChange={updateRuleField}
              />
            </label>
            <label className="field">
              <span>Daftar Perusahaan yang Dihindari</span>
              <input name="blacklistCompanies" value={state.rules?.blacklistCompanies || ""} onChange={updateRuleField} />
            </label>
          </div>

          <div className="settings-subheading">
            <h3>Aturan penyaringan</h3>
            <p>Tentukan lowongan yang boleh masuk ke antrean otomatis.</p>
          </div>

          <div className="rule-grid">
            {[
              ["skipUnpaid", "Lewati lowongan tanpa gaji"],
              ["skipSeniorLead", "Lewati posisi senior atau lead"],
              ["skipDominantJavaGolangDotnet", "Lewati role dominan Java, Golang, atau .NET"],
              ["skipOutsideTargetLocation", "Lewati lokasi di luar target"],
              ["skipWithoutCv", "Lewati jika CV tidak tersedia"],
              ["pauseOnCaptchaOrVerification", "Lewati jika CAPTCHA atau verifikasi memblokir"],
              ["autoQueueImportedJobs", "Masukkan lowongan yang lolos ke antrean otomatis"],
            ].map(([name, label]) => (
              <label className="check-field" key={name}>
                <input type="checkbox" name={name} checked={Boolean(state.rules?.[name])} onChange={updateRuleField} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="action-row settings-actions settings-save-row">
            <span>Perubahan akan digunakan pada pencarian dan proses auto apply berikutnya.</span>
            <button className="primary-button" type="button" onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
          {renderStatus()}
        </section>

        <section className="panel settings-panel scrape-settings-panel">
          <div className="section-heading">
            <div>
              <h2>Pencarian lowongan</h2>
              <p className="section-subtitle">Ambil lowongan terbaru dari sumber aktif dan siapkan yang lolos filter.</p>
            </div>
          </div>
          {renderScrapeToolbar()}
        </section>
      </div>
    );
  }

  let content;
  if (view === "applications") content = renderApplications();
  else if (view === "autoApply") content = renderAutoApply();
  else if (view === "sources") content = renderSources();
  else content = renderJobsExplorer();

  return (
    <>
      {content}
      {scrapeReportOpen && scrapeReport && (
        <ScrapeReportModal report={scrapeReport} onClose={() => setScrapeReportOpen(false)} />
      )}
    </>
  );
}
