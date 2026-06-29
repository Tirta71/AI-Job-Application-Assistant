import axios from "axios";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { parseJobFromUrlText } from "./ai.service.js";

const MAX_TEXT_LENGTH = 12000;
const MIN_JOB_TEXT_LENGTH = 300;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 15000;
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0"]);

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  if (net.isIP(ip) === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("::ffff:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return false;
}

function validateSourceUrl(url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error("Blocked host.");
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Blocked private IP address.");
  }

  parsed.hash = "";
  return parsed;
}

async function assertPublicHostname(parsedUrl) {
  const records = await dns.lookup(parsedUrl.hostname, { all: true });

  if (!records.length) {
    throw new Error("Could not resolve URL hostname.");
  }

  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Blocked private network target.");
  }
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t\f\v]*\n[ \t\f\v]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function extractReadableText(html, sourceUrl) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, aside, form, iframe").remove();
  $("[class*='ads'], [id*='ads'], [class*='modal'], [id*='modal'], [class*='cookie'], [id*='cookie']").remove();

  const cleanedHtml = $.html();
  let readableText = "";

  try {
    const dom = new JSDOM(cleanedHtml, { url: sourceUrl });
    const article = new Readability(dom.window.document).parse();
    readableText = article?.textContent || "";
  } catch {
    readableText = "";
  }

  const bodyText = $("body").text();
  const bestText = readableText.length > bodyText.length * 0.35 ? readableText : bodyText;
  return normalizeText(bestText);
}

function assertLooksLikeJob(text) {
  const lower = text.toLowerCase();
  const jobSignals = [
    "job",
    "position",
    "responsibilities",
    "requirements",
    "qualification",
    "qualifications",
    "apply",
    "experience",
    "skills",
    "candidate",
    "role",
    "lowongan",
    "kualifikasi",
    "tanggung jawab"
  ];

  const signalCount = jobSignals.filter((signal) => lower.includes(signal)).length;

  if (text.length < MIN_JOB_TEXT_LENGTH) {
    throw new Error("Page content is too short or does not contain a readable job description.");
  }

  if (signalCount < 2) {
    throw new Error("Page content is too short or does not contain a readable job description.");
  }
}

async function fetchHtmlWithSafeRedirects(initialUrl) {
  let currentUrl = initialUrl;
  const startedAt = Date.now();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const remainingTimeout = REQUEST_TIMEOUT_MS - (Date.now() - startedAt);

    if (remainingTimeout <= 0) {
      throw new Error("Request timed out.");
    }

    const parsedUrl = validateSourceUrl(currentUrl);
    await assertPublicHostname(parsedUrl);

    const response = await axios.get(parsedUrl.toString(), {
      timeout: remainingTimeout,
      maxRedirects: 0,
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    validateStatus: (status) => status >= 200 && status < 400
  });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;

      if (!location) {
        throw new Error("Redirect response did not include a location.");
      }

      currentUrl = new URL(location, parsedUrl).toString();
      continue;
    }

    return {
      response,
      finalUrl: parsedUrl.toString()
    };
  }

  throw new Error("Too many redirects.");
}

export async function fetchJobFromUrl(url) {
  const parsedUrl = validateSourceUrl(url);
  const { response, finalUrl } = await fetchHtmlWithSafeRedirects(parsedUrl.toString());

  const contentType = String(response.headers["content-type"] || "");
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("URL did not return an HTML page.");
  }

  const rawText = extractReadableText(response.data, finalUrl);
  assertLooksLikeJob(rawText);

  const parsedJob = await parseJobFromUrlText(rawText, parsedUrl.toString());

  return {
    ...parsedJob,
    rawText
  };
}
