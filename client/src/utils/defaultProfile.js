export const MASTER_PROFILE = {
  fullName: "Tirta Samara",
  targetRole: "Fullstack Web Developer",
  contactLine: "",
  phone: "+6281284964533",
  email: "tirta4132@gmail.com",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "portfoliotirta.vercel.app",
  summary:
    "Fullstack Web Developer experienced in Laravel, React.js, Next.js, and Tailwind CSS. Skilled in building end-to-end web applications, integrating APIs, and managing databases. Experienced in academic research on AI & Computer Vision (YOLO, OpenCV) with strong problem-solving, collaboration, and communication skills. Focused on delivering scalable, high-quality solutions.",
  workTitle: "FULLSTACK WEB DEVELOPER INTERN",
  workCompanyLocation: "WIT Indonesia, Bandung",
  workDate: "Aug 2025 - Sep 2025",
  workBullets: [
    "Developed company projects using Laravel framework, building RESTful APIs and integrating front-end with back-end to deliver secure and scalable solutions.",
    "Collaborated with the team to meet client requirements, while optimizing application performance and enhancing overall user experience."
  ],
  projectTitle: "ACADEMIC PROJECT - LICENSE PLATE DETECTION SYSTEM",
  projectInstitution: "Indonesian Computer University",
  projectDate: "Feb 2025 - Jul 2025",
  projectBullets: [
    "Built a real-time license plate detection system using YOLOv8 and OpenCV, integrated with OCR (PaddleOCR) for number recognition with approximately 96% OCR accuracy.",
    "Secured data transmission with ChaCha20-Poly1305 encryption and MQTT protocol on Raspberry Pi, achieving approximately 85% detection accuracy (mAP@0.5) on a custom dataset."
  ],
  educationSchool: "Indonesian Computer University (UNIKOM)",
  educationYear: "2021 - 2025",
  educationDegree: "Bachelor of Computer Science",
  certifications: [
    "Certified Web Developer, BNSP",
    "Best Participant, MSIB Batch 6 (NF Academy)",
    "Participant, Google DevFest"
  ],
  skills: {
    web: "HTML5, CSS, JavaScript, PHP, Python, jQuery",
    frameworks: "React.js, Next.js, Laravel, Tailwind CSS",
    backend: "Node.js, MySQL, REST API",
    toolsAi: "Git, GitHub, OpenCV, YOLO (Object Detection)"
  }
};

function parseLegacyLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function migrateLegacyProfile(storedProfile = {}) {
  const experienceLines = parseLegacyLines(storedProfile.experience);
  const projectLines = parseLegacyLines(storedProfile.projects);
  const educationLines = parseLegacyLines(storedProfile.education);
  const certificationLines = parseLegacyLines(storedProfile.certifications).map((line) => line.replace(/^-\s*/, ""));
  const skillText = String(storedProfile.skills || "");

  return {
    ...storedProfile,
    linkedinUrl: storedProfile.linkedinUrl || storedProfile.linkedin || "",
    githubUrl: storedProfile.githubUrl || storedProfile.github || "",
    portfolioUrl: storedProfile.portfolioUrl || storedProfile.portfolio || "",
    summary: storedProfile.summary || storedProfile.professionalSummary,
    workTitle: storedProfile.workTitle || experienceLines[0],
    workCompanyLocation: storedProfile.workCompanyLocation || experienceLines[1],
    workDate: storedProfile.workDate || experienceLines[2],
    workBullets: storedProfile.workBullets || experienceLines.slice(3).map((line) => line.replace(/^-\s*/, "")),
    projectTitle: storedProfile.projectTitle || projectLines[0],
    projectInstitution: storedProfile.projectInstitution || projectLines[1],
    projectDate: storedProfile.projectDate || projectLines[2],
    projectBullets: storedProfile.projectBullets || projectLines.slice(3).map((line) => line.replace(/^-\s*/, "")),
    educationSchool: storedProfile.educationSchool || educationLines[0],
    educationYear: storedProfile.educationYear || educationLines[1],
    educationDegree: storedProfile.educationDegree || educationLines[2],
    certifications: Array.isArray(storedProfile.certifications) ? storedProfile.certifications : certificationLines,
    skills:
      storedProfile.skills && typeof storedProfile.skills === "object"
        ? storedProfile.skills
        : {
            web: skillText.match(/Web Fundamentals:\s*(.*)/i)?.[1] || "",
            frameworks: skillText.match(/Frameworks:\s*(.*)/i)?.[1] || "",
            backend: skillText.match(/Backend\s*&\s*Database:\s*(.*)/i)?.[1] || "",
            toolsAi: skillText.match(/Tools\s*&\s*AI:\s*(.*)/i)?.[1] || ""
          }
  };
}

function mergeSkillText(masterValue = "", storedValue = "") {
  const items = `${masterValue}, ${storedValue}`
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const normalized = new Set();

  return items
    .filter((item) => {
      const key = item.toLowerCase();

      if (normalized.has(key)) {
        return false;
      }

      normalized.add(key);
      return true;
    })
    .join(", ");
}

export function mergeProfileWithMaster(storedProfile = {}) {
  const migrated = migrateLegacyProfile(storedProfile);

  return {
    ...MASTER_PROFILE,
    ...migrated,
    workBullets: migrated.workBullets?.length ? migrated.workBullets : MASTER_PROFILE.workBullets,
    projectBullets: migrated.projectBullets?.length ? migrated.projectBullets : MASTER_PROFILE.projectBullets,
    certifications: migrated.certifications?.length ? migrated.certifications : MASTER_PROFILE.certifications,
    skills: {
      web: mergeSkillText(MASTER_PROFILE.skills.web, migrated.skills?.web),
      frameworks: mergeSkillText(MASTER_PROFILE.skills.frameworks, migrated.skills?.frameworks),
      backend: mergeSkillText(MASTER_PROFILE.skills.backend, migrated.skills?.backend),
      toolsAi: mergeSkillText(MASTER_PROFILE.skills.toolsAi, migrated.skills?.toolsAi)
    }
  };
}
