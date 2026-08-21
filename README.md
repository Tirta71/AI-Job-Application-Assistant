# AI Job Application Assistant

Dashboard asisten lamaran kerja untuk scraping lowongan langsung dari website, pengelolaan CV, pembuatan application kit, antrean auto-apply, dan tracking status lamaran. MVP saat ini memakai storage lokal backend untuk queue/setting dan Google Sheets atau CSV lokal untuk tracker; arsitektur PRD berikutnya dapat dimigrasi ke SQLite/Turso + worker queue.

## Fitur

- Jelajahi lowongan dari scraping langsung Glints/JobStreet lewat BrowserAct, lalu auto queue jika lolos filter.
- Lamaran Saya untuk memantau status applied, needs input, interview, rejected, dan offer.
- Lamar Otomatis untuk menyiapkan queue, answer bank, dan guardrail sebelum worker BrowserAct berjalan.
- Pengaturan Sumber untuk sumber aktif, keyword default, target lokasi, blacklist, dan rule auto-apply.
- Profil & CV dengan profile auto-fill dari master CV Tirta Samara.
- Tombol `Reset to Master CV`.
- Upload template CV DOCX dan validasi placeholder wajib.
- Fetch job description dari link lowongan jika halaman bisa dibaca otomatis.
- AI analysis menggunakan Gemini API melalui backend.
- Generate tailored CV dalam format DOCX.
- Konversi PDF via LibreOffice CLI jika tersedia.
- Preview match score, skills matched/missing, CV improvement, cover letter, email, dan LinkedIn DM.
- Copy cover letter, email, dan LinkedIn DM.
- Save tracker ke Google Sheets.
- Fallback tracker ke `server/storage/tracker/job-tracker.csv`.
- Queue auto-apply lokal di `server/storage/auto-apply/state.json`.
- Worker auto-apply BrowserAct melalui `cd server && npm run auto-apply`.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- AI Provider: Gemini API
- CV Template: docxtemplater + pizzip
- Upload: multer
- Spreadsheet: Google Sheets API
- Storage: folder lokal backend
- PDF Converter: LibreOffice CLI

## Struktur

```text
ai-job-application-assistant/
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── middleware/
│   ├── storage/
│   ├── credentials/
│   ├── .env.example
│   └── package.json
└── README.md
```

## Setup Backend

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

Backend default:

```text
http://localhost:5001
```

Health check:

```text
GET http://localhost:5001/api/health
```

## Setup Frontend

```bash
cd client
npm install
npm run dev
```

Frontend default:

```text
http://localhost:5173
```

Jika backend memakai URL lain:

```bash
VITE_API_URL=http://localhost:5001 npm run dev
```

## Environment Variables

Buat `server/.env` dari `server/.env.example`:

```env
PORT=5001
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials/google-service-account.json
LIBREOFFICE_PATH=soffice
```

API key tidak pernah dipakai di frontend. Semua request AI lewat backend.

## Gemini API

1. Buat Gemini API key dari Google AI Studio.
2. Masukkan key ke `server/.env`.
3. Gunakan model aktif, misalnya:

```env
GEMINI_MODEL=gemini-2.5-flash
```

Jika model tidak tersedia untuk API key kamu, panggil Models API atau ganti ke model yang tersedia.

## Master CV Default

Saat aplikasi pertama dibuka, profile otomatis diisi dengan data master CV Tirta Samara:

- Full Name: Tirta Samara
- Target Role: Fullstack Web Developer
- Phone: +6281284964533
- Email: tirta4132@gmail.com
- Portfolio: portfoliotirta.vercel.app
- Location: Bogor
- Education, skills, experience, projects, dan certifications sudah terisi.

Perubahan user disimpan ke `localStorage`. Tombol `Reset to Master CV` mengembalikan profile ke data master.

## Template CV DOCX

Template sekarang memakai fixed-slot placeholder agar layout tetap stabil dan tidak acak-acakan. Upload template yang sudah disediakan:

```text
server/storage/templates/tirta_cv_fixed_slot_template.docx
```

Placeholder yang dipakai:

```text
{{FULL_NAME}}
{{TARGET_ROLE}}
{{CONTACT_LINE}}

{{SUMMARY_LINE_1}}
{{SUMMARY_LINE_2}}
{{SUMMARY_LINE_3}}
{{SUMMARY_LINE_4}}

{{WORK_TITLE}}
{{WORK_COMPANY_LOCATION}}
{{WORK_DATE}}
{{WORK_BULLET_1}}
{{WORK_BULLET_2}}

{{PROJECT_TITLE}}
{{PROJECT_INSTITUTION}}
{{PROJECT_DATE}}
{{PROJECT_BULLET_1}}
{{PROJECT_BULLET_2}}

{{EDUCATION_SCHOOL}}
{{EDUCATION_YEAR}}
{{EDUCATION_DEGREE}}

{{CERTIFICATION_1}}
{{CERTIFICATION_2}}
{{CERTIFICATION_3}}

{{SKILLS_WEB}}
{{SKILLS_FRAMEWORKS}}
{{SKILLS_BACKEND}}
{{SKILLS_TOOLS_AI}}
```

AI hanya boleh menyesuaikan slot berikut:

```text
SUMMARY_LINE_1 - SUMMARY_LINE_4
WORK_BULLET_1 - WORK_BULLET_2
PROJECT_BULLET_1 - PROJECT_BULLET_2
SKILLS_WEB
SKILLS_FRAMEWORKS
SKILLS_BACKEND
SKILLS_TOOLS_AI
```

Data fixed seperti nama, contact line, work title, company, project title, education, dan certifications tetap diambil dari CV master/profile.

Upload template melalui UI. Setelah upload, frontend otomatis memanggil:

```text
POST /api/check-template
```

Jika template belum lengkap, tombol generate tidak aktif dan UI menampilkan placeholder yang kurang.

## Google Sheets API

1. Buat Google Cloud project.
2. Enable Google Sheets API.
3. Buat Service Account.
4. Download JSON credential.
5. Simpan sebagai:

```text
server/credentials/google-service-account.json
```

6. Share spreadsheet ke `client_email` dari service account.
7. Isi `GOOGLE_SHEET_ID` di `server/.env`.

Kolom sheet:

```text
Week
Job Position
Company Name
Applying Date
Source Link
Apply Via
Status
CV Submitted
Portfolio Submitted
Cover Letter
Notes
CV File Link
Cover Letter Link
Match Score
Skills Matched
Skills Missing
Last Updated
```

Jika Google Sheets gagal, backend tidak crash dan data disimpan ke:

```text
server/storage/tracker/job-tracker.csv
```

## LibreOffice PDF

PDF conversion boleh gagal tanpa menggagalkan generate CV. Jika LibreOffice tidak ditemukan, backend tetap membuat DOCX dan response berisi:

```text
PDF conversion failed. DOCX file was generated successfully.
```

Windows:

1. Install LibreOffice.
2. Pastikan `soffice` bisa dipanggil dari terminal, atau isi path lengkap.

Contoh:

```env
LIBREOFFICE_PATH="C:\Program Files\LibreOffice\program\soffice.exe"
```

macOS/Linux:

```env
LIBREOFFICE_PATH=soffice
```

## Endpoint Backend

```text
POST /api/upload-template
POST /api/check-template
POST /api/fetch-job-url
POST /api/generate-application
POST /api/save-to-sheet
GET  /api/download/:filename
GET  /api/health
```

## Fetch Job From Link

User bisa mengisi `Source Link`, lalu klik `Fetch Job From Link`. Backend akan:

- Validasi URL.
- Hanya menerima `http` dan `https`.
- Memblokir `localhost`, `127.0.0.1`, `0.0.0.0`, private IP, dan `file://`.
- Fetch halaman dengan timeout 15 detik.
- Membersihkan HTML dari script, style, nav, footer, modal, cookie banner, dan elemen tidak relevan.
- Mengirim text halaman ke Gemini untuk ekstraksi data lowongan.
- Mengisi `applyVia` dari domain seperti Glints, Jobstreet, LinkedIn, Kalibrr, Indeed, atau Company Website.

Endpoint:

```text
POST /api/fetch-job-url
```

Body:

```json
{
  "url": "https://example.com/job"
}
```

Response sukses:

```json
{
  "success": true,
  "message": "Job description fetched successfully",
  "data": {
    "sourceLink": "",
    "companyName": "",
    "jobPosition": "",
    "jobDescription": "",
    "location": "",
    "workArrangement": "",
    "applyVia": "",
    "rawText": ""
  }
}
```

Jika website memakai JavaScript rendering, login, captcha, anti-scraping, atau text tidak terlihat seperti lowongan kerja, backend mengembalikan:

```text
Could not read this link automatically. Please paste the job description manually.
```

Jika text halaman terlalu pendek, backend memakai error internal:

```text
Page content is too short or does not contain a readable job description.
```

Fetch tidak langsung generate. User tetap bisa review dan edit hasil auto-fill sebelum klik `Generate Application`.

Success response:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "message": "...",
  "error": "..."
}
```

Template invalid response:

```json
{
  "success": false,
  "message": "Template CV belum lengkap",
  "data": {
    "foundPlaceholders": [],
    "missingPlaceholders": []
  }
}
```

## Menjalankan Project

Terminal 1:

```bash
cd ai-job-application-assistant/server
npm run dev
```

Terminal 2:

```bash
cd ai-job-application-assistant/client
npm run dev
```

Buka:

```text
http://localhost:5173
```

## Catatan Database

Project ini tidak menggunakan database, ORM, Prisma, Sequelize, MySQL, PostgreSQL, MongoDB, atau penyimpanan database lain.
