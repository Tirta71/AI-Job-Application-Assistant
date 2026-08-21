export function normalizeApplicationQuestion(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function classifyApplicationQuestion(value) {
  const text = normalizeApplicationQuestion(value);
  if (!text) return "fallbackScreeningAnswer";

  if (/cover letter|cover note|motivation|motivasi|why (?:are you|do you)|mengapa.*tertarik|introduce yourself|perkenalkan diri/.test(text)) {
    return "defaultCoverNote";
  }
  if (/e-?mail|alamat email/.test(text)) return "emailAddress";
  if (/country code|kode negara/.test(text)) return "phoneCountryCode";
  if (/phone|mobile|whatsapp|nomor (?:hp|telepon)|no\.?(?: hp| telepon)/.test(text)) return "phoneNumber";
  if (/tinggal di|berdomisili di|live in|reside in|currently based in/.test(text)) return "livesInJobLocation";
  if (/current location|domicile|domisili|city|kota tempat tinggal|lokasi saat ini/.test(text)) return "currentLocation";
  if (/salary|gaji|upah|kompensasi|expected pay|ekspektasi/.test(text)) return "expectedSalary";
  if (/notice period|available to start|availability|kapan.*mulai|mulai bekerja|bergabung/.test(text)) return "noticePeriod";
  if (/qualification|kualifikasi|education|degree|gelar|pendidikan|sarjana|bachelor/.test(text)) return "educationLevel";
  if (/english|bahasa inggris/.test(text)) return "englishProficiency";
  if (/currently employed|current employment|sedang bekerja|status pekerjaan/.test(text)) return "currentEmploymentStatus";
  if (/eligible|eligibility|legally.*work|work authorization|hak bekerja|izin bekerja/.test(text)) return "workEligibility";
  if (/onsite|on-site|work from office|wfo|hybrid|relocat|penempatan/.test(text)) return "onsiteAvailability";
  if (/scrum|agile/.test(text)) return "scrumAgileExperience";
  if (/insurance|asuransi/.test(text)) return "insuranceExperience";
  if (/chat\s*bot/.test(text)) return "chatbotExperience";
  if (/graph\s*ql/.test(text)) return "graphqlExperience";
  if (/react(?:\.js|js)?/.test(text)) return "reactExperience";
  if (/javascript|typescript|java script/.test(text)) return "javascriptExperience";
  if (/laravel/.test(text)) return "laravelExperience";
  if (/\bphp\b/.test(text)) return "phpExperience";
  if (/node(?:\.js|js)?/.test(text)) return "nodeExperience";
  if (/which.*database|database technologies|database management systems|databases are you|database systems are you/.test(text)) return "databases";
  if (/revision control|version control|source control/.test(text)) return "versionControlTools";
  if (/rdbms|relational database/.test(text)) return "rdbmsExperience";
  if (/\bsql\b|mysql|postgres|database/.test(text)) return "sqlExperience";
  if (/computer.*network security|network security/.test(text)) return "networkSecurityExperience";
  if (/computer networking|networking industry/.test(text)) return "computerNetworkingExperience";
  if (/computer software|software industry/.test(text)) return "computerSoftwareExperience";
  if (/front\s*-?\s*end/.test(text)) return "frontendExperience";
  if (/back\s*-?\s*end/.test(text)) return "backendExperience";
  if (/full\s*-?\s*stack|website developer|web developer|software engineer|developer experience/.test(text)) return "fullstackExperience";
  return "fallbackScreeningAnswer";
}

export function experienceToNumber(value) {
  const text = normalizeApplicationQuestion(value);
  if (!text || /no experience|tidak ada|belum pernah|none/.test(text)) return "0";
  if (/less|under|<\s*1|kurang/.test(text)) return "0.5";
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return range[1];
  return text.match(/\d+(?:\.\d+)?/)?.[0] || "0";
}

export function answerForApplicationQuestion(question, answerBank = {}, fieldType = "text") {
  const key = classifyApplicationQuestion(question);
  const fallback = answerBank.fallbackScreeningAnswer || "No";
  const value = answerBank[key] ?? fallback;
  if (fieldType === "number" && /Experience$/.test(key)) return experienceToNumber(value);
  return String(value ?? fallback);
}
