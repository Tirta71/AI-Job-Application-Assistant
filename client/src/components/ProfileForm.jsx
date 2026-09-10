import { useState } from "react";

const profileTabs = [
  { id: "basic", label: "Info Dasar" },
  { id: "work", label: "Pengalaman" },
  { id: "project", label: "Proyek" },
  { id: "education", label: "Pendidikan" },
  { id: "skills", label: "Keahlian" }
];

const basicFields = [
  { name: "fullName", label: "Nama Lengkap", type: "text", required: true },
  { name: "targetRole", label: "Posisi yang Ditargetkan", type: "text" },
  { name: "phone", label: "Nomor Telepon", type: "tel" },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "linkedinUrl", label: "LinkedIn URL", type: "url" },
  { name: "githubUrl", label: "GitHub URL", type: "url" },
  { name: "portfolioUrl", label: "Portfolio URL", type: "url" }
];

const workFields = [
  { name: "workTitle", label: "Jabatan" },
  { name: "workCompanyLocation", label: "Perusahaan & Lokasi" },
  { name: "workDate", label: "Periode Kerja" }
];

const projectFields = [
  { name: "projectTitle", label: "Nama Proyek" },
  { name: "projectInstitution", label: "Institusi" },
  { name: "projectDate", label: "Periode Proyek" }
];

const educationFields = [
  { name: "educationSchool", label: "Institusi Pendidikan" },
  { name: "educationYear", label: "Tahun" },
  { name: "educationDegree", label: "Gelar / Program Studi" }
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
          <h2>Profil Utama</h2>
          <p className="section-subtitle">Data ini menjadi dasar untuk setiap CV yang disesuaikan.</p>
        </div>
        <button className="text-button section-action" type="button" onClick={onReset}>
          Pulihkan Profil Awal
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
            <span>Ringkasan Profil</span>
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
              <span>{`Poin Pengalaman ${index + 1}`}</span>
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
              <span>{`Poin Proyek ${index + 1}`}</span>
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
              <span>{`Sertifikasi ${index + 1}`}</span>
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
