import { useEffect, useMemo, useState } from "react";
import { generateApplication } from "./api/client.js";
import ProfileForm from "./components/ProfileForm.jsx";
import TemplateUpload from "./components/TemplateUpload.jsx";
import JobForm from "./components/JobForm.jsx";
import ResultPreview from "./components/ResultPreview.jsx";
import TrackerActions from "./components/TrackerActions.jsx";
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
  const [profile, setProfile] = useState(loadStoredProfile);
  const [job, setJob] = useState(emptyJob);
  const [templateFileName, setTemplateFileName] = useState("");
  const [templateStatus, setTemplateStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [copyStatus, setCopyStatus] = useState("");

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

  async function handleGenerate() {
    if (!canGenerate) {
      setStatus({ type: "error", message: "Complete required fields and use a valid DOCX template." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "", message: "" });
      setResult(null);

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

  return (
    <main>
      <header className="app-header">
        <div>
          <h1>AI Job Application Assistant</h1>
          <p className="subtitle">Generate tailored CV, cover letter, email, and job tracker without database.</p>
        </div>
        <button className="primary-button header-button" type="button" onClick={handleGenerate} disabled={loading || !canGenerate}>
          {loading ? "Generating..." : "Generate Application"}
        </button>
      </header>

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
          <ResultPreview result={result} copyStatus={copyStatus} onCopy={handleCopy} />
          <TrackerActions job={job} result={result} />
        </aside>
      </div>
    </main>
  );
}
