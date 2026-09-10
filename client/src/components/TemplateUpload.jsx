import { useRef, useState } from "react";
import { checkTemplate, uploadTemplate } from "../api/client.js";

export default function TemplateUpload({ templateFileName, templateStatus, onUploaded, onChecked }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  async function runTemplateCheck(filename) {
    if (!filename) {
      return null;
    }

    setChecking(true);
    try {
      const response = await checkTemplate(filename);
      const nextStatus = {
        valid: response.success,
        foundPlaceholders: response.data?.foundPlaceholders || [],
        missingPlaceholders: response.data?.missingPlaceholders || [],
        message: response.message
      };
      onChecked(nextStatus);
      setStatus({ type: nextStatus.valid ? "success" : "warning", message: nextStatus.message });
      return nextStatus;
    } catch (error) {
      setStatus({ type: "error", message: error.message });
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setStatus({ type: "error", message: "Gunakan file dengan format .docx." });
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus({ type: "error", message: "Ukuran template maksimal 5 MB." });
      event.target.value = "";
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "", message: "" });
      const response = await uploadTemplate(file);
      const nextTemplateFileName = response.data.templateFileName;
      const nextStatus = await runTemplateCheck(nextTemplateFileName);
      onUploaded(nextTemplateFileName, nextStatus);
      setStatus({ type: nextStatus?.valid ? "success" : "warning", message: nextStatus?.message || "Template berhasil diunggah." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel" id="template">
      <div className="section-heading">
        <span className="section-number">02</span>
        <h2>Template CV</h2>
      </div>

      <div className="upload-box">
        <input ref={inputRef} type="file" accept=".docx" onChange={handleUpload} hidden />
        <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()} disabled={loading}>
          {loading ? "Mengunggah..." : "Pilih Template"}
        </button>
        <button className="secondary-button" type="button" onClick={() => runTemplateCheck(templateFileName)} disabled={!templateFileName || checking}>
          {checking ? "Memeriksa..." : "Periksa Template"}
        </button>
        <div className="upload-meta">
          <strong>{templateFileName || "Belum ada template"}</strong>
          <span>DOCX, max 5MB</span>
        </div>
      </div>

      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
      {templateStatus && (
        <div className={templateStatus.valid ? "template-check valid" : "template-check invalid"}>
          <span className="badge">{templateStatus.valid ? "Template CV valid" : "Template CV belum lengkap"}</span>
          {!templateStatus.valid && templateStatus.missingPlaceholders?.length > 0 && (
            <div className="missing-list">
              <strong>Placeholder yang belum ada:</strong>
              <span>{templateStatus.missingPlaceholders.join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
