import { useState } from "react";
import { fetchJobFromUrl } from "../api/client.js";

const applyViaOptions = [
  "Email",
  "LinkedIn",
  "Jobstreet",
  "Glints",
  "Kalibrr",
  "Company Website",
  "WhatsApp",
  "Referral",
  "Other"
];

export default function JobForm({ job, onChange }) {
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState({ type: "", message: "" });

  function updateField(event) {
    const { name, value } = event.target;
    onChange({
      ...job,
      [name]: value
    });
  }

  async function handleFetchJob() {
    if (!job.sourceLink?.trim()) {
      setFetchStatus({ type: "error", message: "Masukkan tautan lowongan terlebih dahulu." });
      return;
    }

    try {
      setFetching(true);
      setFetchStatus({ type: "", message: "" });
      const response = await fetchJobFromUrl(job.sourceLink.trim());
      const fetchedJob = response.data;

      onChange({
        ...job,
        sourceLink: fetchedJob.sourceLink || job.sourceLink,
        companyName: fetchedJob.companyName || job.companyName,
        jobPosition: fetchedJob.jobPosition || job.jobPosition,
        jobDescription: fetchedJob.jobDescription || job.jobDescription,
        location: fetchedJob.location || job.location || "",
        workArrangement: fetchedJob.workArrangement || job.workArrangement || "",
        applyVia: fetchedJob.applyVia || job.applyVia || "Company Website"
      });
      setFetchStatus({ type: "success", message: "Detail lowongan berhasil diambil. Periksa kembali sebelum membuat dokumen." });
    } catch (error) {
      setFetchStatus({
        type: "warning",
        message: "Tautan belum dapat dibaca otomatis. Tempel deskripsi lowongan secara manual."
      });
    } finally {
      setFetching(false);
    }
  }

  return (
    <section className="panel" id="job">
      <div className="section-heading">
        <span className="section-number">03</span>
        <h2>Detail Lowongan</h2>
      </div>

      <div className="source-link-row">
        <label className="field">
          <span>Tautan Lowongan</span>
          <input type="url" name="sourceLink" value={job.sourceLink || ""} onChange={updateField} />
        </label>
        <button className="secondary-button fetch-button" type="button" onClick={handleFetchJob} disabled={fetching || !job.sourceLink}>
          {fetching ? "Membaca tautan..." : "Ambil Detail"}
        </button>
      </div>

      {fetchStatus.message && <p className={`status ${fetchStatus.type}`}>{fetchStatus.message}</p>}

      <div className="form-grid two-columns">
        <label className="field">
          <span>Posisi</span>
          <input name="jobPosition" value={job.jobPosition || ""} onChange={updateField} required />
        </label>

        <label className="field">
          <span>Nama Perusahaan</span>
          <input name="companyName" value={job.companyName || ""} onChange={updateField} required />
        </label>

        <label className="field">
          <span>Kanal Lamaran</span>
          <select name="applyVia" value={job.applyVia || "Email"} onChange={updateField}>
            {applyViaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Tanggal Melamar</span>
          <input type="date" name="applyingDate" value={job.applyingDate || ""} onChange={updateField} />
        </label>

        <label className="field">
          <span>Portofolio Disertakan</span>
          <select name="portfolioSubmitted" value={job.portfolioSubmitted || "No"} onChange={updateField}>
            <option value="No">Tidak</option>
            <option value="Yes">Ya</option>
          </select>
        </label>

        <label className="field">
          <span>Lokasi</span>
          <input name="location" value={job.location || ""} onChange={updateField} />
        </label>

        <label className="field">
          <span>Sistem Kerja</span>
          <input name="workArrangement" value={job.workArrangement || ""} onChange={updateField} />
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Deskripsi Lowongan</span>
          <textarea name="jobDescription" rows={6} value={job.jobDescription || ""} onChange={updateField} required />
        </label>

        <label className="field">
          <span>Catatan</span>
          <textarea name="notes" rows={3} value={job.notes || ""} onChange={updateField} />
        </label>
      </div>
    </section>
  );
}
