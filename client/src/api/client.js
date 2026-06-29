const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    const message = payload?.message || "Request failed.";
    const detail = payload?.error ? ` ${payload.error}` : "";
    throw new Error(`${message}${detail}`);
  }

  return payload;
}

export function getDownloadUrl(filename) {
  return `${API_BASE_URL}/api/download/${encodeURIComponent(filename)}`;
}

export async function uploadTemplate(file) {
  const formData = new FormData();
  formData.append("template", file);

  const response = await fetch(`${API_BASE_URL}/api/upload-template`, {
    method: "POST",
    body: formData,
  });

  return parseResponse(response);
}

export async function checkTemplate(templateFileName) {
  const response = await fetch(`${API_BASE_URL}/api/check-template`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ templateFileName }),
  });
  const payload = await response.json().catch(() => null);

  if (!payload) {
    throw new Error("Template check failed.");
  }

  if (!response.ok && !payload.data) {
    throw new Error(payload.message || "Template check failed.");
  }

  return payload;
}

export async function generateApplication(payload) {
  const response = await fetch(`${API_BASE_URL}/api/generate-application`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function fetchJobFromUrl(url) {
  const response = await fetch(`${API_BASE_URL}/api/fetch-job-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  return parseResponse(response);
}

export async function saveToTracker(payload) {
  const response = await fetch(`${API_BASE_URL}/api/save-to-sheet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}
