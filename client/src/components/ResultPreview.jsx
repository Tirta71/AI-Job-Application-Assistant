import { useState } from "react";
import { getDownloadUrl } from "../api/client.js";

const resultTabs = [
  { id: "coverLetter", label: "Cover Letter" },
  { id: "email", label: "Email" },
  { id: "linkedinDM", label: "LinkedIn DM" }
];

function ChipBlock({ title, items, tone = "neutral" }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="result-block">
      <h3>{title}</h3>
      {safeItems.length > 0 ? (
        <div className="chip-list">
          {safeItems.map((item) => (
            <span className={`chip ${tone}`} key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">No items</p>
      )}
    </div>
  );
}

function ImprovementBlock({ items }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="result-block">
      <h3>CV Improvement</h3>
      {safeItems.length > 0 ? (
        <ul className="check-list">
          {safeItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No items</p>
      )}
    </div>
  );
}

function EditField({ label, value, rows = 2, onChange }) {
  return (
    <label className="field edit-field">
      <span>{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CvSlotsBlock({ result, onFieldChange }) {
  const summaryFields = [
    ["summaryLine1", "Line 1"],
    ["summaryLine2", "Line 2"],
    ["summaryLine3", "Line 3"],
    ["summaryLine4", "Line 4"]
  ];
  const workFields = [
    ["workBullet1", "Work bullet 1"],
    ["workBullet2", "Work bullet 2"]
  ];
  const projectFields = [
    ["projectBullet1", "Project bullet 1"],
    ["projectBullet2", "Project bullet 2"]
  ];
  const skillRows = [
    ["skillsWeb", "Web"],
    ["skillsFrameworks", "Frameworks"],
    ["skillsBackend", "Backend"],
    ["skillsToolsAi", "Tools & AI"]
  ];

  return (
    <div className="result-block">
      <h3>AI Tailored CV Slots</h3>

      <div className="slot-group">
        <strong>Summary</strong>
        <div className="editable-slot-grid">
          {summaryFields.map(([field, label]) => (
            <EditField key={field} label={label} value={result[field]} onChange={(value) => onFieldChange(field, value)} />
          ))}
        </div>
      </div>

      <div className="slot-group">
        <strong>Work Experience</strong>
        <div className="editable-slot-grid">
          {workFields.map(([field, label]) => (
            <EditField key={field} label={label} value={result[field]} rows={3} onChange={(value) => onFieldChange(field, value)} />
          ))}
        </div>
      </div>

      <div className="slot-group">
        <strong>Project</strong>
        <div className="editable-slot-grid">
          {projectFields.map(([field, label]) => (
            <EditField key={field} label={label} value={result[field]} rows={3} onChange={(value) => onFieldChange(field, value)} />
          ))}
        </div>
      </div>

      <div className="slot-group">
        <strong>Skills</strong>
        <div className="skill-slot-grid editable-skills">
          {skillRows.map(([field, label]) => (
            <EditField key={field} label={label} value={result[field]} rows={2} onChange={(value) => onFieldChange(field, value)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ResultPreview({ result, copyStatus, fileRefreshStatus, onCopy, onResultChange }) {
  const [activeTab, setActiveTab] = useState("coverLetter");

  if (!result) {
    return (
      <section className="panel" id="result">
        <div className="section-heading">
          <span className="section-number">04</span>
          <h2>Generate Result</h2>
        </div>
        <div className="empty-state">Paste a job description and click Generate to preview your tailored application.</div>
      </section>
    );
  }

  const emailText = [result.emailApplication?.subject, result.emailApplication?.body].filter(Boolean).join("\n\n");

  function updateField(field, value, options) {
    onResultChange(
      {
        ...result,
        [field]: value
      },
      options
    );
  }

  function updateEmailField(field, value) {
    onResultChange(
      {
        ...result,
        emailApplication: {
          ...(result.emailApplication || {}),
          [field]: value
        }
      },
      { renderCv: false }
    );
  }

  const activeContent = {
    coverLetter: {
      title: "Cover Letter",
      copyLabel: "Cover letter",
      buttonLabel: "Copy Cover Letter",
      value: result.coverLetter
    },
    email: {
      title: "Email",
      copyLabel: "Email",
      buttonLabel: "Copy Email",
      value: emailText
    },
    linkedinDM: {
      title: "LinkedIn DM",
      copyLabel: "LinkedIn DM",
      buttonLabel: "Copy LinkedIn DM",
      value: result.linkedinDM
    }
  }[activeTab];
  const beforeScore = result.beforeOptimizationScore ?? result.matchScore ?? 0;
  const afterScore = result.afterOptimizationScore ?? result.matchScore ?? 0;
  const scoreDelta = afterScore - beforeScore;

  return (
    <section className="panel" id="result">
      <div className="section-heading">
        <span className="section-number">04</span>
        <h2>Generate Result</h2>
      </div>

      {result.warning && <p className="status warning subtle-warning">{result.warning}</p>}
      {copyStatus && <p className="status success">{copyStatus}</p>}
      {fileRefreshStatus?.message && <p className={`status ${fileRefreshStatus.type}`}>{fileRefreshStatus.message}</p>}

      <div className="summary-grid">
        <div className="score-comparison">
          <div className="score-card before-score" aria-label={`Before optimization match score ${beforeScore}`}>
            <span>{beforeScore}</span>
            <small>Before Optimize</small>
          </div>
          <div className="score-card after-score" aria-label={`After optimization match score ${afterScore}`}>
            <span>{afterScore}</span>
            <small>After Optimize</small>
            {scoreDelta !== 0 && <em className={scoreDelta > 0 ? "positive-delta" : "negative-delta"}>{scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}</em>}
          </div>
        </div>
        <div className="result-block notes-card">
          <h3>AI Notes</h3>
          <p className="pre-line">{result.notes || "Generated analysis is ready."}</p>
        </div>
      </div>

      <div className="result-grid two-result-columns">
        <ChipBlock title="Skills Matched" items={result.skillsMatched} tone="success" />
        <ChipBlock title="Skills Missing" items={result.skillsMissing} tone="warning" />
      </div>

      <ImprovementBlock items={result.cvImprovement} />
      <CvSlotsBlock result={result} onFieldChange={updateField} />

      <div className="result-block">
        <div className="tabs">
          {resultTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "tab active" : "tab"}
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="block-title-row">
          <h3>{activeContent.title}</h3>
          {activeContent.value && (
            <button className="text-button" type="button" onClick={() => onCopy(activeContent.value, activeContent.copyLabel)}>
              {activeContent.buttonLabel}
            </button>
          )}
        </div>
        {activeTab === "email" ? (
          <div className="editable-message-grid">
            <label className="field edit-field">
              <span>Subject</span>
              <input value={result.emailApplication?.subject || ""} onChange={(event) => updateEmailField("subject", event.target.value)} />
            </label>
            <EditField
              label="Body"
              value={result.emailApplication?.body || ""}
              rows={9}
              onChange={(value) => updateEmailField("body", value)}
            />
          </div>
        ) : (
          <textarea
            className="message-editor"
            rows={activeTab === "coverLetter" ? 12 : 6}
            value={activeContent.value || ""}
            onChange={(event) => updateField(activeTab, event.target.value, { renderCv: false })}
          />
        )}
      </div>

      <div className="download-row">
        {result.docxFile && (
          <a className="primary-button" href={getDownloadUrl(result.docxFile)}>
            Download DOCX
          </a>
        )}
        {result.pdfAvailable && result.pdfFile && (
          <a className="secondary-button" href={getDownloadUrl(result.pdfFile)}>
            Download PDF
          </a>
        )}
      </div>
    </section>
  );
}
