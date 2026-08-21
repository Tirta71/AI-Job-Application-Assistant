import { useEffect, useMemo, useRef, useState } from "react";
import { generateApplication, renderApplicationCv } from "./api/client.js";
import ProfileForm from "./components/ProfileForm.jsx";
import TemplateUpload from "./components/TemplateUpload.jsx";
import JobForm from "./components/JobForm.jsx";
import ResultPreview from "./components/ResultPreview.jsx";
import TrackerActions from "./components/TrackerActions.jsx";
import AutoApplyPanel from "./components/AutoApplyPanel.jsx";
import { MASTER_PROFILE, mergeProfileWithMaster } from "./utils/defaultProfile.js";

const emptyJob = {
  jobPosition: "",
  companyName: "",
  jobDescription: "",
  sourceLink: "",
  applyVia: "Email",
  applyingDate: new Date().toISOString().slice(0, 10),
  portfolioSubmitted: "No",
  location: "",
  workArrangement: "",
  notes: ""
};

function loadStoredProfile() {
  try {
    const stored = localStorage.getItem("jobAssistantProfile");
    return stored ? mergeProfileWithMaster(JSON.parse(stored)) : MASTER_PROFILE;
  } catch {
    return MASTER_PROFILE;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("jobs");
  const [profile, setProfile] = useState(loadStoredProfile);
  const [job, setJob] = useState(emptyJob);
  const [templateFileName, setTemplateFileName] = useState("");
  const [templateStatus, setTemplateStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [copyStatus, setCopyStatus] = useState("");
  const [resultEditVersion, setResultEditVersion] = useState(0);
  const [fileRefreshStatus, setFileRefreshStatus] = useState({ type: "", message: "" });
  const latestRenderVersion = useRef(0);

  const canGenerate = useMemo(() => {
    return Boolean(
      profile.fullName &&
        profile.email &&
        profile.workTitle &&
        profile.workCompanyLocation &&
        profile.workDate &&
        profile.projectTitle &&
        profile.projectInstitution &&
        profile.projectDate &&
        profile.educationSchool &&
        profile.educationYear &&
        profile.educationDegree &&
        profile.skills?.frameworks &&
        profile.skills?.backend &&
        job.jobPosition &&
        job.companyName &&
        job.jobDescription &&
        templateFileName &&
        templateStatus?.valid
    );
  }, [profile, job, templateFileName, templateStatus]);

  useEffect(() => {
    localStorage.setItem("jobAssistantProfile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!result || resultEditVersion === 0 || !templateFileName || !templateStatus?.valid) {
      return undefined;
    }

    const currentVersion = resultEditVersion;
    latestRenderVersion.current = currentVersion;

    const timer = window.setTimeout(async () => {
      try {
        setFileRefreshStatus({ type: "warning", message: "Updating CV file from your edits..." });
        const response = await renderApplicationCv({
          profile,
          job,
          analysis: result,
          templateFileName
        });

        if (latestRenderVersion.current !== currentVersion) {
          return;
        }

        setResult((currentResult) => {
          if (!currentResult) {
            return currentResult;
          }

          return {
            ...currentResult,
            docxFile: response.data.docxFile,
            pdfFile: response.data.pdfFile,
            pdfAvailable: response.data.pdfAvailable,
            warning: response.data.warning
          };
        });
        setFileRefreshStatus({
          type: response.data.warning ? "warning" : "success",
          message: response.data.warning || "CV file updated from your edits."
        });
      } catch (error) {
        if (latestRenderVersion.current === currentVersion) {
          setFileRefreshStatus({ type: "error", message: `CV file update failed. ${error.message}` });
        }
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [job, profile, resultEditVersion, templateFileName, templateStatus]);

  async function handleGenerate() {
    if (!canGenerate) {
      setStatus({ type: "error", message: "Complete required fields and use a valid DOCX template." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "", message: "" });
      setResult(null);
      setResultEditVersion(0);
      setFileRefreshStatus({ type: "", message: "" });

      const response = await generateApplication({
        profile,
        job,
        templateFileName
      });

      setResult(response.data);
      setStatus({ type: response.data.warning ? "warning" : "success", message: response.message });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function handleResultChange(nextResult, options = { renderCv: true }) {
    setResult(nextResult);

    if (options.renderCv) {
      setResultEditVersion((version) => version + 1);
    }
  }

  function handleTemplateUploaded(nextTemplateFileName, nextTemplateStatus) {
    setTemplateFileName(nextTemplateFileName);
    setTemplateStatus(nextTemplateStatus);
  }

  function handleResetProfile() {
    setProfile(MASTER_PROFILE);
    localStorage.setItem("jobAssistantProfile", JSON.stringify(MASTER_PROFILE));
  }

  async function handleCopy(value, label) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
      window.setTimeout(() => setCopyStatus(""), 2200);
    } catch {
      setCopyStatus("Copy failed.");
      window.setTimeout(() => setCopyStatus(""), 2200);
    }
  }

  const tabLabels = {
    jobs: "Jelajahi Lowongan",
    applications: "Lamaran Saya",
    autoApply: "Lamar Otomatis",
    profileCv: "Profil & CV",
    sources: "Sumber & Rules",
  };

  return (
    <main className="app-shell">
      <header className="soft-topbar">
        <div className="soft-brand">
          <div className="brand-logo">AM</div>
          <div>
            <strong>ApplyMate</strong>
            <span>AI job buddy</span>
          </div>
        </div>

        <nav className="app-tabs" aria-label="Application sections">
          {[
            ["jobs", "Explore"],
            ["applications", "Applications"],
            ["autoApply", "Auto Apply"],
            ["profileCv", "Profile CV"],
            ["sources", "Rules"],
          ].map(([tabId, label]) => (
            <button className={`tab ${activeTab === tabId ? "active" : ""}`} type="button" onClick={() => setActiveTab(tabId)} key={tabId}>
              {label}
            </button>
          ))}
        </nav>

        <div className="user-pill">
          <div className="user-avatar">T</div>
          <div>
            <strong>Tirta</strong>
            <span>Ready to apply</span>
          </div>
        </div>
      </header>

      <section className="app-hero">
        <div>
          <span className="eyebrow">Soft friendly workspace</span>
          <h1>{activeTab === "jobs" ? "Temani proses apply kerja, tanpa terasa ribet." : tabLabels[activeTab]}</h1>
          <p className="subtitle">
            Lowongan tetap rapi, auto apply tetap terukur, dan setiap langkah dibuat lebih ringan dibaca.
          </p>
        </div>
        {activeTab === "profileCv" && (
          <button className="primary-button header-button" type="button" onClick={handleGenerate} disabled={loading || !canGenerate}>
            {loading ? "Generating..." : "Generate CV & Letter"}
          </button>
        )}
      </section>

      {activeTab === "profileCv" ? (
        <div className="page-grid">
          <div className="main-column">
            <ProfileForm profile={profile} onChange={setProfile} onReset={handleResetProfile} />
            <TemplateUpload
              templateFileName={templateFileName}
              templateStatus={templateStatus}
              onUploaded={handleTemplateUploaded}
              onChecked={setTemplateStatus}
            />
            <JobForm job={job} onChange={setJob} />

            <section className="panel generate-panel">
              <button className="primary-button wide-button" type="button" onClick={handleGenerate} disabled={loading || !canGenerate}>
                {loading ? "Generating Application..." : "Generate Application"}
              </button>
              {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
            </section>
          </div>

          <aside className="side-column">
            <ResultPreview
              result={result}
              copyStatus={copyStatus}
              fileRefreshStatus={fileRefreshStatus}
              onCopy={handleCopy}
              onResultChange={handleResultChange}
            />
            <TrackerActions job={job} result={result} />
          </aside>
        </div>
      ) : (
        <AutoApplyPanel view={activeTab} />
      )}
    </main>
  );
}
