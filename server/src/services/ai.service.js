import { GoogleGenerativeAI } from "@google/generative-ai";

function safeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function trimWords(value, maxWords) {
  const words = safeString(value).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return safeString(value);
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function trimChars(value, maxChars) {
  const text = safeString(value);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 3).trim()}...`;
}

function trimSentence(value, maxChars = 170) {
  return trimChars(String(value || "").replace(/\s+/g, " ").trim(), maxChars);
}

function boundedScore(value, fallback = 0) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeSkillText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SKILL_ALIASES = [
  { canonical: "HTML5", aliases: ["html5", "html", "web fundamentals", "web developer", "frontend", "front end"] },
  { canonical: "CSS", aliases: ["css", "css3", "tailwind css", "tailwind", "web fundamentals", "frontend", "front end"] },
  { canonical: "jQuery", aliases: ["jquery", "j query"] },
  { canonical: "JavaScript", aliases: ["javascript", "js", "ecmascript"] },
  { canonical: "PHP", aliases: ["php"] },
  { canonical: "Python", aliases: ["python"] },
  { canonical: "React.js", aliases: ["react.js", "react", "reactjs"] },
  { canonical: "Next.js", aliases: ["next.js", "nextjs", "next"] },
  { canonical: "Laravel", aliases: ["laravel"] },
  { canonical: "Tailwind CSS", aliases: ["tailwind css", "tailwind"] },
  { canonical: "Node.js", aliases: ["node.js", "nodejs", "node"] },
  { canonical: "MySQL", aliases: ["mysql", "sql", "database", "relational database"] },
  { canonical: "REST API", aliases: ["rest api", "restful api", "restful apis", "api", "apis", "api integration"] },
  { canonical: "Git", aliases: ["git", "version control"] },
  { canonical: "GitHub", aliases: ["github"] },
  { canonical: "OpenCV", aliases: ["opencv", "computer vision"] },
  { canonical: "YOLO", aliases: ["yolo", "yolov8", "object detection"] }
];

function getAliasGroup(skill) {
  const normalizedSkill = normalizeSkillText(skill);
  return SKILL_ALIASES.find((group) => group.aliases.some((alias) => normalizeSkillText(alias) === normalizedSkill));
}

function includesSkillAlias(text, skill) {
  const normalizedText = normalizeSkillText(text);
  const normalizedSkill = normalizeSkillText(skill);
  const aliasGroup = getAliasGroup(skill);

  if (normalizedSkill && normalizedText.includes(normalizedSkill)) {
    return true;
  }

  return Boolean(aliasGroup?.aliases.some((alias) => normalizedText.includes(normalizeSkillText(alias))));
}

function uniqueSkills(skills) {
  return skills
    .map((skill) => String(skill || "").trim())
    .filter(Boolean)
    .filter((skill, index, values) => values.findIndex((item) => item.toLowerCase() === skill.toLowerCase()) === index);
}

function extractJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Gemini returned a non-JSON response.");
    }

    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
}

function profileSkillFilter(profile) {
  const profileText = [
    JSON.stringify(profile?.skills || ""),
    profile?.experience,
    profile?.projects,
    profile?.education,
    profile?.summary,
    profile?.workTitle,
    profile?.workCompanyLocation,
    profile?.workBullets?.join(" "),
    profile?.projectTitle,
    profile?.projectInstitution,
    profile?.projectBullets?.join(" "),
    profile?.educationSchool,
    profile?.educationDegree,
    Array.isArray(profile?.certifications) ? profile.certifications.join(" ") : profile?.certifications
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedProfileText = normalizeSkillText(profileText);

  return (skill) => {
    const normalizedSkill = normalizeSkillText(skill);

    if (!normalizedSkill) {
      return false;
    }

    if (normalizedProfileText.includes(normalizedSkill) || includesSkillAlias(profileText, skill)) {
      return true;
    }

    const meaningfulTokens = normalizedSkill.split(" ").filter((token) => token.length > 1);
    return meaningfulTokens.length > 0 && meaningfulTokens.every((token) => normalizedProfileText.includes(token));
  };
}

function getProfileSkills(profile) {
  if (profile?.skills && typeof profile.skills === "object" && !Array.isArray(profile.skills)) {
    return profile.skills;
  }

  const skillText = String(profile?.skills || "");

  return {
    web: skillText.match(/Web Fundamentals:\s*(.*)/i)?.[1] || skillText,
    frameworks: skillText.match(/Frameworks:\s*(.*)/i)?.[1] || "",
    backend: skillText.match(/Backend\s*&\s*Database:\s*(.*)/i)?.[1] || "",
    toolsAi: skillText.match(/Tools\s*&\s*AI:\s*(.*)/i)?.[1] || ""
  };
}

function mergeCategorySkills(aiText, profileCategoryText, matchedSkills) {
  const currentItems = String(aiText || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const currentText = currentItems.join(", ").toLowerCase();
  const categoryText = String(profileCategoryText || "").toLowerCase();

  const additions = matchedSkills.filter((skill) => {
    const key = skill.toLowerCase();
    return (categoryText.includes(key) || includesSkillAlias(profileCategoryText, skill)) && !currentText.includes(key);
  });

  const merged = uniqueSkills([...currentItems, ...additions]);

  return trimSentence(merged.join(", "), 220);
}

function extractKnownJobSkills(job) {
  const jobText = [job?.jobPosition, job?.jobDescription, job?.notes]
    .filter(Boolean)
    .join(" ");

  return SKILL_ALIASES.filter((group) => group.aliases.some((alias) => includesSkillAlias(jobText, alias))).map(
    (group) => group.canonical
  );
}

function normalizeAnalysis(raw, profile, job) {
  const skillExistsInProfile = profileSkillFilter(profile);
  const rawSkillsMatched = safeArray(raw.skillsMatched);
  const rawSkillsMissing = safeArray(raw.skillsMissing);
  const knownJobSkills = extractKnownJobSkills(job);
  const correctedMatched = [
    ...rawSkillsMatched,
    ...rawSkillsMissing.filter(skillExistsInProfile),
    ...knownJobSkills.filter(skillExistsInProfile)
  ];
  const uniqueMatched = uniqueSkills(correctedMatched);
  const skillsMatched = uniqueMatched.filter(skillExistsInProfile);
  const skillsMissing = uniqueSkills([
    ...rawSkillsMissing.filter((skill) => !skillExistsInProfile(skill)),
    ...knownJobSkills.filter((skill) => !skillExistsInProfile(skill))
  ]).filter((skill) => !skillsMatched.some((matchedSkill) => matchedSkill.toLowerCase() === skill.toLowerCase()));
  const profileSkills = getProfileSkills(profile);
  const afterOptimizationScore = boundedScore(
    raw.afterOptimizationScore ?? raw.optimizedMatchScore ?? raw.matchScore,
    boundedScore(raw.matchScore)
  );
  const beforeOptimizationScore = boundedScore(
    raw.beforeOptimizationScore ?? raw.originalMatchScore ?? raw.preOptimizationScore,
    afterOptimizationScore
  );

  return {
    matchScore: afterOptimizationScore,
    beforeOptimizationScore,
    afterOptimizationScore,
    skillsMatched,
    skillsMissing,
    summaryLine1: trimSentence(raw.summaryLine1),
    summaryLine2: trimSentence(raw.summaryLine2),
    summaryLine3: trimSentence(raw.summaryLine3),
    summaryLine4: trimSentence(raw.summaryLine4),
    workBullet1: trimSentence(raw.workBullet1, 220),
    workBullet2: trimSentence(raw.workBullet2, 220),
    projectBullet1: trimSentence(raw.projectBullet1, 220),
    projectBullet2: trimSentence(raw.projectBullet2, 220),
    skillsWeb: mergeCategorySkills(raw.skillsWeb, profileSkills.web, skillsMatched),
    skillsFrameworks: mergeCategorySkills(raw.skillsFrameworks, profileSkills.frameworks, skillsMatched),
    skillsBackend: mergeCategorySkills(raw.skillsBackend, profileSkills.backend, skillsMatched),
    skillsToolsAi: mergeCategorySkills(raw.skillsToolsAi, profileSkills.toolsAi, skillsMatched),
    coverLetter: trimWords(raw.coverLetter, 300),
    emailApplication: {
      subject: safeString(raw.emailApplication?.subject),
      body: safeString(raw.emailApplication?.body)
    },
    linkedinDM: trimChars(raw.linkedinDM, 700),
    cvImprovement: safeArray(raw.cvImprovement),
    notes: safeString(raw.notes)
  };
}

function buildPrompt(profile, job) {
  return `
You are an expert job application assistant.

Return only valid JSON. Do not wrap it in markdown.
Do not use markdown, backticks, bold markers, or extra headings.

Analyze the candidate profile and job description, then produce this exact JSON structure:
{
  "matchScore": number,
  "beforeOptimizationScore": number,
  "afterOptimizationScore": number,
  "skillsMatched": string[],
  "skillsMissing": string[],
  "summaryLine1": string,
  "summaryLine2": string,
  "summaryLine3": string,
  "summaryLine4": string,
  "workBullet1": string,
  "workBullet2": string,
  "projectBullet1": string,
  "projectBullet2": string,
  "skillsWeb": string,
  "skillsFrameworks": string,
  "skillsBackend": string,
  "skillsToolsAi": string,
  "coverLetter": string,
  "emailApplication": {
    "subject": string,
    "body": string
  },
  "linkedinDM": string,
  "cvImprovement": string[],
  "notes": string
}

Rules:
- Do not invent fake work experience, education, projects, achievements, certifications, companies, metrics, or skills.
- beforeOptimizationScore is the candidate's match score before AI tailoring, based on the original candidate profile against the job description.
- afterOptimizationScore is the expected match score after the allowed CV slots are optimized by your rewritten output.
- matchScore must equal afterOptimizationScore for backward compatibility.
- afterOptimizationScore should be greater than or equal to beforeOptimizationScore unless the profile has hard missing requirements that tailoring cannot improve.
- Use only skills already present in the candidate profile for skillsWeb, skillsFrameworks, skillsBackend, and skillsToolsAi.
- Treat skills in the candidate profile as confirmed skills. If the job requires HTML5, CSS, or jQuery and they appear in the profile skills, they must be skillsMatched and must not appear in skillsMissing.
- Use the Job JSON as the source of truth, especially jobDescription extracted from sourceLink when present.
- Automatically detect job-required skills, tools, frameworks, responsibilities, and keywords from the job description and align the CV slots to those requirements when the profile supports them.
- Treat close equivalents as matches when honest: HTML/HTML5, CSS/CSS3/Tailwind CSS, REST API/RESTful API/APIs, React/React.js, Node/Node.js, YOLO/YOLOv8.
- If a skill appears in the job description but not in the profile, add it to skillsMissing.
- Actively rewrite, highlight, summarize, reorder, and tailor the candidate's existing information so the generated CV feels aligned with the job description.
- Fully rewrite workBullet1 and workBullet2 from the original work description into job-specific CV bullets. These must not look like lightly edited copies.
- Fully rewrite projectBullet1 and projectBullet2 from the original project description into job-specific CV bullets. These must not look like lightly edited copies.
- Fully rewrite skillsWeb, skillsFrameworks, skillsBackend, and skillsToolsAi as job-targeted skill lines, not copied raw profile skill text.
- For skillsWeb, skillsFrameworks, skillsBackend, and skillsToolsAi, reorder, normalize naming, and trim the existing skills so the most job-relevant skills appear first.
- Include every job-required skill that is honestly supported by the candidate profile in either skillsMatched and the most appropriate CV skill slot.
- You may omit less relevant existing skills from the generated CV skills slots when space is limited.
- Compare the job description against the complete profile, especially education, skills, experience, projects, and certifications.
- AI may only adjust these CV slots: summaryLine1-summaryLine4, workBullet1-workBullet2, projectBullet1-projectBullet2, skillsWeb, skillsFrameworks, skillsBackend, skillsToolsAi.
- Do not change fixed candidate data such as full name, contact line, company names, institution names, dates, education, certifications, project titles, or work titles.
- Summary must be at most 4 short lines.
- Work experience must be exactly 2 concise bullets as plain text without bullet symbols.
- Project must be exactly 2 concise bullets as plain text without bullet symbols.
- Skills must stay in the same 4 categories.
- Default output language is professional English.
- Cover letter maximum 300 words.
- LinkedIn DM maximum 700 characters.
- The email application must be polite, professional, and ready to send.
- For a Fullstack Developer role, React, Laravel, REST API, MySQL/database, Git, and AI/Computer Vision interest should match when present in the profile. Golang must be missing if it is requested but absent from the profile.

Candidate profile JSON:
${JSON.stringify(profile, null, 2)}

Job JSON:
${JSON.stringify(job, null, 2)}
`;
}

function inferApplyVia(sourceUrl) {
  const host = new URL(sourceUrl).hostname.toLowerCase();

  if (host.includes("glints.com")) return "Glints";
  if (host.includes("jobstreet")) return "Jobstreet";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("kalibrr")) return "Kalibrr";
  if (host.includes("indeed.com")) return "Indeed";
  return "Company Website";
}

function normalizeParsedJob(raw, sourceUrl) {
  return {
    companyName: safeString(raw.companyName),
    jobPosition: safeString(raw.jobPosition),
    jobDescription: safeString(raw.jobDescription),
    location: safeString(raw.location),
    workArrangement: safeString(raw.workArrangement),
    applyVia: safeString(raw.applyVia) || inferApplyVia(sourceUrl),
    sourceLink: sourceUrl
  };
}

function buildJobParsePrompt(pageText, sourceUrl) {
  return `
You are a job description extraction engine.
Extract structured job information from the provided webpage text.

Rules:
- Return valid JSON only.
- Do not include markdown.
- Do not invent missing information.
- companyName must be taken from the webpage text.
- jobPosition must be taken from the webpage text.
- Keep the job description detailed and useful for CV tailoring.
- Preserve original job requirements, qualifications, responsibilities, and placement information.
- If there are responsibilities, qualifications, requirements, nice to have, company overview, location, or placement, include them in jobDescription.
- If information is not found, use an empty string.
- sourceLink must be exactly: ${sourceUrl}
- applyVia must follow this domain mapping:
  - glints.com = "Glints"
  - jobstreet = "Jobstreet"
  - linkedin.com = "LinkedIn"
  - kalibrr.com = "Kalibrr"
  - indeed.com = "Indeed"
  - otherwise = "Company Website"

Return JSON:
{
  "companyName": "",
  "jobPosition": "",
  "jobDescription": "",
  "location": "",
  "workArrangement": "",
  "applyVia": "",
  "sourceLink": ""
}

Webpage text:
${pageText}
`;
}

export async function analyzeApplication(profile, job) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Add GEMINI_API_KEY to server/.env.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json"
    }
  });

  const result = await model.generateContent(buildPrompt(profile, job));
  const text = result.response.text();
  return normalizeAnalysis(extractJson(text), profile, job);
}

export async function parseJobFromUrlText(pageText, sourceUrl) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Add GEMINI_API_KEY to server/.env.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  const result = await model.generateContent(buildJobParsePrompt(pageText, sourceUrl));
  const text = result.response.text();
  return normalizeParsedJob(extractJson(text), sourceUrl);
}
