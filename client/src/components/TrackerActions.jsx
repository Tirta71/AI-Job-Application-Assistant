import { useState } from "react";
import { saveToTracker } from "../api/client.js";

export default function TrackerActions({ job, result }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  async function handleSave() {
    if (!result) {
      setStatus({ type: "error", message: "Buat dokumen lamaran sebelum menyimpan." });
      return;
    }

    try {
      setLoading(true);
      setStatus({ type: "", message: "" });
      const response = await saveToTracker({
        job,
        result,
        files: {
          docxFile: result.docxFile,
          pdfFile: result.pdfFile
        }
      });

      setStatus({
        type: response.data.warning ? "warning" : "success",
        message: response.data.warning || "Berhasil disimpan ke Google Sheets."
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel" id="tracker">
      <div className="section-heading">
        <span className="section-number">05</span>
        <h2>Simpan ke Tracker</h2>
      </div>

      <div className="action-row">
        <button className="primary-button" type="button" onClick={handleSave} disabled={loading || !result}>
          {loading ? "Menyimpan..." : "Simpan ke Tracker"}
        </button>
      </div>

      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
    </section>
  );
}
