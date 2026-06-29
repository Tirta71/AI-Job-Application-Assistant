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

function CvSlotsBlock({ result }) {
  const summaryLines = [result.summaryLine1, result.summaryLine2, result.summaryLine3, result.summaryLine4].filter(Boolean);
  const workBullets = [result.workBullet1, result.workBullet2].filter(Boolean);
  const projectBullets = [result.projectBullet1, result.projectBullet2].filter(Boolean);
  const skillRows = [
    ["Web", result.skillsWeb],
    ["Frameworks", result.skillsFrameworks],
    ["Backend", result.skillsBackend],
    ["Tools & AI", result.skillsToolsAi]
  ].filter(([, value]) => value);

  return (
    <div className="result-block">
      <h3>AI Tailored CV Slots</h3>

      <div className="slot-group">
        <strong>Summary</strong>
        {summaryLines.length > 0 ? summaryLines.map((line) => <p key={line}>{line}</p>) : <p className="muted">No summary rewrite</p>}
      </div>

      <div className="slot-group">
        <strong>Work Experience</strong>
        {workBullets.length > 0 ? (
          <ul className="compact-list">
            {workBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No work rewrite</p>
        )}
      </div>

      <div className="slot-group">
        <strong>Project</strong>
        {projectBullets.length > 0 ? (
          <ul className="compact-list">
            {projectBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No project rewrite</p>
        )}
      </div>

      <div className="slot-group">
        <strong>Skills</strong>
        {skillRows.length > 0 ? (
          <div className="skill-slot-grid">
            {skillRows.map(([label, value]) => (
              <p key={label}>
                <span>{label}:</span> {value}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">No skill rewrite</p>
        )}
      </div>
    </div>
  );
}

export default function ResultPreview({ result, copyStatus, onCopy }) {
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

  return (
    <section className="panel" id="result">
      <div className="section-heading">
        <span className="section-number">04</span>
        <h2>Generate Result</h2>
      </div>

      {result.warning && <p className="status warning subtle-warning">{result.warning}</p>}
      {copyStatus && <p className="status success">{copyStatus}</p>}

      <div className="summary-grid">
        <div className="score-card" aria-label={`Match score ${result.matchScore}`}>
          <span>{result.matchScore ?? 0}</span>
          <small>Match Score</small>
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
      <CvSlotsBlock result={result} />

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
        <p className="pre-line">{activeContent.value || "No content"}</p>
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
