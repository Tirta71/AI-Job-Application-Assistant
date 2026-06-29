import { useState } from "react";

const profileTabs = [
  { id: "basic", label: "Basic Info" },
  { id: "work", label: "Work" },
  { id: "project", label: "Project" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" }
];

const basicFields = [
  { name: "fullName", label: "Full Name", type: "text", required: true },
  { name: "targetRole", label: "Target Role", type: "text" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "linkedinUrl", label: "LinkedIn URL", type: "url" },
  { name: "githubUrl", label: "GitHub URL", type: "url" },
  { name: "portfolioUrl", label: "Portfolio URL", type: "url" }
];

const workFields = [
  { name: "workTitle", label: "Work Title" },
  { name: "workCompanyLocation", label: "Company & Location" },
  { name: "workDate", label: "Work Date" }
];

const projectFields = [
  { name: "projectTitle", label: "Project Title" },
  { name: "projectInstitution", label: "Project Institution" },
  { name: "projectDate", label: "Project Date" }
];

const educationFields = [
  { name: "educationSchool", label: "Education School" },
  { name: "educationYear", label: "Education Year" },
  { name: "educationDegree", label: "Education Degree" }
];

function InputField({ field, value, onChange }) {
  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        type={field.type || "text"}
        name={field.name}
        value={value || ""}
        onChange={onChange}
        required={field.required}
      />
    </label>
  );
}

export default function ProfileForm({ profile, onChange, onReset }) {
  const [activeTab, setActiveTab] = useState("basic");

  function updateField(event) {
    const { name, value } = event.target;
    onChange({
      ...profile,
      [name]: value
    });
  }

  function updateArrayField(name, index, value) {
    const current = Array.isArray(profile[name]) ? profile[name] : [];
    const next = [...current];
    next[index] = value;
    onChange({
      ...profile,
      [name]: next
    });
  }

  function updateSkillField(name, value) {
    onChange({
      ...profile,
      skills: {
        ...(profile.skills || {}),
        [name]: value
      }
    });
  }

  return (
    <section className="panel" id="profile">
      <div className="section-heading">
        <span className="section-number">01</span>
        <div>
          <h2>Profile</h2>
          <p className="section-subtitle">Fixed-slot profile from Tirta Samara master CV.</p>
        </div>
        <button className="text-button section-action" type="button" onClick={onReset}>
          Reset to Master CV
        </button>
      </div>

      <div className="tabs compact-tabs">
        {profileTabs.map((tab) => (
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

      {activeTab === "basic" && (
        <div className="form-grid">
          <div className="form-grid two-columns">
            {basicFields.map((field) => (
              <InputField key={field.name} field={field} value={profile[field.name]} onChange={updateField} />
            ))}
          </div>
          <label className="field">
            <span>Master Summary</span>
            <textarea name="summary" rows={4} value={profile.summary || ""} onChange={updateField} />
          </label>
        </div>
      )}

      {activeTab === "work" && (
        <div className="form-grid">
          <div className="form-grid two-columns">
            {workFields.map((field) => (
              <InputField key={field.name} field={field} value={profile[field.name]} onChange={updateField} />
            ))}
          </div>
          {[0, 1].map((index) => (
            <label className="field" key={index}>
              <span>{`Work Bullet ${index + 1}`}</span>
              <textarea
                rows={3}
                value={profile.workBullets?.[index] || ""}
                onChange={(event) => updateArrayField("workBullets", index, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {activeTab === "project" && (
        <div className="form-grid">
          <div className="form-grid two-columns">
            {projectFields.map((field) => (
              <InputField key={field.name} field={field} value={profile[field.name]} onChange={updateField} />
            ))}
          </div>
          {[0, 1].map((index) => (
            <label className="field" key={index}>
              <span>{`Project Bullet ${index + 1}`}</span>
              <textarea
                rows={3}
                value={profile.projectBullets?.[index] || ""}
                onChange={(event) => updateArrayField("projectBullets", index, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {activeTab === "education" && (
        <div className="form-grid">
          <div className="form-grid two-columns">
            {educationFields.map((field) => (
              <InputField key={field.name} field={field} value={profile[field.name]} onChange={updateField} />
            ))}
          </div>
          {[0, 1, 2].map((index) => (
            <label className="field" key={index}>
              <span>{`Certification ${index + 1}`}</span>
              <input
                value={profile.certifications?.[index] || ""}
                onChange={(event) => updateArrayField("certifications", index, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {activeTab === "skills" && (
        <div className="form-grid">
          <label className="field">
            <span>Web Fundamentals</span>
            <input value={profile.skills?.web || ""} onChange={(event) => updateSkillField("web", event.target.value)} />
          </label>
          <label className="field">
            <span>Frameworks</span>
            <input
              value={profile.skills?.frameworks || ""}
              onChange={(event) => updateSkillField("frameworks", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Backend & Database</span>
            <input value={profile.skills?.backend || ""} onChange={(event) => updateSkillField("backend", event.target.value)} />
          </label>
          <label className="field">
            <span>Tools & AI</span>
            <input value={profile.skills?.toolsAi || ""} onChange={(event) => updateSkillField("toolsAi", event.target.value)} />
          </label>
        </div>
      )}
    </section>
  );
}
