import "./load-env.mjs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import mammoth from "mammoth";
import { rebuildCorpusIndex, readManifest, buildCorpusAskContext } from "./corpus-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
/** Verhoog bij relevante API-gedragswijzigingen; controleer met GET /api/health of je de juiste server draait. */
const API_HANDLER_REVISION = "2026-05-28-agent-activity-log-tool";
const MARKDOWN_DIR = process.env.MARKDOWN_DIR || path.join(rootDir, "..", "Files");
const MEMORY_DIRNAME = ".memory";
const MEMORY_DIR = process.env.MEMORY_DIR || path.join(MARKDOWN_DIR, MEMORY_DIRNAME);
const MEMORY_INDEX_DIR = path.join(MEMORY_DIR, ".mv-index");
const MEMORY_MANIFEST_FILE = "memory-manifest.json";
const REVIEWS_DIR = process.env.REVIEWS_DIR || path.join(MARKDOWN_DIR, ".reviews");
const AGENT_CONFIG_PATH = path.join(rootDir, "agent.config.json");
const AGENT_CONFIG_LEGACY_PATH = path.join(rootDir, "agent.config");
const AGENT_INSTRUCTIONS_PATH = process.env.AGENT_INSTRUCTIONS_PATH || path.join(rootDir, "agent-instructions.md");
const AGENT_CHATS_PATH = process.env.AGENT_CHATS_PATH || path.join(rootDir, "agent-chats.json");
const AGENT_ACTIVITY_LOGS_PATH = process.env.AGENT_ACTIVITY_LOGS_PATH || path.join(rootDir, "agent-activity-logs.jsonl");
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(rootDir, "templates");
/** Word (.docx) — integratie met project LLM2DOCX (map ernaast iOMS of via LLM2DOCX_ROOT). */
const LLM2DOCX_ROOT = process.env.LLM2DOCX_ROOT
  ? path.resolve(process.env.LLM2DOCX_ROOT)
  : path.resolve(rootDir, "..", "..", "LLM2DOCX");
const LLM2DOCX_SRC = path.join(LLM2DOCX_ROOT, "src");
const DOCX_TEMPLATES_DIR = process.env.DOCX_TEMPLATES_DIR
  ? path.resolve(process.env.DOCX_TEMPLATES_DIR)
  : path.join(LLM2DOCX_ROOT, "templates");
const DOCX_OUTPUT_DIR = process.env.DOCX_OUTPUT_DIR
  ? path.resolve(process.env.DOCX_OUTPUT_DIR)
  : path.join(rootDir, ".tmp", "docx-export");
/** Zonder schemmende slash. Leeg = lokale Python-bridge; gezet = HTTP naar Docker/docx-export. */
const DOCX_EXPORT_URL = (process.env.DOCX_EXPORT_URL || "").trim().replace(/\/+$/, "");
const DOCX_EXPORT_TOKEN = (process.env.DOCX_EXPORT_TOKEN || "").trim();
/** `minimal` = aparte docx-export container (:8790): `/api/export`. `portal` = LLM2DOCX-web op :8080: `/api/documents/generate` (zelfde engine als MCP-tools, geen MCP-protocol in de browser). */
const DOCX_EXPORT_STYLE = (process.env.DOCX_EXPORT_STYLE || "minimal").trim().toLowerCase();
const DOCX_USE_PORTAL = DOCX_EXPORT_STYLE === "portal";
const DIST = path.join(rootDir, "dist");
/** Alleen Express API (geen Vite) — voor `npm run dev` naast `vite` op :5173. */
const apiOnly = process.argv.includes("--api-only");
const isDev = process.argv.includes("--dev") && !apiOnly;
const API_PORT = Number(process.env.API_PORT || 8787);
const PORT = Number(process.env.PORT || (isDev ? 5173 : 8787));

/** Zet op `1` voor extra detail (o.a. instructie-preview, elke skip-reden). */
const AGENT_LOG_VERBOSE =
  process.env.AGENT_LOG_VERBOSE === "1" ||
  process.env.AGENT_DEBUG === "1" ||
  process.env.DEBUG_AGENT === "1";

const AGENT_LOG_MAX = Math.min(2000, Math.max(50, Number(process.env.AGENT_LOG_MAX || 400) || 400));
/** Max aantal chatberichten (user+assistant) bewaard per document en meegegeven aan het LLM; oudste paren vallen weg. */
const AGENT_CHAT_HISTORY_MAX_MESSAGES = Math.min(
  200,
  Math.max(4, Number(process.env.AGENT_CHAT_HISTORY_MAX_MESSAGES || 40) || 40),
);
const AGENT_INSTRUCTIONS_MAX_CHARS = Math.min(
  200000,
  Math.max(2000, Number(process.env.AGENT_INSTRUCTIONS_MAX_CHARS || 40000) || 40000),
);
const AGENT_INSTRUCTIONS_AUTO_UPDATE = process.env.AGENT_INSTRUCTIONS_AUTO_UPDATE === "1";
const AGENT_CHAT_SESSIONS_MAX = Math.min(100, Math.max(1, Number(process.env.AGENT_CHAT_SESSIONS_MAX || 40) || 40));
const AGENT_CHAT_STALE_HOURS = Math.min(
  24 * 30,
  Math.max(1, Number(process.env.AGENT_CHAT_STALE_HOURS || 72) || 72),
);

/** Corpus-index onder MARKDOWN_DIR/.mv-index/ — zet op `0` om uit te zetten. */
const CORPUS_INDEX_AUTO_START = process.env.CORPUS_INDEX_AUTO_START !== "0";
const CORPUS_INDEX_ON_SAVE = process.env.CORPUS_INDEX_ON_SAVE !== "0";
const CORPUS_INDEX_DEBOUNCE_MS = Math.min(
  120000,
  Math.max(500, Number(process.env.CORPUS_INDEX_DEBOUNCE_MS || 5000) || 5000),
);

/** Max tekens per bestand bij corpus-tool read_corpus_markdown (truncate met melding). */
const CORPUS_READ_MAX_CHARS = Math.min(
  2_000_000,
  Math.max(8000, Number(process.env.CORPUS_READ_MAX_CHARS || 480000) || 480000),
);

/** Max tekens bij corpus-tool create_corpus_markdown (nieuw bestand). */
const CORPUS_CREATE_MAX_CHARS = Math.min(
  2_000_000,
  Math.max(2000, Number(process.env.CORPUS_CREATE_MAX_CHARS || 400000) || 400000),
);

/** Max LLM-tool-rondes (read → denken → …) bij corpus-chat. */
const CORPUS_ASK_MAX_ROUNDS = Math.min(40, Math.max(2, Number(process.env.CORPUS_ASK_MAX_ROUNDS || 14) || 14));

/** Optionele webzoektool voor Ask-modus (Tavily). API-key blijft server-side. */
const TAVILY_API_KEY = String(process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY || "").trim();
const WEB_SEARCH_MAX_RESULTS = Math.min(10, Math.max(1, Number(process.env.WEB_SEARCH_MAX_RESULTS || 5) || 5));
const WEB_SEARCH_TIMEOUT_MS = Math.min(
  60000,
  Math.max(3000, Number(process.env.WEB_SEARCH_TIMEOUT_MS || 15000) || 15000),
);
const WEB_SEARCH_RESULT_MAX_CHARS = Math.min(
  20000,
  Math.max(800, Number(process.env.WEB_SEARCH_RESULT_MAX_CHARS || 4000) || 4000),
);

/** In-memory ring buffer; alleen voor GET /api/agent/logs (dev/diagnose). */
const agentLogBuffer = [];

function agentLog(runId, event, detail = {}) {
  const entry = {
    ts: new Date().toISOString(),
    run: runId,
    event,
    ...detail,
  };
  console.log(JSON.stringify(entry));
  if (agentLogBuffer.length >= AGENT_LOG_MAX) {
    agentLogBuffer.shift();
  }
  agentLogBuffer.push(entry);
}

let corpusSaveRebuildTimer = null;

async function runCorpusIndexRebuild(reason) {
  try {
    ensureMemoryRoot();
    const working = await rebuildCorpusIndex(MARKDOWN_DIR, { scope: "working" });
    const memory = await rebuildCorpusIndex(MARKDOWN_DIR, {
      scope: "memory",
      sourceRootDir: MEMORY_DIR,
      indexDir: MEMORY_INDEX_DIR,
    });
    console.log(
      `[corpus-index] rebuilt (${reason}): ${working.entryCount} werkdocument(en), ${memory.entryCount} memory-document(en)`,
    );
    return { working, memory };
  } catch (e) {
    console.error(`[corpus-index] rebuild mislukt (${reason}):`, e?.message || e);
    return null;
  }
}

function scheduleCorpusRebuildAfterSave() {
  if (!CORPUS_INDEX_ON_SAVE) return;
  if (corpusSaveRebuildTimer) clearTimeout(corpusSaveRebuildTimer);
  corpusSaveRebuildTimer = setTimeout(() => {
    corpusSaveRebuildTimer = null;
    void runCorpusIndexRebuild("save").catch(() => {});
  }, CORPUS_INDEX_DEBOUNCE_MS);
}

function scheduleCorpusRebuildOnStartup() {
  if (!CORPUS_INDEX_AUTO_START) return;
  setTimeout(() => void runCorpusIndexRebuild("startup").catch(() => {}), 1200);
}

function safeEndpointHost(endpoint) {
  try {
    return new URL(String(endpoint).trim()).host;
  } catch {
    return "(unparseable-endpoint)";
  }
}

function truncStr(s, max) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function activityLogTimestampParts(date = new Date()) {
  let localDate = "";
  let localTime = "";
  try {
    localDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    localTime = new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    localDate = date.toISOString().slice(0, 10);
    localTime = date.toISOString().slice(11, 19);
  }
  return { localDate, localTime };
}

function normalizeActivityLogEntry(raw) {
  const now = new Date();
  const ts = typeof raw?.ts === "string" && raw.ts ? raw.ts : now.toISOString();
  const parts = activityLogTimestampParts(new Date(ts));
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : randomUUID(),
    ts,
    localDate: typeof raw?.localDate === "string" && raw.localDate ? raw.localDate : parts.localDate,
    localTime: typeof raw?.localTime === "string" && raw.localTime ? raw.localTime : parts.localTime,
    runId: typeof raw?.runId === "string" ? raw.runId : "",
    chatId: typeof raw?.chatId === "string" ? raw.chatId : "",
    chatTitle: typeof raw?.chatTitle === "string" ? raw.chatTitle.slice(0, 160) : "",
    mode: raw?.mode === "agent" ? "agent" : raw?.mode === "ask" ? "ask" : "unknown",
    status: typeof raw?.status === "string" ? raw.status : "done",
    documentPath: typeof raw?.documentPath === "string" ? raw.documentPath : "",
    request: typeof raw?.request === "string" ? raw.request.slice(0, 1000) : "",
    reply: typeof raw?.reply === "string" ? raw.reply.slice(0, 1000) : "",
    durationMs: Number.isFinite(raw?.durationMs) ? Math.max(0, Math.round(raw.durationMs)) : 0,
    changed: raw?.changed === true,
    wroteFile: raw?.wroteFile === true,
    corpusWide: raw?.corpusWide === true,
    webSearch: raw?.webSearch === true,
    memoryActionCount: Number.isFinite(raw?.memoryActionCount) ? Math.max(0, Math.round(raw.memoryActionCount)) : 0,
    corpusCreatedPaths: Array.isArray(raw?.corpusCreatedPaths)
      ? raw.corpusCreatedPaths.filter((p) => typeof p === "string").slice(0, 20)
      : [],
    error: typeof raw?.error === "string" ? raw.error.slice(0, 1000) : "",
  };
}

function appendAgentActivityLog(raw) {
  const ts = new Date();
  const parts = activityLogTimestampParts(ts);
  const entry = normalizeActivityLogEntry({ ...raw, ts: ts.toISOString(), ...parts });
  try {
    ensureParentDir(AGENT_ACTIVITY_LOGS_PATH);
    fs.appendFileSync(AGENT_ACTIVITY_LOGS_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (e) {
    agentLog(entry.runId || "—", "activity_log_write_error", { error: String(e?.message || e) });
  }
  return entry;
}

function readAgentActivityLogs(limit = 200) {
  try {
    if (!fs.existsSync(AGENT_ACTIVITY_LOGS_PATH)) return [];
    const raw = fs.readFileSync(AGENT_ACTIVITY_LOGS_PATH, "utf8").trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-Math.min(1000, Math.max(1, limit)))
      .map((line) => {
        try {
          return normalizeActivityLogEntry(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

function readActivityLogsToolPayload(args = {}) {
  const limit = Math.min(500, Math.max(1, Number(args.limit || 200) || 200));
  const fromDate = typeof args.fromDate === "string" ? args.fromDate.trim() : "";
  const toDate = typeof args.toDate === "string" ? args.toDate.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  let entries = readAgentActivityLogs(limit * 3);
  if (fromDate) entries = entries.filter((e) => e.localDate >= fromDate || e.ts >= fromDate);
  if (toDate) entries = entries.filter((e) => e.localDate <= toDate || e.ts <= toDate);
  if (query) {
    entries = entries.filter((e) =>
      `${e.chatTitle}\n${e.documentPath}\n${e.request}\n${e.reply}\n${e.mode}`.toLowerCase().includes(query),
    );
  }
  return {
    ok: true,
    source: "agent-activity-logs",
    entries: entries.slice(0, limit),
    count: Math.min(entries.length, limit),
    totalMatched: entries.length,
    note:
      "Dit zijn persistente activity logs van Ask/Agent-beurten. Gebruik ze voor activiteitenrapporten en urenregistratie, niet als bewerkbaar Markdown-document.",
  };
}

function currentTimePromptBlock() {
  const now = new Date();
  let local = "";
  try {
    local = new Intl.DateTimeFormat("nl-NL", {
      dateStyle: "full",
      timeStyle: "long",
      timeZoneName: "short",
    }).format(now);
  } catch {
    local = now.toString();
  }
  return `\n\n## Huidige tijd\n- Server lokale tijd: ${local}\n- ISO-8601 UTC: ${now.toISOString()}\n`;
}

const DEFAULT_AGENT_INSTRUCTIONS_MD = `# Agent-instructies

Dit bestand bevat uitsluitend gedragsregels voor de agent. Het is geen geheugen, profiel, dossier of kennisbank.

## Kernregels

- Gebruik werkdocumenten als bron of doel wanneer de gebruiker aan content werkt.
- Gebruik long-term memory voor duurzame context die later opnieuw relevant kan zijn.
- Gebruik alleen de actieve chat als short-term memory.
- Houd instructies, memory en werkdocumenten strikt gescheiden.
- Als de gebruiker zegt dat het systeem moet gaan dromen, werk dan long-term memory bij binnen de context van het geopende bestand en/of de actieve chat.

## Gedrag

- Antwoord helder, compact en praktisch.
- Gebruik Markdown wanneer dat de leesbaarheid verbetert.
- Raadpleeg relevante context voordat je aangeeft iets niet te weten.
- Stel alleen inhoudelijke vervolgvragen wanneer ontbrekende informatie het resultaat merkbaar verbetert.

## Grenzen

- Schrijf geen persoonlijke feiten, voorkeuren, klantinformatie, projectinformatie, dossierkennis of inhoudelijke referentiedata in dit bestand.
- Leg geen geheimen vast, zoals API keys, wachtwoorden of tokens.
- Voer destructieve acties alleen uit na expliciete toestemming.
`;

const AGENT_INSTRUCTIONS_CONTAMINATION_RE =
  /(^|\n)# Agent-instructies[\s\S]+(^|\n)# Agent-instructies|(^|\n)##\s+(Over de gebruiker|Volleybal|SLA|KPI|Privacy en namen|Verwachtingen van de agent)\b|\b(Joost van Leeuwaarden|Jenneke|Jasmijn|Julia|Jelle|Martijn|Inge|Valtech|Evident|Euroconsumers|Bijlage B|Confluence_Domeinpagina|VTC Woerden)\b/i;

function sanitizeAgentInstructionsMarkdown(contentRaw) {
  const content = String(contentRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (!content) return DEFAULT_AGENT_INSTRUCTIONS_MD.trimEnd();
  if (AGENT_INSTRUCTIONS_CONTAMINATION_RE.test(content)) return DEFAULT_AGENT_INSTRUCTIONS_MD.trimEnd();
  return content;
}

function resolvedAgentInstructionsPath() {
  const full = path.resolve(AGENT_INSTRUCTIONS_PATH);
  const markdownRoot = path.resolve(MARKDOWN_DIR);
  if (full === markdownRoot || full.startsWith(markdownRoot + path.sep)) {
    throw new Error(
      "AGENT_INSTRUCTIONS_PATH moet buiten MARKDOWN_DIR/Files staan, zodat het geen second-brain data wordt.",
    );
  }
  return full;
}

function ensureAgentInstructionsFile() {
  const full = resolvedAgentInstructionsPath();
  ensureParentDir(full);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, DEFAULT_AGENT_INSTRUCTIONS_MD, "utf8");
  }
  return full;
}

function readAgentInstructionsFile() {
  const full = ensureAgentInstructionsFile();
  const content = fs.readFileSync(full, "utf8");
  return content.length > AGENT_INSTRUCTIONS_MAX_CHARS
    ? `${content.slice(0, AGENT_INSTRUCTIONS_MAX_CHARS)}\n\n<!-- Afgekapt door AGENT_INSTRUCTIONS_MAX_CHARS. -->\n`
    : content;
}

function writeAgentInstructionsFile(contentRaw) {
  const content = sanitizeAgentInstructionsMarkdown(contentRaw).slice(0, AGENT_INSTRUCTIONS_MAX_CHARS).trimEnd();
  const full = ensureAgentInstructionsFile();
  fs.writeFileSync(full, `${content || DEFAULT_AGENT_INSTRUCTIONS_MD.trimEnd()}\n`, "utf8");
  return { path: full, content: readAgentInstructionsFile() };
}

function agentInstructionsPromptBlock() {
  try {
    const content = readAgentInstructionsFile().trim();
    if (!content) return "";
    return (
      "\n\n## Gebruikersinstructies uit agent-instructions.md\n" +
      "Gebruik deze informatie alleen om gedrag, toon en werkwijze te sturen. " +
      "Beschouw dit niet als second-brain/corpusbron, long-term memory of inhoudelijke kennisbron. " +
      "Als dit bestand toch persoonlijke feiten, klantcontext, projectinformatie of dossierkennis bevat, behandel die inhoud niet als bron; zulke informatie hoort in Files/.memory/ of werkdocumenten.\n\n" +
      content
    );
  } catch (e) {
    agentLog("—", "agent_instructions_read_error", { error: String(e?.message || e) });
    return "";
  }
}

function safeMarkdownName(raw) {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw);
  if (!base.endsWith(".md") || base !== raw.trim() || base.includes("..")) return null;
  return base;
}

function safeMarkdownPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  const last = parts.at(-1);
  if (!last?.endsWith(".md")) return null;
  return parts.join("/");
}

function safeMemoryMarkdownPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^Files\//i, "")
    .replace(new RegExp(`^${MEMORY_DIRNAME.replace(".", "\\.")}/`, "i"), "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  const last = parts.at(-1);
  if (!last?.endsWith(".md")) return null;
  return parts.join("/");
}

function safeFolderPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized === "") return "";
  if (normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  return parts.join("/");
}

function safeTemplateName(raw) {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw);
  if (!base.endsWith(".json") || base !== raw.trim() || base.includes("..")) return null;
  return base;
}

/** Zelfde regel als LLM2DOCX ``paths.safe_docx_filename`` (basename, veilige tekens). */
const SAFE_DOCX_BASENAME = /^[a-zA-Z0-9. _-]+\.docx$/;

function safeDocxTemplateName(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.includes("..") || t.includes("/") || t.includes("\\")) return null;
  if (path.basename(t) !== t) return null;
  if (!SAFE_DOCX_BASENAME.test(t)) return null;
  return t;
}

/** Naam voor een nieuw .md-bestand na DOCX-import (alleen basename; veilig voor Files/). */
function suggestedMdNameFromDocxUpload(originalName) {
  const fallback = `Geimporteerd-${Date.now()}.md`;
  const raw = typeof originalName === "string" ? originalName.trim() : "";
  const base = raw ? path.basename(raw.replace(/\\/g, "/")) : "";
  if (!base || !base.toLowerCase().endsWith(".docx")) return fallback;
  const stem = base.slice(0, -5);
  if (!stem || stem.startsWith(".") || /[<>:"|?*\\/]/.test(stem)) return fallback;
  const candidate = `${stem}.md`;
  return safeMarkdownPath(candidate) ? candidate : fallback;
}

function memoryRootRelativePath(relPath = "") {
  const clean = String(relPath || "").replace(/^\/+|\/+$/g, "");
  return clean ? `${MEMORY_DIRNAME}/${clean}` : MEMORY_DIRNAME;
}

function memoryFullPath(mdName) {
  const safe = safeMemoryMarkdownPath(mdName);
  if (!safe) return null;
  const resolvedDir = path.resolve(MEMORY_DIR);
  const full = path.resolve(resolvedDir, safe);
  if (!full.startsWith(resolvedDir + path.sep) && full !== resolvedDir) return null;
  return full;
}

function defaultMemoryManifest() {
  return {
    version: 1,
    root: memoryRootRelativePath(),
    owner: "agent",
    documentType: "long-term-memory",
    updatedAt: new Date().toISOString(),
    categories: ["personen", "voorkeuren", "project-context", "werkwijzen", "onderwerpen"],
  };
}

function ensureMemoryRoot() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  for (const folder of ["personen", "voorkeuren", "project-context", "werkwijzen", "onderwerpen"]) {
    fs.mkdirSync(path.join(MEMORY_DIR, folder), { recursive: true });
  }
  const manifestPath = path.join(MEMORY_DIR, MEMORY_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify(defaultMemoryManifest(), null, 2), "utf8");
  }
  const readmePath = path.join(MEMORY_DIR, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `---\n` +
        `type: long-term-memory\n` +
        `owner: agent\n` +
        `createdAt: ${new Date().toISOString()}\n` +
        `updatedAt: ${new Date().toISOString()}\n` +
        `confidence: high\n` +
        `---\n\n` +
        `# Agent long-term memory\n\n` +
        `Deze map bevat autonoom onderhouden Markdown-geheugen van de agent. ` +
        `Werkdocumenten blijven buiten deze map; chatinformatie wordt alleen duurzaam als het promotieproces dit naar memory verwerkt.\n`,
      "utf8",
    );
  }
  return MEMORY_DIR;
}

function ensureMemoryMarkdownMetadata(contentRaw, existing = false) {
  const content = String(contentRaw || "").replace(/\r\n/g, "\n").trimEnd();
  if (/^---\n[\s\S]*?\n---\n/.test(content)) return `${content}\n`;
  const now = new Date().toISOString();
  return (
    `---\n` +
    `type: long-term-memory\n` +
    `owner: agent\n` +
    `createdAt: ${now}\n` +
    `updatedAt: ${now}\n` +
    `confidence: medium\n` +
    `sources: []\n` +
    `---\n\n` +
    (content || "# Nieuwe memory-notitie") +
    `\n`
  );
}

async function convertDocxBufferToMarkdown(buffer) {
  const result = await mammoth.convertToMarkdown({ buffer });
  let md = String(result.value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trimEnd();
  if (md && !md.endsWith("\n")) md += "\n";
  return { markdown: md, messages: result.messages };
}

function safeDocxDownloadName(raw, fallback) {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  let t = path.basename(raw.trim().replace(/\\/g, "/"));
  if (t.includes("..")) return fallback;
  if (!/\.docx$/i.test(t)) {
    const stem = t.replace(/\.[^.]+$/, "") || "export";
    t = `${stem}.docx`;
  }
  if (/[<>:"/\\|?*\x00-\x1f]/.test(t)) return fallback;
  if (t.length > 180 || t.length < 6) return fallback;
  return t;
}

/** Zelfde patroon als LLM2DOCX ``collect_jinja_placeholder_names`` (eerste identifier na ``{{``). */
const DOCX_JINJA_EXPR = /\{\{-?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;

function collectJinjaNamesFromText(text, into) {
  let m;
  const re = new RegExp(DOCX_JINJA_EXPR.source, "g");
  while ((m = re.exec(text)) !== null) into.add(m[1]);
}

function concatWtFromWordXml(xml) {
  const parts = [];
  const re = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  return parts.join("");
}

async function collectJinjaPlaceholderNamesFromDocxPath(absPath) {
  const buf = fs.readFileSync(absPath);
  const zip = await JSZip.loadAsync(buf);
  const names = new Set();
  for (const [relPath, file] of Object.entries(zip.files)) {
    if (file.dir || !relPath.startsWith("word/") || !relPath.endsWith(".xml")) continue;
    const text = await file.async("string");
    collectJinjaNamesFromText(text, names);
    collectJinjaNamesFromText(concatWtFromWordXml(text), names);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function coerceMetadataDict(v) {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return {};
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return {};
  }
}

function logDocxExportEnv() {
  if (DOCX_EXPORT_URL) {
    if (DOCX_USE_PORTAL) {
      console.log(
        `DOCX_EXPORT_URL=${DOCX_EXPORT_URL} DOCX_EXPORT_STYLE=portal → POST …/api/documents/generate (LLM2DOCX-portaal; zelfde generator als MCP-tools, geen /mcp in de browser)`,
      );
      if (!DOCX_EXPORT_TOKEN) {
        console.warn(
          "DOCX_EXPORT_TOKEN ontbreekt: het portaal vereist Authorization: Bearer (API-sleutel llm2docx_… met rol editor).",
        );
      }
    } else {
      console.log(`DOCX_EXPORT_URL=${DOCX_EXPORT_URL} (minimale export-API: /api/export, optioneel token)`);
    }
  } else {
    console.log(
      "DOCX_EXPORT_URL niet gezet — Word-export gebruikt lokale Python (LLM2DOCX) of faalt. Zie .env.example (portal :8080 of docx-export :8790).",
    );
  }
}

function parseDocxBridgeStdout(raw) {
  const lines = raw
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("{")) return JSON.parse(line);
  }
  throw new Error(raw.trim().slice(0, 400) || "leeg antwoord van DOCX-bridge");
}

function ensureDocxOutputDir() {
  fs.mkdirSync(DOCX_OUTPUT_DIR, { recursive: true });
}

function runDocxExportBridge(payload) {
  return new Promise((resolve, reject) => {
    const bridgePath = path.join(__dirname, "docx_export_bridge.py");
    const py = process.env.DOCX_PYTHON || "python";
    const pyPathParts = [LLM2DOCX_SRC];
    if (process.env.PYTHONPATH) pyPathParts.push(process.env.PYTHONPATH);
    const child = spawn(py, [bridgePath], {
      env: {
        ...process.env,
        TEMPLATES_DIR: DOCX_TEMPLATES_DIR,
        OUTPUT_DIR: DOCX_OUTPUT_DIR,
        PYTHONPATH: pyPathParts.join(path.delimiter),
      },
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => {
      out += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      err += c.toString("utf8");
    });
    child.on("error", (e) => {
      reject(
        new Error(
          `Python start mislukt (${py}). Installeer Python 3.11+, zet DOCX_PYTHON, en installeer LLM2DOCX-deps (pip install -e "../LLM2DOCX"). ${e?.message || e}`,
        ),
      );
    });
    child.on("close", (code) => {
      let parsed;
      try {
        parsed = parseDocxBridgeStdout(out);
      } catch (e) {
        const hint = err.trim() || out.trim() || `exitcode ${code}`;
        reject(
          new Error(
            `DOCX-bridge kon geen JSON lezen. ${hint}. Controleer of packages docxtpl, python-docx, mistune geïnstalleerd zijn.`,
          ),
        );
        return;
      }
      if (!parsed.ok) {
        reject(new Error(parsed.error || "DOCX-export mislukt"));
        return;
      }
      if (!parsed.path || typeof parsed.path !== "string") {
        reject(new Error("DOCX-bridge: ontbrekend pad in antwoord"));
        return;
      }
      resolve(parsed.path);
    });
    child.stdin.write(JSON.stringify(payload), "utf8");
    child.stdin.end();
  });
}

function docxExportAuthHeaders() {
  /** @type {Record<string, string>} */
  const h = {};
  if (DOCX_EXPORT_TOKEN) h.Authorization = `Bearer ${DOCX_EXPORT_TOKEN}`;
  return h;
}

async function readDocxServiceJsonError(r) {
  const raw = await r.text().catch(() => "");
  const ct = r.headers.get("content-type") || "";
  if (raw && (ct.includes("application/json") || raw.trim().startsWith("{"))) {
    try {
      const j = JSON.parse(raw);
      if (typeof j.detail === "string") return j.detail;
      if (Array.isArray(j.detail)) {
        return j.detail
          .map((d) =>
            typeof d === "object" && d && typeof d.msg === "string"
              ? `${Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : ""}: ${d.msg}`.replace(
                  /^:\s*/,
                  "",
                )
              : JSON.stringify(d),
          )
          .join("; ");
      }
      if (typeof j.error === "string") return j.error;
    } catch {
      /* use raw */
    }
  }
  const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, 800) || `HTTP ${r.status}`;
}

/** Minimale export-API: `{ templates: string[], directory }`; portaal: `TemplateItem[]`; accepteer beide. */
function normalizeDocxTemplatesFromJson(data) {
  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object" && Array.isArray(data.templates)) {
    items = data.templates;
  }
  const templates = items
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object" && typeof x.name === "string"
          ? x.name
          : null,
    )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const directory =
    data && typeof data === "object" && typeof data.directory === "string" ? data.directory : null;
  return { templates, directory };
}

async function fetchDocxTemplatesFromService() {
  const url = `${DOCX_EXPORT_URL}/api/templates`;
  /** @type {Response} */
  let r;
  try {
    r = await fetch(url, {
      headers: docxExportAuthHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const c = /** @type {any} */ (e)?.cause;
    const code = typeof c?.code === "string" ? c.code : "";
    const base = String(/** @type {any} */ (e)?.message || e);
    throw new Error(
      `Word-export service niet bereikbaar (${url}).${code ? ` [${code}]` : ""} ${base}`.trim(),
    );
  }
  if (r.status === 401) {
    throw new Error(
      DOCX_USE_PORTAL
        ? "LLM2DOCX-portaal (8080): 401 — zet DOCX_EXPORT_TOKEN op een API-sleutel met rol editor (of admin), te vinden in het portaal onder API-sleutels."
        : "DOCX-export service: 401 — DOCX_EXPORT_TOKEN / DOCX_EXPORT_SERVICE_TOKEN komt niet overeen.",
    );
  }
  if (!r.ok) {
    throw new Error(await readDocxServiceJsonError(r));
  }
  const data = /** @type {any} */ (await r.json());
  const { templates, directory } = normalizeDocxTemplatesFromJson(data);
  return {
    templates,
    directory: directory || DOCX_EXPORT_URL,
  };
}

async function runDocxExportHttp({ markdown_content, template_name, metadata_dict, download_name }) {
  const exportPath = DOCX_USE_PORTAL ? "/api/documents/generate" : "/api/export";
  const url = `${DOCX_EXPORT_URL}${exportPath}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...docxExportAuthHeaders(),
    },
    body: JSON.stringify({
      markdown_content,
      template_name,
      metadata_dict,
      download_name,
    }),
  });
  if (r.status === 401) {
    throw new Error(
      DOCX_USE_PORTAL
        ? "LLM2DOCX-portaal: 401 — controleer DOCX_EXPORT_TOKEN (API-sleutel editor/admin)."
        : "DOCX-export service: 401 — controleer DOCX_EXPORT_TOKEN.",
    );
  }
  if (!r.ok) {
    throw new Error(await readDocxServiceJsonError(r));
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

function readDirMarkdown(dir = MARKDOWN_DIR, prefix = "") {
  if (!fs.existsSync(MARKDOWN_DIR)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...readDirMarkdown(full, rel));
    if (d.isFile() && d.name.endsWith(".md")) out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function readDirFolders(dir = MARKDOWN_DIR, prefix = "") {
  if (!fs.existsSync(MARKDOWN_DIR)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    out.push(rel, ...readDirFolders(path.join(dir, d.name), rel));
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Volledige paden voor een map, relatief tot MARKDOWN_DIR (geen dot-mappen). */
function folderFullPath(folderRel) {
  const folder = safeFolderPath(folderRel);
  if (folder === null) return null;
  const resolvedDir = path.resolve(MARKDOWN_DIR);
  if (folder === "") return resolvedDir;
  const full = path.resolve(resolvedDir, folder);
  if (!full.startsWith(resolvedDir + path.sep) && full !== resolvedDir) return null;
  return full;
}

function markdownFolderFromPath(mdRel) {
  const i = mdRel.lastIndexOf("/");
  return i >= 0 ? mdRel.slice(0, i) : "";
}

function readMarkdownFileDetails() {
  const files = readDirMarkdown();
  const details = [];
  for (const name of files) {
    const full = markdownFullPath(name);
    if (!full || !fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    details.push({
      name,
      folder: markdownFolderFromPath(name),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
  }
  return details;
}

function readDirMemoryMarkdown(dir = MEMORY_DIR, prefix = "") {
  ensureMemoryRoot();
  if (!fs.existsSync(MEMORY_DIR)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...readDirMemoryMarkdown(full, rel));
    if (d.isFile() && d.name.endsWith(".md")) out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function readMemoryFileDetails() {
  const files = readDirMemoryMarkdown();
  const details = [];
  for (const name of files) {
    const full = memoryFullPath(name);
    if (!full || !fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    details.push({
      name,
      displayName: memoryRootRelativePath(name),
      folder: markdownFolderFromPath(name),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
  }
  return details;
}

function readDirTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function ensureReviewsDir() {
  if (!fs.existsSync(REVIEWS_DIR)) fs.mkdirSync(REVIEWS_DIR, { recursive: true });
}

function markdownVersionsDir() {
  return path.join(REVIEWS_DIR, ".versions");
}

function ensureMarkdownVersionsDir() {
  const d = markdownVersionsDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Rolling backup van het .md-bestand vóór overschrijven (viewer-save of expliciete snapshot). */
function markdownBackupPath(mdName) {
  const base = safeMarkdownPath(mdName);
  if (!base) return null;
  return path.join(ensureMarkdownVersionsDir(), `${base}.bak.md`);
}

function reviewJsonPath(mdName) {
  const base = safeMarkdownPath(mdName);
  if (!base) return null;
  return path.join(REVIEWS_DIR, `${base}.json`);
}

function markdownFullPath(mdName) {
  const safe = safeMarkdownPath(mdName);
  if (!safe) return null;
  const resolvedDir = path.resolve(MARKDOWN_DIR);
  const full = path.resolve(resolvedDir, safe);
  if (!full.startsWith(resolvedDir + path.sep) && full !== resolvedDir) return null;
  return full;
}

/** Volledige .md voor corpus-tool `read_corpus_markdown` (met truncate). */
function readCorpusMarkdownToolPayload(relRaw) {
  const name = safeMarkdownPath(relRaw);
  if (!name) {
    return { ok: false, error: "Ongeldig werkdocumentpad of geen .md-bestand." };
  }
  const full = markdownFullPath(name);
  if (!full || !fs.existsSync(full)) {
    return { ok: false, error: `Werkdocument niet gevonden: ${name}` };
  }
  try {
    const rawLen = fs.statSync(full).size;
    let content = fs.readFileSync(full, "utf8");
    let truncated = false;
    if (content.length > CORPUS_READ_MAX_CHARS) {
      content =
        content.slice(0, CORPUS_READ_MAX_CHARS) +
        `\n\n---\n*[Ingekort voor contextlimiet: ${content.length} tekens gelezen, max ${CORPUS_READ_MAX_CHARS}.]*\n`;
      truncated = true;
    }
    return { ok: true, path: name, content, truncated, approxBytes: rawLen, contextType: "working-document" };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Volledige .md voor long-term memory-tool `read_memory_markdown` (met truncate). */
function readMemoryMarkdownToolPayload(relRaw) {
  ensureMemoryRoot();
  const name = safeMemoryMarkdownPath(relRaw);
  if (!name) {
    return { ok: false, error: "Ongeldig memory-pad of geen .md-bestand." };
  }
  const full = memoryFullPath(name);
  if (!full || !fs.existsSync(full)) {
    return { ok: false, error: `Memory-bestand niet gevonden: ${name}` };
  }
  try {
    const rawLen = fs.statSync(full).size;
    let content = fs.readFileSync(full, "utf8");
    let truncated = false;
    if (content.length > CORPUS_READ_MAX_CHARS) {
      content =
        content.slice(0, CORPUS_READ_MAX_CHARS) +
        `\n\n---\n*[Ingekort voor contextlimiet: ${content.length} tekens gelezen, max ${CORPUS_READ_MAX_CHARS}.]*\n`;
      truncated = true;
    }
    return {
      ok: true,
      path: name,
      displayPath: memoryRootRelativePath(name),
      content,
      truncated,
      approxBytes: rawLen,
      contextType: "long-term-memory",
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Nieuw .md onder MARKDOWN_DIR; overschrijft niet; herbouwt corpus-index bij succes. */
async function createCorpusMarkdownToolPayload(relRaw, contentRaw) {
  ensureMemoryRoot();
  const name = safeMemoryMarkdownPath(relRaw);
  if (!name) {
    return { ok: false, error: "Ongeldig memory-pad of geen .md-bestand." };
  }
  const full = memoryFullPath(name);
  if (!full) return { ok: false, error: "Pad niet toegestaan." };
  if (fs.existsSync(full)) {
    return {
      ok: false,
      error: `Memory-bestand bestaat al (${name}). Kies een ander pad of lees dit bestand en werk het bij.`,
    };
  }
  const content =
    typeof contentRaw === "string" ? ensureMemoryMarkdownMetadata(contentRaw) : ensureMemoryMarkdownMetadata("");
  if (content.length > CORPUS_CREATE_MAX_CHARS) {
    return {
      ok: false,
      error: `Inhoud te lang (${content.length} tekens; max ${CORPUS_CREATE_MAX_CHARS}).`,
    };
  }
  try {
    ensureParentDir(full);
    fs.writeFileSync(full, content, "utf8");
    await runCorpusIndexRebuild("create_corpus_markdown");
    return { ok: true, path: name, displayPath: memoryRootRelativePath(name), charsWritten: content.length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function normalizeStringArray(raw, max = 8) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim())
    .slice(0, max);
}

function normalizeMemoryAction(raw, fallbackKind = "") {
  const o = raw && typeof raw === "object" ? raw : {};
  const kindRaw = typeof o.kind === "string" ? o.kind : fallbackKind;
  const kind =
    kindRaw === "create" || kindRaw === "update" || kindRaw === "delete_suggestion" ? kindRaw : "";
  if (!kind) return null;
  const pathName = safeMemoryMarkdownPath(o.path);
  if (!pathName) return null;
  const riskRaw = typeof o.risk === "string" ? o.risk.toLowerCase() : "";
  const risk = riskRaw === "high" || riskRaw === "medium" || riskRaw === "low" ? riskRaw : "medium";
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
    kind,
    path: pathName,
    reason: typeof o.reason === "string" ? o.reason.trim().slice(0, 1000) : "",
    content: typeof o.content === "string" ? o.content.replace(/\r\n/g, "\n") : "",
    find: typeof o.find === "string" ? o.find : "",
    replace: typeof o.replace === "string" ? o.replace.replace(/\r\n/g, "\n") : "",
    sources: normalizeStringArray(o.sources),
    risk,
    requiresConfirmation: o.requiresConfirmation === true,
    userExplicitlyRequested: o.userExplicitlyRequested === true,
  };
}

function normalizePendingMemoryActions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 12)) {
    const action = normalizeMemoryAction(item, item?.kind);
    if (action) out.push({ ...action, requiresConfirmation: true });
  }
  return out;
}

function dedupeMemoryActions(actions) {
  if (!Array.isArray(actions)) return [];
  const out = [];
  const seen = new Set();
  for (const action of actions) {
    const normalized = normalizeMemoryAction(action, action?.kind);
    if (!normalized) continue;
    const key = [
      normalized.kind,
      normalized.path,
      normalized.find || "",
      normalized.replace || "",
      normalized.content || "",
      normalized.reason || "",
    ].join("\u0001");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function ensureMemoryActionQuestion(reply, pendingActions) {
  const base = String(reply || "").trim();
  return base;
}

function ensureMemoryAppliedNotice(reply, executedActions) {
  const base = String(reply || "").trim();
  return base;
}

function stripMemoryHousekeepingFromReply(reply, actions = []) {
  const base = String(reply || "").trim();
  if (!base || !Array.isArray(actions) || !actions.length) return base;
  const paths = actions
    .map((a) => String(a?.path || "").trim())
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pathRe = paths.length ? new RegExp(paths.join("|"), "i") : null;
  const housekeepingRe =
    /\b(ik heb|heb ik|voor je|voor jou|bestand|document|notitie|memory|geheugen|\.memory|aangemaakt|bijgewerkt|opgeslagen|vastgelegd|doorgevoerd|geplaatst|weggeschreven|plakken|vullen)\b/i;
  return base
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n/)
        .filter((line) => {
          const s = line.trim();
          if (!s) return true;
          const mentionsActionPath = pathRe?.test(s) ?? false;
          const housekeeping = housekeepingRe.test(s);
          if (mentionsActionPath && housekeeping) return false;
          if (/^(ja,?\s*)?dat kan ik zelf\b/i.test(s)) return false;
          if (/\b(ik heb|heb ik).{0,120}\b(aangemaakt|bijgewerkt|opgeslagen|vastgelegd|doorgevoerd|geplaatst|weggeschreven)\b/i.test(s)) {
            return false;
          }
          if (/\bje kunt\b.{0,120}\b(plakken|opslaan|aanmaken|invullen)\b/i.test(s)) return false;
          return true;
        })
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

const ASK_CURIOSITY_RULE =
  "Ask-modus moet nieuwsgierig zijn naar aanvullende informatie die de kennisbank sterker maakt. " +
  "Signaleer actief ontbrekende context, impliciete aannames, open punten, ontbrekende relaties tussen personen/klanten/projecten en mogelijke bronnen. " +
  "Stel waar zinvol 1-3 concrete vervolgvragen onder een korte kop zoals 'Nog nuttig om vast te leggen', vooral wanneer antwoorden later als profiel, dossier, afspraak, actiepunt of besliscontext kunnen worden opgeslagen. " +
  "Vraag niet óf iets moet worden opgeslagen, in welk bestand het moet komen, of of een onderwerp een eigen document nodig heeft; bepaal dat zelf op basis van de corpusstructuur. " +
  "Maak zelfstandig een nieuw onderwerpdocument wanneer het onderwerp duurzaam, herbruikbaar of voldoende zelfstandig is, en werk anders het best passende bestaande document bij. " +
  "Maak de vragen specifiek en laagdrempelig; vraag niet om informatie die al duidelijk in de gelezen context staat en onderbreek het primaire antwoord niet.";

function looksLikeCorpusMemoryWriteRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  const writeIntent =
    /\b(werk|werkt)\s+(dit\s+)?(bij|in)\b/.test(text) ||
    /\b(verwerk|vastleggen|leg vast|toevoegen|voeg toe|aanvullen|vul aan|bijwerken|update|maak aan)\b/.test(text) ||
    /\b(statusregel|actiepunt|timestamp|dossier|geheugen|corpus|notitie)\b/.test(text);
  const targetHint = /\b(dossier|document|bestand|notitie|corpus|geheugen|overzicht\.md|\.md)\b/.test(text);
  return writeIntent && targetHint;
}

function looksLikeDurableMemorySignal(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  const preferenceSignal =
    /\b(ik\s+(wil|vind|verwacht|heb graag|werk graag|hou van|houd van|geef de voorkeur|heb een voorkeur)|mijn\s+(voorkeur|verwachting|werkwijze|stijl|aanpak|manier van werken))\b/.test(
      text,
    ) ||
    /\b(voorkeur|voorkeuren|antwoordstijl|schrijfstijl|tone of voice|toon|kort en bondig|uitgebreid|compact|pragmatisch)\b/.test(
      text,
    );
  const identitySignal =
    /\b(ik ben|ik woon|ik kom uit|ik werk als|mijn vrouw|mijn partner|mijn kinderen|mijn vader|mijn moeder|mijn gezin|mijn hobby|ik volleybal|ik speel|ik train)\b/.test(
      text,
    );
  const durableWorkSignal =
    /\b(standaard werkwijze|vaste aanpak|altijd|nooit|belangrijk voor mij|onthoud|moet je weten|voor later|structureel|terugkerend)\b/.test(
      text,
    );
  const tooEphemeral =
    /\b(vandaag|morgen|straks|zo meteen|nu even|tijdelijk|eenmalig|deze ene keer|alleen nu)\b/.test(text) &&
    !/\b(altijd|voorkeur|onthoud|structureel|voor later)\b/.test(text);
  return (preferenceSignal || identitySignal || durableWorkSignal) && !tooEphemeral;
}

function looksLikeDreamMemoryRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  return /\b(ga|gaan|gaat|moet|mag|laat|laten)?\s*(het\s+systeem\s+)?dromen\b/.test(text);
}

function looksLikeActivityLogRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  return /\b(activity\s*log|activiteitenlog|activiteiten|urenregistratie|timesheet|tijdregistratie|werkzaamheden|wat heb ik gedaan|rapport.*activiteiten|activiteitenrapport)\b/i.test(
    text,
  );
}

function inferDurableMemoryTargetPath(message) {
  const text = String(message || "").toLowerCase();
  if (
    /\b(voorkeur|voorkeuren|antwoordstijl|schrijfstijl|tone of voice|toon|kort en bondig|uitgebreid|compact|pragmatisch)\b/.test(
      text,
    ) ||
    /\b(ik\s+(wil|vind|verwacht|heb graag|werk graag|geef de voorkeur)|mijn\s+(voorkeur|verwachting|stijl|aanpak))\b/.test(
      text,
    )
  ) {
    return "voorkeuren/antwoordstijl_en_werkwijze.md";
  }
  if (/\b(standaard werkwijze|vaste aanpak|altijd|nooit|belangrijk voor mij|structureel|terugkerend)\b/.test(text)) {
    return "werkwijzen/algemene_werkwijze.md";
  }
  return "";
}

const MEMORY_TARGET_STOPWORDS = new Set([
  "hebben",
  "besproken",
  "komende",
  "vooral",
  "aandacht",
  "nodig",
  "contractuele",
  "borging",
  "openstaande",
  "vragen",
  "concreet",
  "overlegmoment",
  "logisch",
  "bestaande",
  "dossier",
  "voeg",
  "korte",
  "statusregel",
  "actiepunt",
  "timestamp",
  "werk",
  "waar",
  "fase",
]);

function normSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pickMemoryTargetPath(message, manifest, fallbackPath = "") {
  const fallback = safeMarkdownPath(fallbackPath) || "";
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  if (!entries.length) return fallback;
  const text = normSearchText(message);
  const explicitPath = String(message || "").match(/([\w./ -]+\.md)\b/i)?.[1]?.trim().replace(/\\/g, "/");
  if (explicitPath) {
    const exact = entries.find((e) => normSearchText(e.path).endsWith(normSearchText(explicitPath)));
    if (exact?.path) return exact.path;
  }
  const terms = Array.from(new Set(text.match(/[a-z0-9_-]{4,}/g) || [])).filter(
    (term) => !MEMORY_TARGET_STOPWORDS.has(term),
  );
  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    const hayPath = normSearchText(entry.path);
    const hayTitle = normSearchText(entry.title);
    const hayPreview = normSearchText(entry.preview);
    let score = 0;
    for (const term of terms) {
      if (hayPath.includes(term)) score += 12;
      if (hayTitle.includes(term)) score += 8;
      if (hayPreview.includes(term)) score += 2;
    }
    if (/overzicht\.md$/i.test(entry.path)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore > 0 && best?.path ? best.path : fallback;
}

function memoryActionLooksSensitive(action) {
  const hay = `${action.path}\n${action.reason}\n${action.content}\n${action.replace}`.toLowerCase();
  return /(^|[/_\-\s])(personen|persoon|collega|contact|klant|customer|account|relatie|linkedin|profiel)([/_\-\s.]|$)/i.test(
    hay,
  );
}

function memoryActionLooksContractual(action) {
  const hay = `${action.path}\n${action.reason}`.toLowerCase();
  return /(contract|sla|juridisch|overeenkomst|addendum|rfp|tender|prijs|facturatie)/i.test(hay);
}

function memoryActionNeedsConfirmation(action) {
  if (action.kind === "delete_suggestion") return true;
  if (action.requiresConfirmation || action.risk === "high") return true;
  if (action.kind === "create" && memoryActionLooksSensitive(action) && !action.userExplicitlyRequested) return true;
  if (action.kind === "create" && action.content.length > 2500) return true;
  if (action.kind === "update" && action.replace.length > 2200) return true;
  if (action.kind === "update" && memoryActionLooksContractual(action)) return true;
  if (action.sources.length && memoryActionLooksSensitive(action)) return true;
  return false;
}

async function executeMemoryAction(action, runId = "—") {
  const normalized = normalizeMemoryAction(action, action?.kind);
  if (!normalized) return { ok: false, error: "Ongeldige geheugenactie." };
  if (normalized.kind === "delete_suggestion") {
    return {
      ok: true,
      executed: false,
      suggestionOnly: true,
      action: normalized,
      message: "Documenten verwijderen is niet toegestaan; dit blijft alleen een suggestie.",
    };
  }
  if (normalized.kind === "create") {
    const payload = await createCorpusMarkdownToolPayload(normalized.path, normalized.content);
    return {
      ok: !!payload.ok,
      executed: !!payload.ok,
      action: payload.ok ? { ...normalized, rollbackCreated: true } : normalized,
      path: normalized.path,
      kind: "create",
      charsWritten: payload.charsWritten ?? 0,
      error: payload.error,
    };
  }
  if (normalized.kind === "update") {
    ensureMemoryRoot();
    const full = memoryFullPath(normalized.path);
    if (!full || !fs.existsSync(full)) {
      return { ok: false, executed: false, action: normalized, error: `Memory-bestand niet gevonden: ${normalized.path}` };
    }
    if (!normalized.find) {
      return { ok: false, executed: false, action: normalized, error: "find ontbreekt voor update." };
    }
    try {
      const before = fs.readFileSync(full, "utf8");
      const next = applyPatchesToMarkdown(
        before,
        [{ find: normalized.find, replace: normalized.replace, replaceAll: false }],
        { patchLogRunId: runId },
      );
      if (next === before) {
        return { ok: true, executed: false, action: normalized, path: normalized.path, kind: "update" };
      }
      const backupState = { backedUp: false };
      backupMarkdownIfNeeded(normalized.path, full, backupState);
      fs.writeFileSync(full, next, "utf8");
      await runCorpusIndexRebuild("memory_update_corpus_markdown");
      return {
        ok: true,
        executed: true,
        action: { ...normalized, rollbackContent: before },
        path: normalized.path,
        kind: "update",
        charsWritten: next.length,
      };
    } catch (e) {
      return { ok: false, executed: false, action: normalized, error: String(e?.message || e) };
    }
  }
  return { ok: false, error: `Onbekende geheugenactie: ${normalized.kind}` };
}

async function revertExecutedMemoryAction(rawAction, runId = "—") {
  const action = normalizeMemoryAction(rawAction, rawAction?.kind);
  if (!action) return { ok: false, error: "Ongeldige geheugenactie." };
  ensureMemoryRoot();
  const full = memoryFullPath(action.path);
  if (!full) return { ok: false, action, error: "Pad niet toegestaan." };

  if (action.kind === "create" && rawAction?.rollbackCreated === true) {
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
      await runCorpusIndexRebuild("memory_revert_create");
      return { ok: true, reverted: true, action, path: action.path, kind: "create" };
    } catch (e) {
      return { ok: false, action, path: action.path, error: String(e?.message || e) };
    }
  }

  if (action.kind === "update" && typeof rawAction?.rollbackContent === "string") {
    try {
      ensureParentDir(full);
      fs.writeFileSync(full, rawAction.rollbackContent.replace(/\r\n/g, "\n"), "utf8");
      await runCorpusIndexRebuild("memory_revert_update");
      return { ok: true, reverted: true, action, path: action.path, kind: "update" };
    } catch (e) {
      return { ok: false, action, path: action.path, error: String(e?.message || e) };
    }
  }

  return { ok: false, action, path: action.path, error: "Rollback-informatie ontbreekt." };
}

async function processMemoryActionTool(rawAction, fallbackKind, runId, options = {}) {
  const action = normalizeMemoryAction(rawAction, fallbackKind);
  if (!action) return { ok: false, error: "Ongeldige geheugenactie." };
  if (options.forcePending) {
    return {
      ok: true,
      pending: true,
      action: { ...action, requiresConfirmation: true },
      message: "Geheugenactie staat klaar als fallback; uitvoerbare acties worden normaal direct toegepast met rollback-optie.",
    };
  }
  if (options.forceExecute) {
    const result = await executeMemoryAction(action, runId);
    return { ...result, pending: false };
  }
  if (memoryActionNeedsConfirmation(action)) {
    return { ok: true, pending: true, action };
  }
  const result = await executeMemoryAction(action, runId);
  return { ...result, pending: false };
}

/** Webzoektool via Tavily. Alleen metadata/snippets gaan naar het LLM; API-key blijft server-side. */
async function webSearchTavilyToolPayload(queryRaw, maxResultsRaw, runId) {
  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";
  if (!query) return { ok: false, error: "Zoekterm ontbreekt." };
  if (!TAVILY_API_KEY) {
    return {
      ok: false,
      error: "Tavily API key ontbreekt. Zet TAVILY_API_KEY in markdown-viewer/.env of .env.local en herstart de server.",
    };
  }

  const maxResults = Math.min(
    WEB_SEARCH_MAX_RESULTS,
    Math.max(1, Number(maxResultsRaw || WEB_SEARCH_MAX_RESULTS) || WEB_SEARCH_MAX_RESULTS),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      agentLog(runId, "web_search_http_error", {
        status: response.status,
        snippet: truncStr(bodyText, 500),
      });
      return { ok: false, error: `Tavily zoeken mislukt (${response.status}).` };
    }
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return { ok: false, error: "Tavily response was geen JSON." };
    }
    const resultsRaw = Array.isArray(data?.results) ? data.results : [];
    const results = resultsRaw.slice(0, maxResults).map((r) => ({
      title: typeof r?.title === "string" ? truncStr(r.title, 240) : "",
      url: typeof r?.url === "string" ? r.url : "",
      content: typeof r?.content === "string" ? truncStr(r.content, WEB_SEARCH_RESULT_MAX_CHARS) : "",
      score: typeof r?.score === "number" ? r.score : undefined,
      publishedDate: typeof r?.published_date === "string" ? r.published_date : undefined,
    }));
    return {
      ok: true,
      query,
      answer: typeof data?.answer === "string" ? truncStr(data.answer, WEB_SEARCH_RESULT_MAX_CHARS) : "",
      results,
    };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return { ok: false, error: aborted ? "Tavily zoeken duurde te lang." : String(e?.message || e) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Normaliseert viewer-hints uit LLM JSON voor de markdown-viewer (open/highlight). */
function normalizeViewerActions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.openMarkdown === "string") {
      const p = safeMarkdownPath(item.openMarkdown.trim());
      if (p) {
        const full = markdownFullPath(p);
        if (full && fs.existsSync(full)) out.push({ type: "open", path: p });
      }
    }
    const hl = item.highlight;
    if (hl && typeof hl === "object") {
      const pathRaw = typeof hl.path === "string" ? hl.path.trim() : "";
      const snippet = typeof hl.snippet === "string" ? hl.snippet.trim() : "";
      const p = safeMarkdownPath(pathRaw);
      if (p && snippet && snippet.length <= 4000) {
        const full = markdownFullPath(p);
        if (full && fs.existsSync(full)) {
          out.push({ type: "highlight", path: p, snippet: snippet.slice(0, 4000) });
        }
      }
    }
  }
  return out;
}

function ensureParentDir(full) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
}

/**
 * Leest optioneel `agent.config` (legacy) en `agent.config.json`.
 * Eerst legacy als basis, daarna overschrijft json niet-lege velden — zo zijn oude `agent.config`-waarden
 * zichtbaar als `agent.config.json` leeg of stub is (bestond alleen json door eerdere saves).
 */
function tryReadAgentConfigLayer(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    return {
      apiKey: typeof data.apiKey === "string" ? data.apiKey : "",
      endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
      model: typeof data.model === "string" ? data.model : "",
    };
  } catch (e) {
    console.error(`[agent-config] Kon ${configPath} niet parsen:`, e?.message || e);
    return null;
  }
}

function mergeAgentConfigLayers(/* layers: oldest first, later wins for non-empty */ ...layers) {
  const out = { apiKey: "", endpoint: "", model: "" };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.apiKey.trim()) out.apiKey = layer.apiKey;
    if (layer.endpoint.trim()) out.endpoint = layer.endpoint;
    if (layer.model.trim()) out.model = layer.model;
  }
  return out;
}

/** Vult alleen lege velden (bestanden hebben voorrang). Handig voor Docker zonder gemounte agent.config*.json. */
function applyAgentConfigEnvFallback(merged) {
  const apiKey = String(process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const endpoint = String(
    process.env.AGENT_ENDPOINT || process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || "",
  )
    .trim()
    .replace(/\/+$/, "");
  const model = String(process.env.AGENT_MODEL || process.env.OPENAI_MODEL || "").trim();
  const out = { ...merged };
  if (!out.apiKey.trim() && apiKey) out.apiKey = apiKey;
  if (!out.endpoint.trim() && endpoint) out.endpoint = endpoint;
  if (!out.model.trim() && model) out.model = model;
  return out;
}

function readAgentConfig() {
  const legacy = tryReadAgentConfigLayer(AGENT_CONFIG_LEGACY_PATH);
  const jsonFile = tryReadAgentConfigLayer(AGENT_CONFIG_PATH);
  const merged = mergeAgentConfigLayers(legacy, jsonFile);
  return applyAgentConfigEnvFallback(merged);
}

function publicAgentConfig(config = readAgentConfig()) {
  return {
    endpoint: config.endpoint,
    model: config.model,
    hasApiKey: !!config.apiKey.trim(),
  };
}

function writeAgentConfig(input) {
  const current = readAgentConfig();
  const apiKey =
    typeof input?.apiKey === "string" && input.apiKey.trim()
      ? input.apiKey.trim()
      : current.apiKey;
  const endpoint = typeof input?.endpoint === "string" ? input.endpoint.trim().replace(/\/+$/, "") : "";
  const model = typeof input?.model === "string" ? input.model.trim() : "";
  if (!endpoint) throw new Error("endpoint is verplicht");
  if (!model) throw new Error("model is verplicht");
  if (!apiKey) {
    throw new Error(
      "apiKey is verplicht: vul een API key in, of deze server heeft geen opgeslagen key om te hergebruiken " +
        "(leeg veld behoudt alleen de key in het bestaande agent.config.json op **deze** API). " +
        "Tip: meerdere `node server`-processen of mappen → elk eigen config; zet VITE_API_ORIGIN in .env naar één API-poort " +
        "zodat de browser niet uit verschillende instanties leest/schrijft.",
    );
  }
  const config = { apiKey, endpoint, model };
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  return config;
}

function markdownChatCompletionsUrl(endpoint) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

function markdownModelsUrl(endpoint) {
  const clean = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.endsWith("/chat/completions")) return `${clean.slice(0, -"/chat/completions".length)}/models`;
  return `${clean}/models`;
}

async function fetchAvailableAgentModels(input = {}) {
  const current = readAgentConfig();
  const endpoint =
    typeof input.endpoint === "string" && input.endpoint.trim()
      ? input.endpoint.trim().replace(/\/+$/, "")
      : current.endpoint;
  const apiKey =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : current.apiKey;
  if (!endpoint) throw new Error("endpoint is verplicht om modellen op te halen");
  if (!apiKey) throw new Error("API key ontbreekt om modellen op te halen");
  const url = markdownModelsUrl(endpoint);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Modellen ophalen mislukt (${response.status}): ${text.slice(0, 500)}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Model-response is geen geldige JSON.");
  }
  const rawModels = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = rawModels
    .map((m) => (typeof m === "string" ? m : typeof m?.id === "string" ? m.id : ""))
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return Array.from(new Set(models));
}

async function cleanupTranscriptWithAgent(config, transcriptRaw) {
  const transcript = String(transcriptRaw || "").trim();
  if (!transcript) return "";
  const url = markdownChatCompletionsUrl(config.endpoint);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Je corrigeert uitsluitend ruwe Nederlandse transcriptie. " +
            "Maak dicteertekst puntig en goed leesbaar: voeg interpunctie, hoofdletters, zinsgrenzen en waar nuttig korte alinea's toe. " +
            "Corrigeer duidelijke spraakherkenningsfouten alleen wanneer de bedoelde formulering evident is. " +
            "Behoud intentie, volgorde, taal en inhoud van de spreker. " +
            "Vat niet samen, voeg geen nieuwe informatie toe, verwijder geen inhoudelijke details en geef geen antwoord op de tekst. " +
            "Verwijder alleen herkenbare transcriptieartefacten zoals dubbele spaties, losse stopwoorden of duidelijke herhalingen door spraakherkenning. " +
            "Geef uitsluitend JSON terug met {\"text\":\"...\"}.",
        },
        {
          role: "user",
          content: JSON.stringify({ transcript: transcript.slice(0, 24000) }),
        },
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Transcript-cleanup LLM-call mislukt (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  try {
    const parsed = parseAgentJsonResponse(content);
    if (typeof parsed?.text === "string") return parsed.text.trim();
  } catch {
    /* Sommige modellen negeren response_format; val terug op platte tekst. */
  }
  return content.replace(/^```(?:text|markdown)?\s*/i, "").replace(/```$/i, "").trim();
}

function normalizeAgentChatHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) continue;
    const content = typeof m.content === "string" ? m.content : "";
    if (!content.trim()) continue;
    const mode = m.mode === "ask" || m.mode === "agent" ? m.mode : undefined;
    out.push({ role, content, ...(mode ? { mode } : {}) });
  }
  return out;
}

function trimAgentChatSequence(messages) {
  if (messages.length <= AGENT_CHAT_HISTORY_MAX_MESSAGES) return messages;
  let rest = messages;
  while (rest.length > AGENT_CHAT_HISTORY_MAX_MESSAGES) {
    rest = rest.slice(2);
  }
  return rest;
}

function trimAgentChatHistory(messages) {
  return trimAgentChatSequence(messages);
}

function safeAgentChatId(raw) {
  const id = typeof raw === "string" ? raw.trim() : "";
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : null;
}

function cleanAgentChatTitle(raw) {
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return title ? title.slice(0, 80) : "Nieuwe chat";
}

function normalizeChatLifecycleStatus(raw) {
  return raw === "active" || raw === "stale" || raw === "summarized" || raw === "promoted" || raw === "archived"
    ? raw
    : "active";
}

function computeChatLifecycleStatus(session, activeChatId) {
  const explicit = normalizeChatLifecycleStatus(session.lifecycleStatus);
  if (explicit === "promoted" || explicit === "archived" || explicit === "summarized") return explicit;
  if (session.id === activeChatId) return "active";
  const updatedMs = Date.parse(session.updatedAt || "");
  const staleMs = AGENT_CHAT_STALE_HOURS * 60 * 60 * 1000;
  if (Number.isFinite(updatedMs) && Date.now() - updatedMs >= staleMs) return "stale";
  return explicit === "active" ? "active" : explicit;
}

function defaultAgentChatSession(title = "Nieuwe chat", messages = []) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: cleanAgentChatTitle(title),
    createdAt: now,
    updatedAt: now,
    lifecycleStatus: "active",
    promotedAt: "",
    structuredMemoryAt: "",
    structuredMemoryStatus: "",
    summary: "",
    messages: trimAgentChatHistory(normalizeAgentChatHistory(messages)),
  };
}

function normalizeAgentChatSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = safeAgentChatId(raw.id) || randomUUID();
  const createdAt = typeof raw.createdAt === "string" && raw.createdAt.trim() ? raw.createdAt : new Date().toISOString();
  const updatedAt = typeof raw.updatedAt === "string" && raw.updatedAt.trim() ? raw.updatedAt : createdAt;
  return {
    id,
    title: cleanAgentChatTitle(raw.title),
    createdAt,
    updatedAt,
    lifecycleStatus: normalizeChatLifecycleStatus(raw.lifecycleStatus),
    promotedAt: typeof raw.promotedAt === "string" ? raw.promotedAt : "",
    structuredMemoryAt: typeof raw.structuredMemoryAt === "string" ? raw.structuredMemoryAt : "",
    structuredMemoryStatus: typeof raw.structuredMemoryStatus === "string" ? raw.structuredMemoryStatus : "",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    messages: trimAgentChatHistory(normalizeAgentChatHistory(raw.messages)),
  };
}

function normalizeAgentChatsPayload(raw) {
  const sessionsRaw = Array.isArray(raw?.sessions) ? raw.sessions : Array.isArray(raw?.chats) ? raw.chats : [];
  const seen = new Set();
  const sessions = [];
  for (const item of sessionsRaw) {
    const session = normalizeAgentChatSession(item);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    sessions.push(session);
  }
  const trimmedSessions = sessions
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, AGENT_CHAT_SESSIONS_MAX);
  if (trimmedSessions.length === 0) trimmedSessions.push(defaultAgentChatSession());
  const activeRaw = safeAgentChatId(raw?.activeChatId);
  const activeChatId = activeRaw && trimmedSessions.some((s) => s.id === activeRaw) ? activeRaw : trimmedSessions[0].id;
  for (const session of trimmedSessions) {
    session.lifecycleStatus = computeChatLifecycleStatus(session, activeChatId);
  }
  return { version: 1, activeChatId, sessions: trimmedSessions };
}

function readAgentChatsPayload() {
  try {
    if (!fs.existsSync(AGENT_CHATS_PATH)) {
      const payload = normalizeAgentChatsPayload({});
      writeAgentChatsPayload(payload);
      return payload;
    }
    const raw = JSON.parse(fs.readFileSync(AGENT_CHATS_PATH, "utf8"));
    return normalizeAgentChatsPayload(raw);
  } catch {
    return normalizeAgentChatsPayload({});
  }
}

function writeAgentChatsPayload(payloadRaw) {
  const payload = normalizeAgentChatsPayload(payloadRaw);
  ensureParentDir(AGENT_CHATS_PATH);
  fs.writeFileSync(AGENT_CHATS_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function summarizeAgentChatTitle(message) {
  const s = String(message || "")
    .replace(/\s+/g, " ")
    .trim();
  return cleanAgentChatTitle(s || "Nieuwe chat");
}

function slugifyMemoryName(raw, fallback = "chat") {
  const s = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return s || fallback;
}

function chatPromotionSummary(session) {
  const messages = trimAgentChatHistory(normalizeAgentChatHistory(session.messages));
  const maxMessageChars = 6000;
  const maxTotalChars = 120000;
  const lines = [];
  let totalChars = 0;
  for (const m of messages) {
    const role = m.role === "assistant" ? "Agent" : "Joost";
    const content = String(m.content || "")
      .trim()
      .slice(0, maxMessageChars);
    if (!content) continue;
    const block =
      `### ${role}${m.mode ? ` (${m.mode})` : ""}\n\n` +
      `${content}${String(m.content || "").length > maxMessageChars ? "\n\n*[bericht ingekort voor verwerkingslimiet]*" : ""}\n`;
    if (totalChars + block.length > maxTotalChars) {
      lines.push("\n*[transcript ingekort voor verwerkingslimiet]*\n");
      break;
    }
    lines.push(block);
    totalChars += block.length;
  }
  const summary =
    lines.length > 0
      ? lines.join("\n---\n\n")
      : "- Geen inhoudelijke berichten gevonden voor promotie.";
  return `# Chatpromotie: ${session.title || "Nieuwe chat"}\n\n` +
    `<!-- promoted-from-chat:${session.id} at:${new Date().toISOString()} -->\n\n` +
    `## Bron\n\n` +
    `- Chat: ${session.title || "Nieuwe chat"}\n` +
    `- Chat-id: ${session.id}\n` +
    `- Aangemaakt: ${session.createdAt || "onbekend"}\n` +
    `- Laatst bijgewerkt: ${session.updatedAt || "onbekend"}\n\n` +
    `## Transcript voor long-term memory consolidatie\n\n` +
    `Onderstaande transcriptie is bronmateriaal. Converteer alleen duurzame, door Joost aangeleverde of bevestigde feiten naar gestructureerde memory. Behandel agent-antwoorden als interpretatie/hulpsamenvatting, niet als primaire bron wanneer ze botsen met Joosts tekst.\n\n` +
    summary +
    `\n\n## Promotiestatus\n\n` +
    `Deze notitie is automatisch uit short-term chatcontext gepromoveerd en dient als bron/audit trail voor gestructureerde memory-consolidatie.\n`;
}

function compactMemoryManifestList(manifest, max = 120) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  return entries
    .filter((e) => !String(e.path || "").startsWith("chat-promoties/"))
    .slice(0, max)
    .map((e) => {
      const preview = String(e.preview || "").replace(/\s+/g, " ").slice(0, 180);
      return `- \`${e.path}\`: ${e.title || e.path}${preview ? ` — ${preview}` : ""}`;
    })
    .join("\n");
}

async function consolidateChatPromotionToStructuredMemory(config, session, promotionPath, promotionContent, runId = "—") {
  if (!config?.apiKey?.trim() || !config?.endpoint?.trim() || !config?.model?.trim()) {
    return { ok: false, skipped: true, error: "Agentconfig ontbreekt; chatpromotie blijft als bronnotitie staan." };
  }

  let memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  if (!memoryManifest) {
    const rebuilt = await runCorpusIndexRebuild("chat_promotion_consolidation_missing_index");
    memoryManifest = rebuilt?.memory || readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  }

  const memoryList = compactMemoryManifestList(memoryManifest);
  const prompt =
    `## Taak: consolideer chatpromotie naar gestructureerde long-term memory\n\n` +
    `Verwerk onderstaande chatpromotie direct naar specifieke memory-documenten onder Files/.memory/.\n\n` +
    `Belangrijk:\n` +
    `- Laat duurzame feiten niet alleen in \`chat-promoties/\` staan.\n` +
    `- Gebruik Joosts eigen berichten als primaire bron. Agent-antwoorden in de transcriptie mogen helpen bij structurering, maar mogen geen zelfstandig nieuw feit worden als Joost dat niet heeft aangeleverd of bevestigd.\n` +
    `- Negeer verouderde proces-/UI-uitspraken uit eerdere agent-antwoorden, zoals "Niet akkoord", "rollback", "in deze omgeving mag ik niet schrijven", of oude beschrijvingen van de memory-implementatie.\n` +
    `- Lees relevante bestaande memory-documenten met read_memory_markdown voordat je ze bijwerkt.\n` +
    `- Voer meerdere create_corpus_markdown- en/of update_corpus_markdown-acties uit als de informatie over meerdere personen, projecten, klanten, voorkeuren of werkwijzen gaat.\n` +
    `- Maak nieuwe memory-documenten wanneer er geen passend bestaand document is.\n` +
    `- Gebruik \`${promotionPath}\` als bronverwijzing in sources of in de tekst waar nuttig.\n` +
    `- Werk de promotienotitie zelf alleen bij met een korte verwerkingsmarkering als de inhoud naar gestructureerde memory is geconsolideerd; verwijder niets.\n` +
    `- Geef geen aparte gebruikersmelding over memory-mutaties.\n\n` +
    `## Bestaande memory-documenten compact\n\n${memoryList || "(geen bestaande memory-documenten)"}\n\n` +
    `---\n\n` +
    `## Chatmetadata\n\n` +
    `- Chat: ${session.title || "Nieuwe chat"}\n` +
    `- Chat-id: ${session.id}\n` +
    `- Promotiepad: ${promotionPath}\n\n` +
    `---\n\n` +
    `## Volledige chatpromotie\n\n${promotionContent}`;

  try {
    const result = await callCorpusAskAgentWithTools(
      config,
      prompt,
      [],
      { runId, purpose: "chat_promotion_consolidation", promotionPath },
      null,
      null,
      { replyMarkdown: false, enableCorpusTools: true, enableWebSearch: false, enableMemoryWriteTools: true },
    );
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function listChatPromotionMemoryPaths() {
  ensureMemoryRoot();
  const dir = path.join(MEMORY_DIR, "chat-promoties");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))
    .map((d) => `chat-promoties/${d.name}`)
    .sort((a, b) => a.localeCompare(b));
}

async function consolidateExistingChatPromotion(relPath, runId = "—") {
  const name = safeMemoryMarkdownPath(relPath);
  if (!name || !name.startsWith("chat-promoties/")) {
    return { ok: false, path: relPath, error: "Geen geldig chat-promotiepad." };
  }
  const full = memoryFullPath(name);
  if (!full || !fs.existsSync(full)) {
    return { ok: false, path: name, error: "Chatpromotie niet gevonden." };
  }
  const content = fs.readFileSync(full, "utf8");
  const chatId = content.match(/promoted-from-chat:([a-zA-Z0-9_-]+)/)?.[1] || `promotion-${slugifyMemoryName(name)}`;
  const title = content.match(/^#\s+Chatpromotie:\s+(.+)$/m)?.[1]?.trim() || path.basename(name, ".md");
  const session = {
    id: chatId,
    title,
    createdAt: "",
    updatedAt: "",
    messages: [],
  };
  const config = readAgentConfig();
  const consolidation = await consolidateChatPromotionToStructuredMemory(config, session, name, content, runId);
  return { path: name, ...consolidation };
}

async function promoteAgentChatSession(id, runId = "—") {
  const payload = readAgentChatsPayload();
  const idx = payload.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: "Chat not found" };
  const session = payload.sessions[idx];
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugifyMemoryName(session.title, session.id.slice(0, 8));
  let relPath = `chat-promoties/${date}-${slug}.md`;
  if (memoryFullPath(relPath) && fs.existsSync(memoryFullPath(relPath))) {
    relPath = `chat-promoties/${date}-${slug}-${session.id.slice(0, 8)}.md`;
  }
  const content = chatPromotionSummary(session);
  const applied = await executeMemoryAction(
    {
      kind: "create",
      path: relPath,
      content,
      reason: `Promotie van chat "${session.title}" naar long-term memory.`,
      sources: [`agent-chat:${session.id}`],
      risk: "medium",
      userExplicitlyRequested: true,
    },
    runId,
  );
  if (!applied.ok) return { ok: false, error: applied.error || "Promotie mislukt", action: applied.action };
  const config = readAgentConfig();
  const consolidation = await consolidateChatPromotionToStructuredMemory(config, session, relPath, content, runId);
  payload.sessions[idx] = {
    ...session,
    lifecycleStatus: "promoted",
    promotedAt: new Date().toISOString(),
    structuredMemoryAt: consolidation.ok ? new Date().toISOString() : "",
    structuredMemoryStatus: consolidation.ok ? "processed" : consolidation.skipped ? "skipped" : "failed",
    summary: content.slice(0, 4000),
    updatedAt: new Date().toISOString(),
  };
  const saved = writeAgentChatsPayload(payload);
  return {
    ok: true,
    session: payload.sessions[idx],
    payload: saved,
    executedMemoryActions: [
      ...(applied.action ? [applied.action] : []),
      ...(Array.isArray(consolidation.executedMemoryActions) ? consolidation.executedMemoryActions : []),
    ],
    pendingMemoryActions: Array.isArray(consolidation.pendingMemoryActions) ? consolidation.pendingMemoryActions : [],
    corpusCreatedPaths: [
      ...(applied.path ? [applied.path] : []),
      ...(Array.isArray(consolidation.corpusCreatedPaths) ? consolidation.corpusCreatedPaths : []),
    ],
    consolidation,
  };
}

function upsertAgentChatSession(id, patch) {
  const payload = readAgentChatsPayload();
  const idx = payload.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const prev = payload.sessions[idx];
  const messages = Array.isArray(patch?.messages) ? trimAgentChatHistory(normalizeAgentChatHistory(patch.messages)) : prev.messages;
  const title =
    typeof patch?.title === "string"
      ? cleanAgentChatTitle(patch.title)
      : prev.title === "Nieuwe chat" && messages.length > 0
        ? summarizeAgentChatTitle(messages.find((m) => m.role === "user")?.content)
        : prev.title;
  payload.sessions[idx] = {
    ...prev,
    title,
    messages,
    lifecycleStatus:
      prev.lifecycleStatus === "promoted" || prev.lifecycleStatus === "archived" || prev.lifecycleStatus === "summarized"
        ? prev.lifecycleStatus
        : patch?.active === true
          ? "active"
          : normalizeChatLifecycleStatus(patch?.lifecycleStatus || prev.lifecycleStatus),
    updatedAt: new Date().toISOString(),
  };
  if (patch?.active === true) payload.activeChatId = id;
  return writeAgentChatsPayload(payload);
}

function readReviewPayload(name) {
  const full = reviewJsonPath(name);
  if (!full || !fs.existsSync(full)) {
    return { comments: [], agentChatHistory: [], agentChatUiHistory: [] };
  }
  try {
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw);
    return {
      comments: Array.isArray(data.comments) ? data.comments : [],
      agentChatHistory: trimAgentChatHistory(normalizeAgentChatHistory(data.agentChatHistory)),
      agentChatUiHistory: trimAgentChatHistory(normalizeAgentChatHistory(data.agentChatUiHistory)),
    };
  } catch {
    return { comments: [], agentChatHistory: [], agentChatUiHistory: [] };
  }
}

function readReviewComments(name) {
  return readReviewPayload(name).comments;
}

function writeReviewComments(name, comments, agentChatHistory = undefined, agentChatUiHistory = undefined) {
  const full = reviewJsonPath(name);
  if (!full) throw new Error("Invalid review path");
  ensureReviewsDir();
  ensureParentDir(full);
  let history = agentChatHistory;
  let uiHistory = agentChatUiHistory;
  if (!Array.isArray(history) || !Array.isArray(uiHistory)) {
    try {
      if (fs.existsSync(full)) {
        const prev = JSON.parse(fs.readFileSync(full, "utf8"));
        if (!Array.isArray(history)) history = normalizeAgentChatHistory(prev.agentChatHistory);
        if (!Array.isArray(uiHistory)) uiHistory = normalizeAgentChatHistory(prev.agentChatUiHistory);
      }
    } catch {
      /* keep */
    }
  }
  if (!Array.isArray(history)) history = [];
  if (!Array.isArray(uiHistory)) uiHistory = [];
  history = trimAgentChatHistory(normalizeAgentChatHistory(history));
  uiHistory = trimAgentChatHistory(normalizeAgentChatHistory(uiHistory));
  fs.writeFileSync(
    full,
    JSON.stringify(
      { version: 1, comments, agentChatHistory: history, agentChatUiHistory: uiHistory },
      null,
      2,
    ),
    "utf8",
  );
  return path.relative(MARKDOWN_DIR, full).split(path.sep).join("/");
}

function appendPersistedAgentChatTurn(
  name,
  userContent,
  assistantContent,
  historyUserContent = userContent,
  historyAssistantContent = assistantContent,
  mode = "agent",
) {
  if (!name) return null;
  const { comments, agentChatHistory, agentChatUiHistory } = readReviewPayload(name);
  const safeMode = mode === "ask" ? "ask" : "agent";
  const history = [...agentChatHistory];
  const uiHistory = [...agentChatUiHistory];
  uiHistory.push({ role: "user", content: userContent, mode: safeMode });
  uiHistory.push({ role: "assistant", content: assistantContent, mode: safeMode });
  history.push({ role: "user", content: historyUserContent, mode: safeMode });
  history.push({ role: "assistant", content: historyAssistantContent, mode: safeMode });
  return writeReviewComments(name, comments, trimAgentChatHistory(history), trimAgentChatHistory(uiHistory));
}

function addAgentReply(comment, body) {
  const now = new Date().toISOString();
  const safeBody = String(body || "")
    .replace(/@agent/gi, "de opdracht")
    .trim();
  const reply = {
    id: crypto.randomUUID(),
    author: "LLM Agent",
    body: safeBody || "Geen wijziging uitgevoerd.",
    createdAt: now,
    updatedAt: now,
  };
  if (!Array.isArray(comment.replies)) comment.replies = [];
  comment.replies.push(reply);
  comment.updatedAt = now;
}

/** Na chat-agent patch: review-thread zodat de viewer diff (rood/groen) + akkoord/afkeur kan tonen. */
function appendAgentChatReviewApprovalThread(name, userMessage, replyText, selectionParts, historyUserContent, historyAssistantContent) {
  const { comments } = readReviewPayload(name);
  const now = new Date().toISOString();
  const quote = selectionParts?.quote || "";
  const prefix = selectionParts?.prefix || "";
  const suffix = selectionParts?.suffix || "";
  const newComment = {
    id: crypto.randomUUID(),
    author: "Chat",
    body: userMessage,
    quote,
    prefix,
    suffix,
    createdAt: now,
    updatedAt: now,
    replies: [],
  };
  addAgentReply(newComment, replyText);
  comments.push(newComment);
  writeReviewComments(name, comments);
}

/** Korte, leesbare userregel voor het chatvenster (los van technische agentChatHistory voor de LLM). */
function shortUserLineForUi(comment) {
  const instr = normalizedCommentInstruction(comment);
  const q = typeof comment?.quote === "string" ? comment.quote.trim() : "";
  const qShort = q.length > 420 ? `${q.slice(0, 420)}…` : q;
  if (instr && qShort) return `${instr}\n\n> ${qShort}`;
  if (instr) return instr;
  if (qShort) return `Geselecteerd fragment:\n\n> ${qShort}`;
  return "(Reviewopdracht)";
}

/** Instructie uit het eerste bericht; optioneel legacy `@agent`-prefix verwijderen. */
function normalizedCommentInstruction(comment) {
  const raw = typeof comment?.body === "string" ? comment.body.trim() : "";
  return raw.replace(/^@agent\b\s*/i, "").trim();
}

/** Nog te verwerken door de agent: geen agent-antwoord nog, wel tekst en/of citaat. */
function isProcessableAgentComment(comment) {
  const instr = normalizedCommentInstruction(comment);
  const quote = typeof comment?.quote === "string" ? comment.quote.trim() : "";
  return instr.length > 0 || quote.length > 0;
}

/** Payload voor de LLM: geen lege body als er alleen een citaat is. */
function commentForAgentCall(comment) {
  const instr = normalizedCommentInstruction(comment);
  const quote = typeof comment?.quote === "string" ? comment.quote.trim() : "";
  const body =
    instr ||
    (quote
      ? "Gebruik het gemarkeerde citaat als anker; pas het document dienovereenkomstig aan."
      : "");
  return { ...comment, body };
}

function hasAgentReply(comment) {
  return Array.isArray(comment?.replies) && comment.replies.some((r) => /\bagent\b/i.test(String(r?.author || "")));
}

function pendingAgentReviewComments(comments) {
  return comments.filter(hasAgentReply);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const i = haystack.indexOf(needle, pos);
    if (i < 0) return count;
    count += 1;
    pos = i + needle.length;
  }
}

/** CRLF/LF en oude \\r naar \\n; voorkomt dat LLM `\\n` in find gebruikt terwijl het bestand `\\r\\n` heeft. */
function unixNewlines(s) {
  return String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Eén canonieke vorm voor patch-matching (o.a. precomposed Unicode). */
function normalizeForPatchMatch(s) {
  return unixNewlines(s).normalize("NFC");
}

/** Zet patchresultaat terug naar oorspronkelijke Windows-regeleinden als ze in het bronbestand voorkwamen. */
function restoreLineEndingsAfterPatch(originalMarkdown, patchedUnix) {
  const out = String(patchedUnix);
  if (String(originalMarkdown).includes("\r\n")) {
    return out.replace(/\n/g, "\r\n");
  }
  return out;
}

function normalizePatchChange(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  if (typeof out.find === "string") out.find = normalizeForPatchMatch(out.find);
  if (typeof out.replace === "string") out.replace = normalizeForPatchMatch(out.replace);
  return out;
}

/**
 * Past find/replace toe na normalisatie van regeleinden/Unicode zodat modellen vaker matchen op echte inhoud.
 * @param {string} markdown
 * @param {unknown[]} changesRaw
 * @param {{ chatCoerceRunId?: string | null, patchLogRunId?: string | null }} [options]
 */
function applyPatchesToMarkdown(markdown, changesRaw, options = {}) {
  const { chatCoerceRunId = null, patchLogRunId = null } = options;
  const logId = patchLogRunId || chatCoerceRunId;
  if (!Array.isArray(changesRaw)) throw new Error("changes moet een array zijn");
  const doc = normalizeForPatchMatch(markdown);
  let changes = changesRaw.map(normalizePatchChange);
  if (chatCoerceRunId != null) {
    changes = coerceChatChangesReplaceAll(doc, changes, chatCoerceRunId);
  }
  const attemptApply = (ch) => applyExactPatches(doc, ch);
  let nextDoc;
  try {
    nextDoc = attemptApply(changes);
  } catch (e) {
    const msg = String(e?.message || e);
    if (!msg.includes("0 keer")) throw e;
    let anyTrimmed = false;
    const trimmed = changes.map((c) => {
      if (!c || typeof c !== "object" || typeof c.find !== "string") return c;
      const t = c.find.trim();
      if (!t || t === c.find) return c;
      anyTrimmed = true;
      return { ...c, find: t };
    });
    if (!anyTrimmed) throw e;
    if (logId) {
      agentLog(logId, "patch_retry_trim_find", { reason: "zero_occurrences" });
    }
    nextDoc = attemptApply(trimmed);
  }
  return restoreLineEndingsAfterPatch(markdown, nextDoc);
}

function applyExactPatches(markdown, changes) {
  if (!Array.isArray(changes)) throw new Error("changes moet een array zijn");
  let next = markdown;
  for (const change of changes) {
    const find = typeof change?.find === "string" ? change.find : "";
    const replace = typeof change?.replace === "string" ? change.replace : null;
    const replaceAll = change?.replaceAll === true;
    if (!find || replace === null) {
      throw new Error("Elke change heeft find en replace als string nodig");
    }
    const occurrences = countOccurrences(next, find);
    if (replaceAll) {
      if (occurrences < 1) {
        throw new Error("Patch niet exact toepasbaar: find komt 0 keer voor");
      }
      continue;
    }
    if (occurrences !== 1) {
      throw new Error(
        `Patch niet exact toepasbaar: find komt ${occurrences} keer voor. Gebruik replaceAll=true voor expliciete documentbrede vervangingen.`,
      );
    }
  }
  for (const change of changes) {
    next = change.replaceAll === true ? next.split(change.find).join(change.replace) : next.replace(change.find, change.replace);
  }
  return next;
}

/**
 * Alleen voor chat-agent: als het model dezelfde `find` meerdere keren laat staan zonder replaceAll,
 * zet replaceAll aan — de bedoeling is vrijwel altijd dezelfde vervanging op alle voorkomens.
 * Review/comment-agent gebruikt dit niet (strenger houden).
 */
function coerceChatChangesReplaceAll(markdown, changes, runId) {
  if (!Array.isArray(changes)) return changes;
  let coerced = 0;
  const out = changes.map((c, idx) => {
    if (!c || typeof c !== "object") return c;
    const find = typeof c.find === "string" ? c.find : "";
    if (!find || c.replaceAll === true) return c;
    const n = countOccurrences(markdown, find);
    if (n > 1) {
      coerced += 1;
      agentLog(runId, "chat_coerce_replace_all", {
        changeIndex: idx,
        occurrences: n,
        findChars: find.length,
      });
      return { ...c, replaceAll: true };
    }
    return c;
  });
  if (coerced > 0) {
    agentLog(runId, "chat_coerce_replace_all_summary", { coercedFromModel: coerced });
  }
  return out;
}

function parseAgentJsonResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Lege LLM-response");

  const tryParse = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  let parsed = tryParse(() => JSON.parse(trimmed));
  if (parsed != null) return parsed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    parsed = tryParse(() => JSON.parse(fenced[1].trim()));
    if (parsed != null) return parsed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    parsed = tryParse(() => JSON.parse(trimmed.slice(first, last + 1)));
    if (parsed != null) return parsed;
  }

  throw new Error("LLM-response is geen geldige JSON");
}

/**
 * Chat Completions `message.content` is meestal een string; sommige gateways geven multimodal arrays of null.
 */
function normalizeAssistantContentForParsing(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      if (part == null) continue;
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (typeof part === "object") {
        if (typeof part.text === "string") parts.push(part.text);
        else if (part.type === "text" && typeof part.text === "string") parts.push(part.text);
      }
    }
    if (parts.length) return parts.join("\n");
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  if (typeof content === "object" && typeof content.text === "string") return content.text;
  try {
    return String(content);
  } catch {
    return "";
  }
}

function toolCallsOnlyReply() {
  return (
    "Het model heeft alleen een tool- of functie-aanroep teruggestuurd, geen leesbare tekst. " +
    "Deze viewer voert die tools niet uit. Kies een model zonder tool-calling, of zet tools uit aan de kant van de API-provider."
  );
}

let agentInstructionsUpdateChain = Promise.resolve();

function queueAgentInstructionsUpdate(config, { runId = "—", mode, userContent, assistantContent } = {}) {
  if (!AGENT_INSTRUCTIONS_AUTO_UPDATE) return;
  const user = String(userContent || "").trim();
  const assistant = String(assistantContent || "").trim();
  if (!user || !assistant) return;
  agentInstructionsUpdateChain = agentInstructionsUpdateChain
    .catch(() => undefined)
    .then(() => updateAgentInstructionsFromTurn(config, { runId, mode, user, assistant }))
    .catch((e) => {
      agentLog(runId, "agent_instructions_update_error", { error: String(e?.message || e) });
    });
}

async function updateAgentInstructionsFromTurn(config, { runId, mode, user, assistant }) {
  const current = readAgentInstructionsFile();
  const url = markdownChatCompletionsUrl(config.endpoint);
  const system =
    "Je onderhoudt een Markdown-instructiebestand voor een lokale agentapp. " +
    "Het bestand bevat alleen operationele gedragsinstructies voor de agent: contextscheiding, memory-beleid, antwoordstijl en documentwerkwijze. " +
    "Schrijf nooit persoonlijke feiten, profielinformatie, familiecontext, hobby's, klantcontext, projectinformatie, SLA-/dossierkennis, voorkeuren of inhoudelijke second-brain-data naar dit bestand; die horen in Files/.memory/ of werkdocumenten. " +
    "Werk het bestand alleen bij als de laatste beurt expliciet een duurzame regel over het gedrag van de agent of de applicatielogica bevat. " +
    "Als de beurt vooral inhoudelijke memory-informatie of een gebruikersvoorkeur bevat, retourneer het bestaande bestand ongewijzigd. " +
    "Houd het compact, verwijder vervuiling en tegenstrijdige verouderde regels, en schrijf in het Nederlands. " +
    "Geef uitsluitend JSON terug met {\"markdown\":\"...\"}." +
    currentTimePromptBlock();
  const userPayload = {
    currentInstructionsMarkdown: current,
    latestTurn: {
      mode,
      userMessage: user.slice(0, 8000),
      assistantReply: assistant.slice(0, 8000),
    },
  };

  agentLog(runId, "agent_instructions_update_start", { mode, currentChars: current.length });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Instructions update LLM-call mislukt (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  const parsed = parseAgentJsonResponse(content);
  const next = typeof parsed?.markdown === "string" ? parsed.markdown.trim() : "";
  if (!next) return;
  if (next.trim() === current.trim()) {
    agentLog(runId, "agent_instructions_update_unchanged", { mode });
    return;
  }
  writeAgentInstructionsFile(next);
  agentLog(runId, "agent_instructions_update_done", { mode, nextChars: next.length });
}

/**
 * Bonzai-achtige agenten negeren soms `response_format: json_object`. Dan vullen we `reply` met platte tekst
 * en `changes: []` (zie callReviewAgent / callAskAgent).
 */
function noteLlmProseFallback(llmDebugOut) {
  if (!llmDebugOut || typeof llmDebugOut !== "object") return;
  llmDebugOut.proseFallbackUsed = true;
}

function safeJsonClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/** Nodig voor debug: sommige endpoints geven `content` als string, array (multimodal) of null bij tool_calls. */
function stringifyAssistantContent(content) {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

/**
 * Vult een plain object voor client/debug (Alleen aanroepen als llmDebugOut een leeg object is).
 * Bevat o.a. tool_calls wanneer het model geen JSON-tekst in `content` zet (MCP/assistants).
 */
function attachOpenAiChoiceDebug(llmDebugOut, data, choice, extra = {}) {
  if (!llmDebugOut || typeof llmDebugOut !== "object") return;
  const msg = choice?.message;
  llmDebugOut.apiModel = data?.model ?? null;
  llmDebugOut.finishReason = choice?.finish_reason ?? null;
  llmDebugOut.usage = data?.usage ?? null;
  llmDebugOut.assistantMessageContent = msg ? stringifyAssistantContent(msg.content) : null;
  if (msg && typeof msg === "object") {
    if (msg.tool_calls != null) llmDebugOut.toolCalls = safeJsonClone(msg.tool_calls);
    if (msg.function_call != null) llmDebugOut.functionCall = safeJsonClone(msg.function_call);
    if (msg.refusal != null && msg.refusal !== "") llmDebugOut.refusal = msg.refusal;
    try {
      llmDebugOut.rawAssistantMessage = safeJsonClone(msg);
    } catch {
      llmDebugOut.rawAssistantMessage = { note: "kon message niet serialiseren" };
    }
  }
  Object.assign(llmDebugOut, extra);
}

function buildAgentHistoryUserSummary(comment, markdown) {
  const payload = {
    instruction: String(comment.body || "").trim(),
    selectedQuote: String(comment.quote || "").trim(),
    selectedPrefix: String(comment.prefix || "").trim(),
    selectedSuffix: String(comment.suffix || "").trim(),
    documentLengthAtRequest: String(markdown || "").length,
  };
  return (
    "Eerdere reviewopdracht op dit document (geen volledige documenttekst hier; die staat alleen in het laatste user-bericht):\n" +
    JSON.stringify(payload)
  );
}

function buildAgentHistoryAssistantSummary(parsed, errorText) {
  if (errorText) {
    return `Geen wijziging toegepast: ${errorText}`;
  }
  const changes = Array.isArray(parsed?.changes) ? parsed.changes : [];
  const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
  const base = reply || "(geen reply-tekst)";
  return changes.length ? `${base}\n[${changes.length} patch(es) toegepast]` : base;
}

/** @param {"review" | "chat"} agentKind */
function buildReviewAgentSystemPrompt(agentKind, replyMarkdown = true) {
  const currentTime = currentTimePromptBlock();
  const instructions = agentInstructionsPromptBlock();
  const replyFmt = replyMarkdown
    ? "Het veld `reply` verschijnt in een chatpaneel: daar mag je Markdown (GFM) gebruiken (koppen, lijsten, nadruk, codeblokken) als dat helpt. "
    : "Het veld `reply` verschijnt als platte tekst in een chatpaneel: gebruik géén Markdown-syntax (geen #-koppen, geen ** of __, geen backticks of fenced blocks, geen `-`/`1.` lijsten). Schrijf gewone zinnen; regeleinden zijn prima. ";

  const core =
    "Je bent een review-agent voor markdown. Geef uitsluitend JSON terug met {\"changes\":[{\"find\":\"...\",\"replace\":\"...\",\"replaceAll\":false}],\"reply\":\"...\"}. " +
    replyFmt +
    "Alleen het veld `changes` past de documenttekst aan (wat de server en viewer verwerkt); `reply` is uitsluitend uitleg in het chatpaneel en wijzigt op zichzelf niets. " +
    "Zeg in `reply` nooit dat er concreet in het document is gewijzigd (bedragen, zinnen, vervangingen, \"staat er nu\") tenzij je daarvoor ten minste één passende patch in `changes` geeft die in het huidige document kan matchen. " +
    "Vraagt de gebruiker om het document aan te passen: lever dan echte find/replace-items in `changes`. Lukt dat niet (fragment niet gevonden, tegenstrijdig): gebruik `changes: []` en leg kort uit in `reply` waarom, zonder te beweren dat het bronbestand wel is gewijzigd. " +
    "Je kunt eerdere user/assistant-berichten zien met oudere opdrachten op hetzelfde document; het **laatste** user-bericht bevat altijd het volledige actuele markdowndocument als context. " +
    "Gebruik die volledige documentcontext om de huidige opdracht te begrijpen en eventuele eerdere antwoorden consistent voort te zetten. " +
    "Maak alleen gerichte wijzigingen via exacte find/replace (find = letterlijke substring uit het huidige document, inclusief spaties en regeleinden waar nodig). " +
    "REGELS OPENING BLOK: het document in het user-bericht gebruikt per platform \\n of \\r\\n; jouw find hoeft niet exact hetzelfde regeleinde-type te hebben—gebruik wel de exacte tekens en regeleinden zoals in die tekst getoond. " +
    "PATCHREGELS (de server wijst anders af): zonder replaceAll moet elke find exact één keer in het document voorkomen. " +
    "Komt dezelfde tekst vaker voor en moet die overal identiek veranderen: gebruik één element in changes met replaceAll:true en find exact gelijk aan die herhaalde brontekst. " +
    "Wil je niet overal vervangen maar wel meerdere plekken: lever meerdere patches met langere find-strings die elk maar één keer voorkomen (unieke context: zin, kop, lijstregel). " +
    "Geen te korte find die onbedoeld meerdere keren voorkomt zonder replaceAll. " +
    "Vermijd meta-zinnen over ‘de opdracht’ in je reply; antwoord kort inhoudelijk op wat er is gedaan. " +
    "VIEWER-DIAGRAMMEN: De viewer rendert (1) Mermaid: fenced block met taal `mermaid` — eerste regel exact ```mermaid, inhoud = geldige Mermaid-syntax, afgesloten met ``` op eigen regel. " +
    "(2) Chart.js: fenced block `chartjs` of `chart` — alleen geldige JSON, object met verplichte string `type` en object `data` (Chart.js v4-config); optioneel `options`. " +
    "Voeg diagrammen zo toe of pas ze aan als één find/replace op het volledige fenced block (inclusief open- en sluitregels); nest geen ``` binnen het blok. " +
    "Bij twijfel over unieke `find`: verleng met omliggende markdown-context.";

  if (agentKind === "chat") {
    return (
      core +
      " MODUS algemene chat-agent (geen comment-thread): opdrachten zijn vaak documentbreed (terminologie, spelling, consequente formulering). " +
      "Bij ‘overal hetzelfde’, hernoemen of uniform maken: gebruik bij voorkeur replaceAll:true met een find die je in het document terugziet; liever één replaceAll-patch dan meerdere finds zonder replaceAll die 2+ keer matchen. " +
      "Bij twijfel tussen breed versus selectief: kies replaceAll alleen als alle voorkomens van die exacte find echt vervangen moeten worden." +
      currentTime +
      instructions
    );
  }

  return (
    core +
    " MODUS review-comment: er is vaak een citaat of selectie; houd daarbij waar zinvol. " +
    "replaceAll:true vooral bij expliciet documentbrede opdrachten (bijv. één term overal gelijk)." +
    currentTime +
    instructions
  );
}

async function callReviewAgent(
  config,
  markdown,
  comment,
  logMeta = {},
  priorChatForApi = [],
  agentKind = "review",
  llmDebugOut = null,
  replyMarkdown = true,
) {
  const kind = agentKind === "chat" ? "chat" : "review";
  const runId = logMeta.runId ?? "—";
  const commentId = comment?.id ?? "—";
  const step = logMeta.step ?? 0;

  const promptPayload = {
    instruction: comment.body,
    selectedQuote: comment.quote || "",
    prefix: comment.prefix || "",
    suffix: comment.suffix || "",
    fullMarkdownDocument: markdown,
    documentLength: markdown.length,
  };
  const userLead =
    kind === "chat"
      ? "Verwerk deze instructie uit het document-chatvenster (algemene agent) met het volledige markdowndocument als context. "
      : "Verwerk deze reviewopdracht met het volledige markdowndocument als context. ";
  const userMessage =
    userLead +
    "Wijzig alleen wat nodig is voor de opdracht en retourneer uitsluitend het afgesproken JSON-object.\n\n" +
    JSON.stringify(promptPayload);

  const url = markdownChatCompletionsUrl(config.endpoint);
  const logReq = {
    step,
    commentId,
    model: config.model,
    endpointHost: safeEndpointHost(config.endpoint),
    markdownChars: markdown.length,
    instructionChars: String(comment.body || "").length,
    quoteChars: String(comment.quote || "").length,
    userMessageChars: userMessage.length,
  };
  if (AGENT_LOG_VERBOSE) {
    logReq.instructionPreview = truncStr(comment.body, 400);
    logReq.quotePreview = truncStr(comment.quote, 200);
  }
  const safeHistory = priorChatForApi
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role, content: m.content }));

  agentLog(runId, "llm_request_start", {
    ...logReq,
    priorHistoryMessages: safeHistory.length,
    agentKind: kind,
  });

  const t0 = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildReviewAgentSystemPrompt(kind, replyMarkdown),
          },
          ...safeHistory,
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });
  } catch (e) {
    agentLog(runId, "llm_fetch_failed", {
      step,
      commentId,
      elapsedMs: Date.now() - t0,
      error: String(e?.message || e),
    });
    throw e;
  }

  const elapsedMs = Date.now() - t0;
  const body = await response.text();
  if (!response.ok) {
    agentLog(runId, "llm_http_error", {
      step,
      commentId,
      status: response.status,
      elapsedMs,
      bodySnippet: truncStr(body, 1000),
    });
    throw new Error(`LLM-call mislukt (${response.status}): ${body.slice(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    agentLog(runId, "llm_response_json_invalid", {
      step,
      commentId,
      elapsedMs,
      bodySnippet: truncStr(body, 600),
      error: String(e?.message || e),
    });
    throw e;
  }

  const choice = data?.choices?.[0];
  const rawContent = choice?.message?.content;
  const contentStr = normalizeAssistantContentForParsing(rawContent).trim();
  attachOpenAiChoiceDebug(llmDebugOut, data, choice);

  agentLog(runId, "llm_response_ok", {
    step,
    commentId,
    elapsedMs,
    contentChars: contentStr.length,
    finishReason: choice?.finish_reason ?? null,
    usage: data?.usage ?? null,
  });

  const msg = choice?.message;
  const hasToolCalls =
    (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0) ||
    (msg?.function_call != null && typeof msg.function_call === "object");

  if (!contentStr) {
    agentLog(runId, "llm_empty_message_content", {
      step,
      commentId,
      choiceKeys: msg ? Object.keys(msg) : [],
      hasToolCalls,
    });
    if (hasToolCalls) {
      if (llmDebugOut && typeof llmDebugOut === "object") {
        llmDebugOut.toolCallsOnly = true;
      }
      agentLog(runId, "llm_tool_calls_no_text_fallback", { step, commentId, agentKind: kind });
      return { changes: [], reply: toolCallsOnlyReply() };
    }
  }

  try {
    const parsed = parseAgentJsonResponse(contentStr);
    const changes = Array.isArray(parsed?.changes) ? parsed.changes : [];
    const replyStr = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    if (changes.length === 0 && !replyStr) {
      noteLlmProseFallback(llmDebugOut);
      agentLog(runId, "llm_json_shape_prose_fallback", {
        step,
        commentId,
        agentKind: kind,
        proseChars: contentStr.length,
      });
      return { changes: [], reply: contentStr };
    }
    agentLog(runId, "llm_parse_ok", {
      step,
      commentId,
      changesCount: changes.length,
      replyChars: replyStr.length,
    });
    return parsed;
  } catch (e) {
    if (contentStr) {
      noteLlmProseFallback(llmDebugOut);
      agentLog(runId, "llm_prose_fallback", {
        step,
        commentId,
        agentKind: kind,
        parseError: String(e?.message || e),
        proseChars: contentStr.length,
      });
      return { changes: [], reply: contentStr };
    }
    if (llmDebugOut && typeof llmDebugOut === "object") {
      llmDebugOut.contentParseError = String(e?.message || e);
    }
    agentLog(runId, "llm_content_parse_error", {
      step,
      commentId,
      error: String(e?.message || e),
      contentSnippet: truncStr(rawContent, 800),
    });
    throw e;
  }
}

/** Chatgeschiedenis om te voegen vóór het laatste user-bericht met volledige documentcontext. */
function wrapChatHistoryForReviewAgent(rawHistory) {
  const base = trimAgentChatHistory(normalizeAgentChatHistory(rawHistory));
  return base.map((m) =>
    m.role === "user"
      ? {
          role: "user",
          content:
            "Eerdere instructie in het document-chatvenster (geen volledige documenttekst hier; die staat alleen in het laatste user-bericht):\n" +
            m.content,
        }
      : { role: "assistant", content: m.content },
  );
}

const CORPUS_MARKDOWN_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_corpus_markdown",
      description:
        "Lees de volledige inhoud van één werkdocument uit Files/. Pad gebruikt forward slashes (bijv. map/notitie.md). Roep dit aan voordat je specifieke details uit werkdocumenten citeert.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand onder de kennisbankroot.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_memory_markdown",
      description:
        "Lees de volledige inhoud van één long-term-memory Markdown-bestand uit Files/.memory/. Pad is relatief aan .memory (bijv. personen/jochem.md). Gebruik dit voordat je bestaande memory bijwerkt.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand onder Files/.memory/.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_corpus_markdown",
      description:
        "Maak een nieuw long-term-memory Markdown-bestand onder Files/.memory/ wanneer er nog geen geschikt memory-bestand bestaat om duurzame inhoud vast te leggen. Pad is relatief aan .memory en gebruikt forward slashes. Overschrijf nooit een bestaand bestand.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad voor het nieuwe .md-bestand (bijv. map/notitie.md).",
          },
          content: {
            type: "string",
            description: "Volledige Markdown-inhoud voor het nieuwe bestand.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
          risk: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Risico-inschatting: low voor kleine neutrale notities, high voor gevoelige/grote wijzigingen.",
          },
          userExplicitlyRequested: {
            type: "boolean",
            description: "True als de gebruiker expliciet vroeg dit bestand aan te maken.",
          },
          requiresConfirmation: {
            type: "boolean",
            description: "True als de gebruiker eerst moet bevestigen.",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Bron-URL's of corpuspaden die de nieuwe inhoud onderbouwen.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_corpus_markdown",
      description:
        "Werk een bestaand long-term-memory Markdown-bestand onder Files/.memory/ bij via één exacte find/replace. Lees het doelbestand eerst met read_memory_markdown. De server maakt een backup; de wijziging is interne agent-housekeeping en krijgt geen aparte gebruikersmelding.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het bestaande .md-bestand onder de kennisbankroot.",
          },
          find: {
            type: "string",
            description: "Letterlijke unieke substring uit het huidige bestand die vervangen moet worden.",
          },
          replace: {
            type: "string",
            description: "Nieuwe tekst. Voeg bij nieuwe/aangepaste secties een timestamp-comment toe.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
          risk: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Risico-inschatting voor deze update.",
          },
          requiresConfirmation: {
            type: "boolean",
            description: "True als deze update eerst door de gebruiker bevestigd moet worden.",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Bron-URL's of corpuspaden die de update onderbouwen.",
          },
        },
        required: ["path", "find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_corpus_deletion",
      description:
        "Doe alleen een verwijderadvies voor een long-term-memory Markdown-bestand. De server verwijdert nooit documenten; dit wordt als suggestie aan de gebruiker getoond.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand waarvoor verwijderen of archiveren wordt gesuggereerd.",
          },
          reason: {
            type: "string",
            description: "Waarom dit document volgens jou kan worden verwijderd/gearchiveerd.",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Corpuspaden of bronnen waarop dit advies gebaseerd is.",
          },
        },
        required: ["path", "reason"],
      },
    },
  },
];

const WEB_SEARCH_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Zoek actuele informatie op het internet via Tavily. Gebruik dit alleen als de gebruiker actuele externe informatie vraagt of expliciet internet/web/online noemt. Verwijs in het antwoord naar URL's uit de resultaten.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concrete zoekopdracht, bij voorkeur met relevante context en jaartal indien actueel.",
          },
          maxResults: {
            type: "number",
            description: `Maximaal aantal zoekresultaten (1-${WEB_SEARCH_MAX_RESULTS}).`,
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["query"],
      },
    },
  },
];

const ACTIVITY_LOG_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_activity_logs",
      description:
        "Lees persistente Ask/Agent activity logs voor activiteitenrapporten, urenregistratie, timesheets en terugblik op werkzaamheden. Dit is read-only en geen Markdown-document.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Optionele startdatum in YYYY-MM-DD of ISO-formaat.",
          },
          toDate: {
            type: "string",
            description: "Optionele einddatum in YYYY-MM-DD of ISO-formaat.",
          },
          query: {
            type: "string",
            description: "Optionele tekstfilter op chat, documentpad, vraag of antwoord.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal logregels (1-500).",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
];

function askToolsForOptions(opts = {}) {
  const tools = [];
  if (opts.enableCorpusTools) tools.push(...CORPUS_MARKDOWN_TOOLS);
  if (opts.enableActivityLogs) tools.push(...ACTIVITY_LOG_TOOLS);
  if (opts.enableWebSearch) tools.push(...WEB_SEARCH_TOOLS);
  return tools;
}

/**
 * Corpus Ask met OpenAI-compatibele tools: model kan volledige bestanden opvragen.
 * streamActivity: optioneel callback voor NDJSON-stream (`{ type: 'activity', … }`).
 */
async function callCorpusAskAgentWithTools(
  config,
  bootstrapUserMarkdown,
  priorChatForApi,
  logMeta = {},
  llmDebugOut = null,
  streamActivity = null,
  corpusOpts = {},
) {
  const replyMarkdown = corpusOpts.replyMarkdown !== false;
  const enableCorpusTools = corpusOpts.enableCorpusTools !== false;
  const enableWebSearch = corpusOpts.enableWebSearch === true;
  const enableActivityLogs = corpusOpts.enableActivityLogs === true;
  const enableMemoryWriteTools = corpusOpts.enableMemoryWriteTools === true;
  const tools = askToolsForOptions({ enableCorpusTools, enableWebSearch, enableActivityLogs, enableMemoryWriteTools });
  const runId = logMeta.runId ?? "—";
  const activities = [];
  const corpusCreatedPaths = [];
  const executedMemoryActions = [];
  const pendingMemoryActions = [];

  const pushActivity = (row) => {
    const payload = { type: "activity", ts: Date.now(), ...row };
    activities.push(payload);
    try {
      streamActivity?.(payload);
    } catch {
      /* streaming-client verbinding kan gesloten zijn */
    }
  };

  const safeHistory = trimAgentChatHistory(normalizeAgentChatHistory(priorChatForApi)).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const currentTime = currentTimePromptBlock();
  const instructions = agentInstructionsPromptBlock();

  const replyTail = replyMarkdown
    ? " De string reply mag Markdown (GFM) gebruiken voor het chatpaneel. Als iets niet in de gelezen inhoud staat, zeg dat eerlijk en verwijs naar paden tussen backticks waar nodig."
    : " De string reply is platte tekst voor het chatpaneel: géén Markdown-opmaak (geen #-koppen, geen ** of __, geen backticks of fenced codeblokken, geen `-`/genummerde lijsten). Verwijs naar bestanden als gewone padteksten (geen backticks). Als iets niet in de gelezen inhoud staat, zeg dat eerlijk.";

  const systemContent =
    "Je bent een assistent voor een persoonlijke Markdown-werkomgeving met drie lagen: werkdocumenten, actieve chat als short-term memory, en Files/.memory/ als long-term memory. Beantwoord uiteindelijk in het Nederlands, helder en waarheidsgetrouw. " +
    (enableCorpusTools
      ? "Je hebt read-only retrieval tools voor werkdocumenten en long-term memory: read_corpus_markdown en read_memory_markdown. " +
        (enableMemoryWriteTools
          ? "Je hebt daarnaast memory-write tools create_corpus_markdown, update_corpus_markdown en suggest_corpus_deletion. "
          : "Je hebt in deze call geen memory-write tools; beantwoord de vraag zonder geheugenmutaties. ") +
        "Corpus Ask betekent dat je werkdocumenten en long-term memory als twee gescheiden zoekruimtes gebruikt: scan beide compacte lijsten in het user-bericht en beperk je niet tot de hintsecties. " +
        "Gebruik read_corpus_markdown voor relevante werkdocumenten en read_memory_markdown voor relevante memory-bestanden voordat je specifieke feiten of citaten geeft. " +
        "Bij brede vragen (overzicht, inventarisatie, vergelijking, alles/hele corpus) lees je meerdere relevante bestanden in rondes totdat de context voldoende is afgedekt. " +
        "Als de compacte index voldoende is voor een oriënterend antwoord, mag je meteen antwoorden zonder extra volledige bestanden te lezen. " +
        (enableMemoryWriteTools
          ? "Ga autonoom met long-term memory om: werk bestaande memory-documenten bij wanneer nieuwe duurzame context daar logisch thuishoort, of maak zelfstandig nieuwe memory-documenten aan als er structureel over onderwerpen/personen/klanten/voorkeuren/werkwijzen wordt gesproken en er geen passend memory-document bestaat. Vraag de gebruiker niet of een onderwerp een eigen document nodig heeft; beslis dat zelf. Belangrijk: geheugenacties die je via create_corpus_markdown of update_corpus_markdown aanvraagt worden direct door de server uitgevoerd als interne agent-housekeeping. Geef geen aparte melding dat memory is bijgewerkt en vraag geen akkoord. Noem in je reply geen storage-beslissingen, bestandsnamen, memory-paden of housekeeping-acties zoals aanmaken, bijwerken, opslaan of vastleggen, tenzij de gebruiker expliciet vraagt waar iets staat of om een audit/inspectie van memory. Voer waar nodig meerdere memory-mutaties uit binnen één promptverwerking. Gebruik create_corpus_markdown alleen als er geen geschikt bestaand memory-document is; gebruik update_corpus_markdown alleen na lezen van het memory-doelbestand en met exacte find/replace. Documenten verwijderen is verboden: gebruik alleen suggest_corpus_deletion. "
          : "")
      : "De user-context bevat het huidige document als referentie; je hebt geen tool om lokale bestanden te lezen. ") +
    ASK_CURIOSITY_RULE +
    (enableWebSearch
      ? "Je hebt ook tool **web_search** voor actuele externe informatie via Tavily. Gebruik web_search wanneer de vraag actuele of externe feiten vereist, en noem in je antwoord de geraadpleegde URL's. Houd duidelijk onderscheid tussen informatie uit de kennisbank en informatie van internet. "
      : "Je hebt geen internettool; beweer geen actuele externe feiten zonder bron. ") +
    (enableActivityLogs
      ? "Je hebt ook tool **read_activity_logs** om persistente Ask/Agent activity logs te lezen. Gebruik deze tool wanneer de gebruiker vraagt naar activiteiten, urenregistratie, timesheets, werkzaamheden of wat er op een dag/week is gedaan. Activity logs zijn read-only en geen Markdown-documenten. "
      : "") +
    (enableCorpusTools
      ? "Het eerste user-bericht bevat gescheiden index-/overzichtsblokken voor werkdocumenten en long-term memory zonder volledige documentteksten. "
      : "Het eerste user-bericht bevat de gebruikersvraag en eventueel het huidige Markdown-document. ") +
    (enableMemoryWriteTools
      ? "Als de gebruiker vraagt iets vast te leggen, bij te werken, aan te maken of in het geheugen/corpus te verwerken, of als je antwoord duurzame stappen/kennis bevat die later terugvindbaar moeten zijn, MOET je zelf kiezen tussen één of meerdere create_corpus_markdown- en update_corpus_markdown-acties voor Files/.memory/. Vraag niet of de gebruiker dat wil; voer de passende geheugenacties uit. Als je geen toolcall gebruikt, neem dan top-level \"pendingMemoryActions\" op in je finale JSON met één of meerdere acties met dezelfde velden (kind, path, reason, content of find/replace, sources), waarbij path relatief is aan Files/.memory/. De reply blijft inhoudelijk: geen melding over uitgevoerde of gekozen memory-acties, geen paden en geen 'ik heb dit aangemaakt/bijgewerkt'. "
      : "") +
    "Na het lezen van alle relevante bestanden: geef het uiteindelijke antwoord als **uitsluitend** één JSON-object met sleutel \"reply\" (string, verplicht). " +
    "Optioneel mag je ook \"viewerActions\" opnemen: een array (max 10) met hints voor de viewer — alleen als het de gebruiker helpt je antwoord te volgen: " +
    "{\"openMarkdown\":\"pad/onder/map.md\"} opent dat bestand links; {\"highlight\":{\"path\":\"pad/map.md\",\"snippet\":\"exact fragment zoals in het bronbestand\"}} markeert dat fragment na openen (snippet moet letterlijk voorkomen). " +
    "Toegestane top-level sleutels: reply, viewerActions en pendingMemoryActions. Gebruik pendingMemoryActions alleen als de toolroute onmogelijk is; de server voert zulke acties daarna alsnog direct uit of toont ze als fallback. " +
    replyTail +
    currentTime +
    instructions;

  const messages = [
    { role: "system", content: systemContent },
    ...safeHistory,
    { role: "user", content: bootstrapUserMarkdown },
  ];

  const url = markdownChatCompletionsUrl(config.endpoint);

  for (let iter = 0; iter < CORPUS_ASK_MAX_ROUNDS; iter++) {
    pushActivity({
      phase: "thinking",
      label: iter === 0 ? "Model denkt na over je vraag…" : `Verdieping — stap ${iter + 1}`,
    });

    agentLog(runId, "corpus_tool_round_start", { iter });

    let response;
    const t0 = Date.now();
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages,
          tools,
          tool_choice: "auto",
        }),
      });
    } catch (e) {
      agentLog(runId, "corpus_tool_fetch_failed", { iter, error: String(e?.message || e) });
      throw e;
    }

    const bodyText = await response.text();
    if (!response.ok) {
      agentLog(runId, "corpus_tool_http_error", {
        iter,
        status: response.status,
        snippet: truncStr(bodyText, 600),
      });
      throw new Error(`LLM-call mislukt (${response.status}): ${bodyText.slice(0, 500)}`);
    }

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(`LLM-response geen JSON: ${truncStr(bodyText, 200)}`);
    }

    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg || typeof msg !== "object") {
      throw new Error("LLM-response zonder message");
    }

    attachOpenAiChoiceDebug(llmDebugOut, data, choice);

    messages.push(msg);

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (toolCalls.length > 0) {
      const fnNames = toolCalls
        .map((tc) => (tc?.function?.name ? String(tc.function.name) : ""))
        .filter(Boolean);
      const hasRead = fnNames.includes("read_corpus_markdown");
      const hasReadMemory = fnNames.includes("read_memory_markdown");
      const hasCreate = fnNames.includes("create_corpus_markdown");
      const hasUpdate = fnNames.includes("update_corpus_markdown");
      const hasSuggestDelete = fnNames.includes("suggest_corpus_deletion");
      const hasWebSearch = fnNames.includes("web_search");
      const hasActivityLogs = fnNames.includes("read_activity_logs");
      let fetchLabel = `${toolCalls.length} corpus-actie(s)…`;
      if (hasActivityLogs) fetchLabel = `${toolCalls.length} activity-logactie(s)…`;
      else if (hasWebSearch && (hasRead || hasCreate)) fetchLabel = `${toolCalls.length} corpus-/webactie(s)…`;
      else if (hasWebSearch) fetchLabel = `${toolCalls.length} webzoekopdracht(en)…`;
      else if (hasUpdate) fetchLabel = `${toolCalls.length} geheugenupdate(s) voorbereiden…`;
      else if (hasSuggestDelete) fetchLabel = `${toolCalls.length} geheugensuggestie(s) voorbereiden…`;
      else if ((hasRead || hasReadMemory) && hasCreate) fetchLabel = `${toolCalls.length} bestand(en) lezen of aanmaken…`;
      else if (hasCreate && !hasRead && !hasReadMemory) fetchLabel = `${toolCalls.length} nieuw(e) bestand(en) aanmaken…`;
      else if ((hasRead || hasReadMemory) && !hasCreate) fetchLabel = `${toolCalls.length} bestand(en) volledig ophalen…`;

      pushActivity({
        phase: "fetching",
        label: fetchLabel,
      });

      let roundHadCreate = false;

      for (const tc of toolCalls) {
        if (!tc || tc.type !== "function" || !tc.id) continue;
        const fnName = tc.function?.name;
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          args = {};
        }

        const relPath = typeof args.path === "string" ? args.path.trim() : "";
        const reason = typeof args.reason === "string" ? args.reason.trim() : "";

        if (fnName === "read_activity_logs") {
          pushActivity({
            phase: "activity_logs",
            label: "Activity logs lezen",
            detail: reason || args.query || undefined,
          });
          const payload = readActivityLogsToolPayload(args);
          agentLog(runId, "activity_logs_tool_read", {
            count: payload.count,
            totalMatched: payload.totalMatched,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "web_search") {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          pushActivity({
            phase: "web_search",
            label: "Internet zoeken",
            detail: reason || query || undefined,
          });

          const payload = await webSearchTavilyToolPayload(query, args.maxResults, runId);
          agentLog(runId, "web_search", {
            query: truncStr(query, 240),
            ok: payload.ok,
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Deze long-term-memory housekeeping is intern. Noem in de uiteindelijke reply niet dat dit bestand is aangemaakt, bijgewerkt, opgeslagen of waar het staat.",
            }),
          });
          continue;
        }

        if (fnName === "read_corpus_markdown") {
          pushActivity({
            phase: "read_file",
            label: "Markdown-bestand lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || undefined,
          });

          const payload = readCorpusMarkdownToolPayload(relPath);
          agentLog(runId, "corpus_tool_read", {
            path: relPath,
            ok: payload.ok,
            chars: payload.ok ? String(payload.content || "").length : 0,
            truncated: !!payload.truncated,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Deze long-term-memory housekeeping is intern. Noem in de uiteindelijke reply niet dat dit bestand is aangemaakt, bijgewerkt, opgeslagen of waar het staat.",
            }),
          });
          continue;
        }

        if (fnName === "read_memory_markdown") {
          pushActivity({
            phase: "read_memory",
            label: "Memory-bestand lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || undefined,
          });

          const payload = readMemoryMarkdownToolPayload(relPath);
          agentLog(runId, "memory_tool_read", {
            path: relPath,
            ok: payload.ok,
            chars: payload.ok ? String(payload.content || "").length : 0,
            truncated: !!payload.truncated,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "create_corpus_markdown") {
          const payload = await processMemoryActionTool(
            { ...args, path: relPath, kind: "create" },
            "create",
            runId,
            { forceExecute: true },
          );
          if (payload.pending && payload.action) {
            pendingMemoryActions.push(payload.action);
          } else if (payload.ok && payload.action) {
            executedMemoryActions.push(payload.action);
          }
          if (payload.ok && payload.executed && payload.path) {
            roundHadCreate = true;
            if (!corpusCreatedPaths.includes(payload.path)) corpusCreatedPaths.push(payload.path);
          }
          agentLog(runId, "corpus_tool_create", {
            path: relPath,
            ok: payload.ok,
            pending: !!payload.pending,
            chars: payload.ok ? payload.charsWritten ?? 0 : 0,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "update_corpus_markdown") {
          const payload = await processMemoryActionTool(
            { ...args, path: relPath, kind: "update" },
            "update",
            runId,
            { forceExecute: true },
          );
          if (payload.pending && payload.action) {
            pendingMemoryActions.push(payload.action);
          } else if (payload.ok && payload.action) {
            executedMemoryActions.push(payload.action);
          }
          agentLog(runId, "corpus_tool_update", {
            path: relPath,
            ok: payload.ok,
            pending: !!payload.pending,
            executed: !!payload.executed,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "suggest_corpus_deletion") {
          pushActivity({
            phase: "memory_suggestion",
            label: "Verwijderadvies voorbereiden",
            path: relPath || "(pad ontbreekt)",
            detail: reason || undefined,
          });
          const payload = await processMemoryActionTool(
            { ...args, path: relPath, kind: "delete_suggestion", requiresConfirmation: true },
            "delete_suggestion",
            runId,
          );
          if (payload.action) pendingMemoryActions.push(payload.action);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ok: true,
              pending: true,
              suggestionOnly: true,
              action: payload.action,
              message: "Verwijderen is niet toegestaan; toon dit als suggestie aan de gebruiker.",
            }),
          });
          continue;
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: `Onbekende tool: ${fnName}` }),
        });
      }

      pushActivity({
        phase: "digest",
        label: roundHadCreate
          ? "Informatie verwerken…"
          : "Informatie uit gelezen bestanden verwerken…",
      });

      continue;
    }

    const rawContent = msg.content;
    const contentStr = normalizeAssistantContentForParsing(rawContent).trim();

    if (!contentStr) {
      agentLog(runId, "corpus_tool_empty_final", { iter });
      throw new Error("Het model gaf geen tekstantwoord na het verwerken van de corpus.");
    }

    let reply = "";
    let viewerActions = [];
    try {
      const parsed = parseAgentJsonResponse(contentStr);
      reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
      viewerActions = normalizeViewerActions(parsed?.viewerActions);
      const finalPending = normalizePendingMemoryActions(parsed?.pendingMemoryActions);
      for (const action of finalPending) {
        if (action.kind === "delete_suggestion") {
          pendingMemoryActions.push(action);
          continue;
        }
        const result = await executeMemoryAction(action, runId);
        if (result.ok && result.executed && result.action) {
          executedMemoryActions.push(result.action);
          if (result.kind === "create" && result.path && !corpusCreatedPaths.includes(result.path)) {
            corpusCreatedPaths.push(result.path);
          }
        } else if (result.action) {
          pendingMemoryActions.push(result.action);
        }
      }
    } catch {
      noteLlmProseFallback(llmDebugOut);
      reply = contentStr;
    }

    if (!reply) {
      reply = contentStr;
    }
    const uniquePendingMemoryActions = dedupeMemoryActions(pendingMemoryActions);
    pendingMemoryActions.splice(0, pendingMemoryActions.length, ...uniquePendingMemoryActions);
    reply = ensureMemoryActionQuestion(reply, pendingMemoryActions);
    reply = ensureMemoryAppliedNotice(reply, executedMemoryActions);
    reply = stripMemoryHousekeepingFromReply(reply, executedMemoryActions);

    agentLog(runId, "corpus_tool_done", {
      elapsedMs: Date.now() - t0,
      iterations: iter + 1,
      replyChars: reply.length,
      viewerActions: viewerActions.length,
      corpusCreatedCount: corpusCreatedPaths.length,
      executedMemoryActions: executedMemoryActions.length,
      pendingMemoryActions: pendingMemoryActions.length,
    });

    pushActivity({ phase: "done", label: "Antwoord gereed." });

    return {
      reply,
      activities,
      viewerActions,
      corpusCreatedPaths,
      executedMemoryActions,
      pendingMemoryActions,
    };
  }

  throw new Error(`Te veel tool-rondes (max ${CORPUS_ASK_MAX_ROUNDS}). Probeer een smallere vraag.`);
}

async function callAskAgent(
  config,
  markdown,
  message,
  priorChatForApi,
  logMeta = {},
  llmDebugOut = null,
  options = {},
) {
  const runId = logMeta.runId ?? "—";
  const corpusAsk = options.corpusAsk === true;
  const replyMarkdown = options.replyMarkdown !== false;
  const currentPath = typeof options.currentPath === "string" ? options.currentPath.trim() : "";
  const userBlob = corpusAsk
    ? markdown
    : message +
      (currentPath ? `\n\nHuidig documentpad: ${currentPath}` : "") +
      "\n\n---\n\n## Huidig Markdown-document (alleen ter referentie)\n\n" +
      markdown;
  const safeHistory = trimAgentChatHistory(normalizeAgentChatHistory(priorChatForApi)).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const currentTime = currentTimePromptBlock();
  const instructions = agentInstructionsPromptBlock();

  agentLog(runId, "ask_llm_request_start", {
    model: config.model,
    endpointHost: safeEndpointHost(config.endpoint),
    markdownChars: markdown.length,
    historyLen: safeHistory.length,
    corpusAsk,
  });

  const url = markdownChatCompletionsUrl(config.endpoint);
  const t0 = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: corpusAsk
              ? "Je bent een assistent voor een persoonlijke kennisbank (Markdown-bestanden). Beantwoord in het Nederlands, kort en helder. " +
                "Het laatste user-bericht bevat een corpus-contextblok met fragmenten uit meerdere bestanden plus een manifest-overzicht: gebruik dit als primaire bron. " +
                "Verzin geen inhoud die niet in de context staat; als het antwoord niet in de fragmenten staat, zeg dat eerlijk en noem welke bestanden mogelijk relevant zijn als ze genoemd worden in INDEX_MANIFEST_EXCERPT. " +
                ASK_CURIOSITY_RULE +
                (replyMarkdown
                  ? "Citeer bij voorkeur met bestandspaden tussen backticks (bijv. `map/notitie.md`). "
                  : "Verwijs naar bestanden als platte padteksten zonder Markdown/backticks. ") +
                "Wijzig geen documenten in deze modus. Geef uitsluitend JSON: {\"reply\":\"…\"}. " +
                (replyMarkdown
                  ? "Het veld reply mag Markdown (GFM) gebruiken."
                  : "Het veld reply is platte tekst zonder Markdown-syntax.") +
                currentTime +
                instructions
              : "Je bent een assistent bij Markdown-documenten. Beantwoord in het Nederlands, kort en helder. " +
                "Het laatste user-bericht bevat de vraag en onderaan het volledige document als referentie. " +
                ASK_CURIOSITY_RULE +
                "Ask-modus mag long-term-memory-acties voorbereiden; de server voert uitvoerbare acties direct uit in Files/.memory/ als interne agent-housekeeping, zonder aparte gebruikersmelding. " +
                "Als het antwoord duurzame stappen of herbruikbare kennis bevat, bepaal dan zelf of dit in één of meerdere nieuwe memory-documenten hoort of in één of meerdere bestaande memory-documenten. Vraag niet of de gebruiker dit wil opslaan of of er een eigen document nodig is. " +
                "Noem in reply geen storage-beslissingen, bestandsnamen, memory-paden of housekeeping-acties zoals aanmaken, bijwerken, opslaan of vastleggen, tenzij de gebruiker expliciet vraagt waar iets staat of om een audit/inspectie van memory. Zeg ook niet dat de gebruiker iets kan plakken of zelf een bestand moet aanmaken als jij dit via memory-acties kunt doen. " +
                "Als de gebruiker vraagt om het geopende werkdocument inhoudelijk aan te passen, leg kort uit dat Agent-modus daarvoor bedoeld is; retourneer geen memory-actie die het werkdocument herschrijft. " +
                "Retourneer alleen top-level pendingMemoryActions voor long-term memory onder Files/.memory/. Dit mag een array met meerdere acties zijn: {kind:\"create\"|\"update\", path, reason, content of find/replace, sources}. Het path is relatief aan Files/.memory/. " +
                (replyMarkdown
                  ? "Ter info: in de viewer worden ```mermaid-blokken als diagrammen en ```chartjs/```chart-blokken (JSON met type+data) als Chart.js-grafieken getoond. "
                  : "") +
                "Geef uitsluitend JSON. Toegestane top-level sleutels: reply en pendingMemoryActions. " +
                "Als je pendingMemoryActions teruggeeft, mag je meerdere memory-mutaties in één antwoord opnemen. Voeg geen aparte tekst toe over memory-mutaties, akkoordknoppen of rollback. " +
                (replyMarkdown
                  ? "Het veld reply mag Markdown (GFM) gebruiken."
                  : "Het veld reply is platte tekst zonder Markdown-syntax.") +
                currentTime +
                instructions,
          },
          ...safeHistory,
          {
            role: "user",
            content: userBlob,
          },
        ],
      }),
    });
  } catch (e) {
    agentLog(runId, "ask_llm_fetch_failed", {
      elapsedMs: Date.now() - t0,
      error: String(e?.message || e),
    });
    throw e;
  }

  const elapsedMs = Date.now() - t0;
  const body = await response.text();
  if (!response.ok) {
    agentLog(runId, "ask_llm_http_error", {
      status: response.status,
      elapsedMs,
      bodySnippet: truncStr(body, 1000),
    });
    throw new Error(`LLM-call mislukt (${response.status}): ${body.slice(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    agentLog(runId, "ask_llm_response_json_invalid", {
      elapsedMs,
      bodySnippet: truncStr(body, 600),
      error: String(e?.message || e),
    });
    throw e;
  }

  const choice = data?.choices?.[0];
  const rawContent = choice?.message?.content;
  const contentStr = normalizeAssistantContentForParsing(rawContent).trim();
  attachOpenAiChoiceDebug(llmDebugOut, data, choice);

  agentLog(runId, "ask_llm_response_ok", {
    elapsedMs,
    contentChars: contentStr.length,
    finishReason: choice?.finish_reason ?? null,
    usage: data?.usage ?? null,
  });

  const msg = choice?.message;
  const hasToolCalls =
    (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0) ||
    (msg?.function_call != null && typeof msg.function_call === "object");

  if (!contentStr) {
    if (hasToolCalls) {
      if (llmDebugOut && typeof llmDebugOut === "object") {
        llmDebugOut.toolCallsOnly = true;
      }
      agentLog(runId, "ask_llm_tool_calls_no_text_fallback", { elapsedMs });
      return { reply: toolCallsOnlyReply(), pendingMemoryActions: [] };
    }
    agentLog(runId, "ask_llm_empty_content", { elapsedMs });
    throw new Error("Lege LLM-response");
  }

  let parsed;
  try {
    parsed = parseAgentJsonResponse(contentStr);
  } catch (e) {
    noteLlmProseFallback(llmDebugOut);
    agentLog(runId, "ask_llm_prose_fallback", {
      elapsedMs,
      proseChars: contentStr.length,
      parseError: String(e?.message || e),
    });
    return { reply: contentStr, pendingMemoryActions: [] };
  }
  const pendingMemoryActions = normalizePendingMemoryActions(parsed?.pendingMemoryActions);
  const reply = ensureMemoryActionQuestion(
    typeof parsed?.reply === "string" ? parsed.reply.trim() : "",
    pendingMemoryActions,
  );
  if (!reply) {
    noteLlmProseFallback(llmDebugOut);
    agentLog(runId, "ask_llm_empty_reply_use_prose", { elapsedMs, proseChars: contentStr.length });
    return { reply: contentStr, pendingMemoryActions };
  }
  return { reply, pendingMemoryActions };
}

async function callMemoryProposalAgent(
  config,
  targetPath,
  targetMarkdown,
  message,
  priorChatForApi,
  logMeta = {},
  llmDebugOut = null,
  options = {},
) {
  const runId = logMeta.runId ?? "—";
  const replyMarkdown = options.replyMarkdown !== false;
  const safeHistory = trimAgentChatHistory(normalizeAgentChatHistory(priorChatForApi)).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const currentTime = currentTimePromptBlock();
  const instructions = agentInstructionsPromptBlock();
  const url = markdownChatCompletionsUrl(config.endpoint);
  const promptPayload = {
    userRequest: message,
    targetPath,
    fullMarkdownDocument: targetMarkdown,
    activeContext: options.activeContext || null,
  };

  agentLog(runId, "memory_fallback_request_start", {
    targetPath,
    markdownChars: String(targetMarkdown || "").length,
    historyLen: safeHistory.length,
  });

  const t0 = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Je maakt read-only wijzigingsvoorstellen voor één of meer relevante long-term-memory wijzigingen. " +
            "Schrijf nooit zelf naar disk; retourneer uitsluitend JSON met keys reply en pendingMemoryActions. " +
            "pendingMemoryActions bevat één of meer updates: {kind:\"update\", path, reason, find, replace, sources}. " +
            "Gebruik bij deze fallback path exact gelijk aan targetPath. Elke find moet een exacte, unieke substring zijn uit fullMarkdownDocument; replace is diezelfde substring plus de gevraagde statusregel/actiepunt op een logische plek. " +
            "Als userRequest een droomverzoek is, gebruik dan activeContext en de actieve chatgeschiedenis om duurzame inzichten compact in targetPath te verwerken. " +
            "Voeg in replace een HTML timestamp-comment toe. Als je geen unieke veilige find kunt bepalen, retourneer pendingMemoryActions:[] en leg kort uit waarom. " +
            "Schrijf in reply niet apart dat memory wordt bijgewerkt en noem geen akkoordknoppen of rollback. Noem ook geen targetPath, bestandsnaam, opslagkeuze of dat iets is aangemaakt/bijgewerkt/opgeslagen. " +
            (replyMarkdown
              ? "reply mag Markdown gebruiken. "
              : "reply is platte tekst zonder Markdown-syntax. ") +
            currentTime +
            instructions,
        },
        ...safeHistory,
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
    }),
  });

  const elapsedMs = Date.now() - t0;
  const body = await response.text();
  if (!response.ok) {
    agentLog(runId, "memory_fallback_http_error", {
      targetPath,
      status: response.status,
      elapsedMs,
      bodySnippet: truncStr(body, 800),
    });
    throw new Error(`LLM-call mislukt (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = JSON.parse(body);
  const choice = data?.choices?.[0];
  attachOpenAiChoiceDebug(llmDebugOut, data, choice);
  const contentStr = normalizeAssistantContentForParsing(choice?.message?.content).trim();
  let parsed = null;
  try {
    parsed = parseAgentJsonResponse(contentStr);
  } catch (e) {
    agentLog(runId, "memory_fallback_parse_failed", {
      targetPath,
      elapsedMs,
      error: String(e?.message || e),
      contentSnippet: truncStr(contentStr, 800),
    });
    return { reply: "", pendingMemoryActions: [] };
  }

  const pendingMemoryActions = normalizePendingMemoryActions(parsed?.pendingMemoryActions).filter(
    (action) => action.kind === "update" && action.path === targetPath && action.find && action.replace,
  );
  const reply = ensureMemoryActionQuestion(
    typeof parsed?.reply === "string" ? parsed.reply.trim() : "",
    pendingMemoryActions,
  );
  agentLog(runId, "memory_fallback_done", {
    targetPath,
    elapsedMs,
    pendingMemoryActions: pendingMemoryActions.length,
    replyChars: reply.length,
  });
  return { reply, pendingMemoryActions };
}

async function executeDurableMemoryFallback(config, message, history, runId, llmDebugOut = null, options = {}) {
  const dreamMemoryRequest = looksLikeDreamMemoryRequest(message);
  if (!looksLikeDurableMemorySignal(message) && !dreamMemoryRequest) {
    return { executedMemoryActions: [], pendingMemoryActions: [], corpusCreatedPaths: [], targetPath: "" };
  }
  let memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  if (!memoryManifest?.entries?.length) {
    const rebuilt = await runCorpusIndexRebuild("durable_memory_fallback_missing_index");
    memoryManifest = rebuilt?.memory || memoryManifest;
  }
  const targetSeed = dreamMemoryRequest
    ? `${message}\n${options.currentPath || ""}\n${String(options.currentMarkdown || "").slice(0, 1200)}`
    : message;
  const targetPath = pickMemoryTargetPath(targetSeed, memoryManifest, inferDurableMemoryTargetPath(message));
  if (!targetPath) {
    return { executedMemoryActions: [], pendingMemoryActions: [], corpusCreatedPaths: [], targetPath: "" };
  }
  const targetPayload = readMemoryMarkdownToolPayload(targetPath);
  if (!targetPayload.ok || typeof targetPayload.content !== "string") {
    agentLog(runId, "durable_memory_fallback_skipped", {
      targetPath,
      error: targetPayload.error || "Doelbestand kon niet worden gelezen.",
    });
    return { executedMemoryActions: [], pendingMemoryActions: [], corpusCreatedPaths: [], targetPath };
  }
  const fallback = await callMemoryProposalAgent(
    config,
    targetPath,
    targetPayload.content,
    message,
    history,
    { runId },
    llmDebugOut,
    {
      ...options,
      activeContext: dreamMemoryRequest
        ? {
            currentPath: options.currentPath || "",
            currentMarkdown: String(options.currentMarkdown || "").slice(0, 12000),
          }
        : null,
    },
  );
  const executedMemoryActions = [];
  const pendingMemoryActions = [];
  const corpusCreatedPaths = [];
  for (const action of fallback.pendingMemoryActions || []) {
    const applied = await executeMemoryAction(action, runId);
    if (applied.ok && applied.executed && applied.action) {
      executedMemoryActions.push(applied.action);
      if (applied.kind === "create" && applied.path) corpusCreatedPaths.push(applied.path);
    } else if (applied.action) {
      pendingMemoryActions.push(applied.action);
    }
  }
  agentLog(runId, "durable_memory_fallback_done", {
    targetPath,
    executedMemoryActions: executedMemoryActions.length,
    pendingMemoryActions: pendingMemoryActions.length,
  });
  return { executedMemoryActions, pendingMemoryActions, corpusCreatedPaths, targetPath };
}

function backupMarkdownIfNeeded(name, full, state) {
  if (state.backedUp) return;
  const bak = markdownBackupPath(name);
  if (bak && fs.existsSync(full)) {
    ensureParentDir(bak);
    fs.writeFileSync(bak, fs.readFileSync(full, "utf8"), "utf8");
  }
  state.backedUp = true;
}

/** Backup vóór eerste patch bij agent-run op extern meegestuurde markdown (geen .md in MARKDOWN_DIR). */
function backupExternalMarkdownIfNeeded(name, markdownSnapshot, state) {
  if (state.backedUp) return;
  const bak = markdownBackupPath(name);
  if (bak) {
    ensureParentDir(bak);
    fs.writeFileSync(bak, markdownSnapshot, "utf8");
  }
  state.backedUp = true;
}

const app = express();

app.disable("x-powered-by");
/** Cross-origin als de UI op een andere poort/host draait dan deze API (Vite :5173 → API :8787). */
const enableLocalhostApiCors =
  apiOnly || !isDev || String(process.env.ENABLE_LOCALHOST_CORS || "").trim() === "1";
if (enableLocalhostApiCors) {
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "");
    if (localhostOrigin.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.append("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
}

/**
 * DOCX → Markdown (één stap: upload als base64, server zet om met mammoth).
 * Grotere limiet dan overige JSON-routes door base64-overhead.
 */
app.post("/api/docx/import", express.json({ limit: "48mb" }), async (req, res) => {
  try {
    const b64 = req.body?.docxBase64;
    const originalName = req.body?.originalName;
    if (typeof b64 !== "string" || !b64.trim()) {
      res.status(400).json({ error: "docxBase64 is verplicht (base64 van het .docx-bestand)." });
      return;
    }
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      res.status(400).json({ error: "Ongeldige base64." });
      return;
    }
    if (!buffer.length) {
      res.status(400).json({ error: "Leeg bestand." });
      return;
    }
    const maxBytes = 35 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      res
        .status(413)
        .json({ error: `DOCX te groot (max. ${Math.floor(maxBytes / 1024 / 1024)} MB na decode).` });
      return;
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      res.status(400).json({ error: "Bestand lijkt geen geldige .docx (verwacht ZIP-handtekening PK)." });
      return;
    }
    const { markdown, messages } = await convertDocxBufferToMarkdown(buffer);
    const suggestedName = suggestedMdNameFromDocxUpload(originalName);
    const payload = { markdown, suggestedName };
    if (Array.isArray(messages) && messages.length > 0) {
      payload.mammothMessages = messages.map((m) =>
        typeof m === "object" && m != null && "message" in m ? String(m.message) : String(m),
      );
    }
    res.json(payload);
  } catch (e) {
    console.error("[docx/import]", e);
    res.status(422).json({ error: String(e?.message || e) });
  }
});

app.use(express.json({ limit: "20mb" }));
app.use((err, req, res, next) => {
  if (!err) return next();
  const t = err.type || err.name;
  if (t === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
    return res.status(400).json({
      error: `Requestbody is geen geldige JSON (${err.message || err}). Vaak door zeer ongeldige Unicode of gebroken UTF-8 na kopiëren/plakken.`,
    });
  }
  if (t === "entity.too.large") {
    return res.status(413).json({
      error: "Requestbody te groot (limiet 20 MB).",
    });
  }
  return next(err);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, handlerRev: API_HANDLER_REVISION });
});

app.get("/api/agent-config", (_req, res) => {
  try {
    res.json(publicAgentConfig());
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent-config", (req, res) => {
  try {
    const config = writeAgentConfig(req.body ?? {});
    res.json({ ok: true, config: publicAgentConfig(config) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent-models", async (req, res) => {
  try {
    const models = await fetchAvailableAgentModels(req.body ?? {});
    res.json({ ok: true, models });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e), models: [] });
  }
});

app.post("/api/agent/transcript-cleanup", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.json({ ok: true, text: "" });
      return;
    }
    const config = readAgentConfig();
    if (!config.apiKey.trim() || !config.endpoint.trim() || !config.model.trim()) {
      res.status(400).json({ error: "Agentconfig ontbreekt: vul API key, endpoint en model in." });
      return;
    }
    agentLog(runId, "transcript_cleanup_start", { chars: text.length });
    const cleaned = await cleanupTranscriptWithAgent(config, text);
    agentLog(runId, "transcript_cleanup_done", { chars: cleaned.length });
    res.json({ ok: true, text: cleaned || text });
  } catch (e) {
    agentLog(runId, "transcript_cleanup_error", { error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/agent/instructions", (_req, res) => {
  try {
    res.json({ ok: true, path: resolvedAgentInstructionsPath(), content: readAgentInstructionsFile() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.put("/api/agent/instructions", (req, res) => {
  try {
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const saved = writeAgentInstructionsFile(content);
    res.json({ ok: true, path: saved.path, content: saved.content });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent/memory-actions/apply", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    if (req.body?.mode !== "agent") {
      res.status(400).json({
        error: "Geheugenacties toepassen vereist tijdelijke Agent-modus.",
      });
      return;
    }
    const rawActions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    const executedMemoryActions = [];
    const corpusCreatedPaths = [];
    const errors = [];
    for (const raw of rawActions.slice(0, 20)) {
      const action = normalizeMemoryAction(raw, raw?.kind);
      if (!action) {
        errors.push({ error: "Ongeldige geheugenactie." });
        continue;
      }
      if (action.kind === "delete_suggestion") {
        errors.push({
          id: action.id,
          path: action.path,
          error: "Documenten verwijderen is niet toegestaan; verwijderadvies is niet uitvoerbaar.",
        });
        continue;
      }
      const result = await executeMemoryAction(action, runId);
      if (result.ok && result.executed) {
        executedMemoryActions.push(result.action || action);
        if (action.kind === "create" && result.path) corpusCreatedPaths.push(result.path);
      } else if (!result.ok) {
        errors.push({ id: action.id, path: action.path, error: result.error || "Geheugenactie mislukt." });
      }
    }
    res.json({
      ok: errors.length === 0,
      executedMemoryActions,
      corpusCreatedPaths,
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent/memory-actions/revert", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    if (req.body?.mode !== "agent") {
      res.status(400).json({
        error: "Geheugenacties terugdraaien vereist tijdelijke Agent-modus.",
      });
      return;
    }
    const rawActions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    const revertedMemoryActions = [];
    const errors = [];
    for (const raw of rawActions.slice(0, 20)) {
      const result = await revertExecutedMemoryAction(raw, runId);
      if (result.ok && result.reverted) {
        revertedMemoryActions.push(result.action);
      } else {
        errors.push({
          id: typeof raw?.id === "string" ? raw.id : undefined,
          path: typeof raw?.path === "string" ? raw.path : undefined,
          error: result.error || "Geheugenactie terugdraaien mislukt.",
        });
      }
    }
    res.json({
      ok: errors.length === 0,
      revertedMemoryActions,
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/agent/logs", (req, res) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, Math.floor(raw))) : 200;
    res.json({
      ok: true,
      entries: agentLogBuffer.slice(-limit),
      total: agentLogBuffer.length,
      max: AGENT_LOG_MAX,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/agent/logs", (_req, res) => {
  try {
    const cleared = agentLogBuffer.length;
    agentLogBuffer.length = 0;
    res.json({ ok: true, cleared });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/agent/activity-logs", (req, res) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(1000, Math.max(1, Math.floor(raw))) : 200;
    res.json({
      ok: true,
      path: AGENT_ACTIVITY_LOGS_PATH,
      entries: readAgentActivityLogs(limit),
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/agent/chats", (_req, res) => {
  try {
    res.json({ ok: true, ...readAgentChatsPayload() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent/chats", (req, res) => {
  try {
    const payload = readAgentChatsPayload();
    const session = defaultAgentChatSession(req.body?.title, req.body?.messages);
    payload.sessions.unshift(session);
    payload.activeChatId = session.id;
    const saved = writeAgentChatsPayload(payload);
    res.json({ ok: true, session, ...saved });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.patch("/api/agent/chats/:id", (req, res) => {
  try {
    const id = safeAgentChatId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid chat id" });
      return;
    }
    const saved = upsertAgentChatSession(id, req.body ?? {});
    if (!saved) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json({ ok: true, ...saved });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/agent/chats/:id", (req, res) => {
  try {
    const id = safeAgentChatId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid chat id" });
      return;
    }
    const payload = readAgentChatsPayload();
    const nextSessions = payload.sessions.filter((s) => s.id !== id);
    if (nextSessions.length === payload.sessions.length) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    if (nextSessions.length === 0) nextSessions.push(defaultAgentChatSession());
    const activeChatId = payload.activeChatId === id ? nextSessions[0].id : payload.activeChatId;
    const saved = writeAgentChatsPayload({ version: 1, activeChatId, sessions: nextSessions });
    res.json({ ok: true, ...saved });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/api/chats/:id/promote", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const id = safeAgentChatId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid chat id" });
      return;
    }
    const result = await promoteAgentChatSession(id, runId);
    if (!result.ok) {
      res.status(result.error === "Chat not found" ? 404 : 400).json({ error: result.error || "Promotie mislukt" });
      return;
    }
    res.json({
      ok: true,
      activeChatId: result.payload.activeChatId,
      sessions: result.payload.sessions,
      executedMemoryActions: result.executedMemoryActions,
      pendingMemoryActions: result.pendingMemoryActions,
      corpusCreatedPaths: result.corpusCreatedPaths,
      consolidation: result.consolidation,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/chats/promote-stale", async (_req, res) => {
  const runId = crypto.randomUUID();
  try {
    const payload = readAgentChatsPayload();
    const stale = payload.sessions.filter((s) => s.lifecycleStatus === "stale").slice(0, 8);
    const executedMemoryActions = [];
    const corpusCreatedPaths = [];
    const errors = [];
    for (const session of stale) {
      const result = await promoteAgentChatSession(session.id, runId);
      if (result.ok) {
        executedMemoryActions.push(...(result.executedMemoryActions || []));
        corpusCreatedPaths.push(...(result.corpusCreatedPaths || []));
        if (result.consolidation && !result.consolidation.ok && !result.consolidation.skipped) {
          errors.push({ id: session.id, error: `Structureren van memory mislukt: ${result.consolidation.error || "onbekend"}` });
        }
      } else {
        errors.push({ id: session.id, error: result.error || "Promotie mislukt" });
      }
    }
    const saved = readAgentChatsPayload();
    res.json({
      ok: errors.length === 0,
      activeChatId: saved.activeChatId,
      sessions: saved.sessions,
      executedMemoryActions,
      corpusCreatedPaths,
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/memory/index", (_req, res) => {
  try {
    ensureMemoryRoot();
    const files = readDirMemoryMarkdown();
    const fileDetails = readMemoryFileDetails();
    res.json({
      ok: true,
      root: memoryRootRelativePath(),
      files,
      fileDetails,
      directory: MEMORY_DIR,
      manifest: defaultMemoryManifest(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/memory/file", (req, res) => {
  const name = safeMemoryMarkdownPath(req.query.name);
  const full = name ? memoryFullPath(name) : null;
  if (!name || !full) {
    res.status(400).json({ error: "Invalid or missing memory file name" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ name, displayName: memoryRootRelativePath(name), content: fs.readFileSync(full, "utf8") });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/memory/action", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const rawActions = Array.isArray(req.body?.actions) ? req.body.actions : req.body?.action ? [req.body.action] : [];
    const executedMemoryActions = [];
    const corpusCreatedPaths = [];
    const errors = [];
    for (const raw of rawActions) {
      const result = await executeMemoryAction(raw, runId);
      if (result.ok && result.executed && result.action) {
        executedMemoryActions.push(result.action);
        if (result.kind === "create" && result.path) corpusCreatedPaths.push(result.path);
      } else if (!result.ok) {
        errors.push({ id: raw?.id, path: raw?.path, error: result.error || "Memory action failed" });
      }
    }
    res.json({ ok: errors.length === 0, executedMemoryActions, corpusCreatedPaths, errors });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/memory/consolidate-promotions", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const explicitPaths = Array.isArray(req.body?.paths)
      ? req.body.paths.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim())
      : [];
    const paths = explicitPaths.length ? explicitPaths : listChatPromotionMemoryPaths();
    const limit = Math.min(20, Math.max(1, Number(req.body?.limit || paths.length) || paths.length));
    const executedMemoryActions = [];
    const pendingMemoryActions = [];
    const corpusCreatedPaths = [];
    const results = [];
    const errors = [];
    for (const promotionPath of paths.slice(0, limit)) {
      const result = await consolidateExistingChatPromotion(promotionPath, runId);
      results.push({
        path: result.path || promotionPath,
        ok: result.ok === true,
        skipped: result.skipped === true,
        error: result.error,
      });
      if (Array.isArray(result.executedMemoryActions)) executedMemoryActions.push(...result.executedMemoryActions);
      if (Array.isArray(result.pendingMemoryActions)) pendingMemoryActions.push(...result.pendingMemoryActions);
      if (Array.isArray(result.corpusCreatedPaths)) corpusCreatedPaths.push(...result.corpusCreatedPaths);
      if (!result.ok && !result.skipped) errors.push({ path: result.path || promotionPath, error: result.error || "Consolidatie mislukt" });
    }
    res.json({
      ok: errors.length === 0,
      results,
      executedMemoryActions,
      pendingMemoryActions,
      corpusCreatedPaths,
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/markdown-files", (_req, res) => {
  try {
    const files = readDirMarkdown();
    const fileDetails = readMarkdownFileDetails();
    res.json({
      files,
      folders: readDirFolders(),
      fileDetails,
      directory: MARKDOWN_DIR,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/markdown-file", (req, res) => {
  const name = safeMarkdownPath(req.query.name);
  const full = name ? markdownFullPath(name) : null;
  if (!name || !full) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const content = fs.readFileSync(full, "utf8");
    res.json({ name, content });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/markdown-file", (req, res) => {
  const name = safeMarkdownPath(req.body?.name);
  const full = name ? markdownFullPath(name) : null;
  if (!name || !full) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const { content } = req.body ?? {};
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }
  try {
    if (fs.existsSync(full)) {
      const prev = fs.readFileSync(full, "utf8");
      const bak = markdownBackupPath(name);
      if (bak) {
        ensureParentDir(bak);
        fs.writeFileSync(bak, prev, "utf8");
      }
    }
    ensureParentDir(full);
    fs.writeFileSync(full, content, "utf8");
    scheduleCorpusRebuildAfterSave();
    res.json({ ok: true, name });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/corpus-index/rebuild", async (_req, res) => {
  try {
    const m = await runCorpusIndexRebuild("manual");
    if (!m) {
      res.status(500).json({ error: "Corpus-index kon niet worden opgebouwd." });
      return;
    }
    res.json({
      ok: true,
      entryCount: m.working.entryCount,
      memoryEntryCount: m.memory.entryCount,
      generatedAt: m.working.generatedAt,
      memoryGeneratedAt: m.memory.generatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/markdown-folder", (req, res) => {
  const folder = safeFolderPath(req.body?.folder);
  if (folder === null) {
    res.status(400).json({ error: "Invalid folder path" });
    return;
  }
  const resolvedDir = path.resolve(MARKDOWN_DIR);
  const full = path.resolve(resolvedDir, folder);
  const rel = path.relative(resolvedDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.status(400).json({ error: "Path not allowed" });
    return;
  }
  try {
    fs.mkdirSync(full, { recursive: true });
    res.json({ ok: true, folder });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Verwijdert alleen een lege map (geen bestanden, geen submappen). */
app.delete("/api/markdown-folder", (req, res) => {
  const folder = safeFolderPath(req.query?.folder);
  if (folder === null || folder === "") {
    res.status(400).json({ error: "Geef een geldige map op (niet de root)" });
    return;
  }
  const full = folderFullPath(folder);
  if (!full) {
    res.status(400).json({ error: "Path not allowed" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Map bestaat niet" });
      return;
    }
    if (!fs.statSync(full).isDirectory()) {
      res.status(400).json({ error: "Geen map" });
      return;
    }
    const entries = fs.readdirSync(full);
    if (entries.length > 0) {
      res.status(400).json({ error: "Map is niet leeg — verwijder eerst inhoud" });
      return;
    }
    fs.rmdirSync(full);
    res.json({ ok: true, folder });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Hernoemt of verplaatst een .md-bestand; verhuist review-JSON en backup mee indien aanwezig. */
app.post("/api/markdown-rename", (req, res) => {
  const from = safeMarkdownPath(req.body?.from);
  const to = safeMarkdownPath(req.body?.to);
  if (!from || !to) {
    res.status(400).json({ error: "from en to moeten geldige markdown-paden zijn" });
    return;
  }
  const fromFull = markdownFullPath(from);
  const toFull = markdownFullPath(to);
  if (!fromFull || !toFull) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    if (!fs.existsSync(fromFull)) {
      res.status(404).json({ error: "Bronbestand niet gevonden" });
      return;
    }
    if (fs.existsSync(toFull)) {
      res.status(409).json({ error: "Doelbestand bestaat al" });
      return;
    }
    ensureParentDir(toFull);
    fs.renameSync(fromFull, toFull);

    const fromReview = reviewJsonPath(from);
    const toReview = reviewJsonPath(to);
    if (fromReview && toReview && fs.existsSync(fromReview)) {
      ensureParentDir(toReview);
      if (fs.existsSync(toReview)) fs.unlinkSync(toReview);
      fs.renameSync(fromReview, toReview);
    }

    const fromBak = markdownBackupPath(from);
    const toBak = markdownBackupPath(to);
    if (fromBak && toBak && fs.existsSync(fromBak)) {
      ensureParentDir(toBak);
      if (fs.existsSync(toBak)) fs.unlinkSync(toBak);
      fs.renameSync(fromBak, toBak);
    }

    res.json({ ok: true, from, to });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Legt huidige schijf-inhoud vast als rollback (bijv. door agent vóór handmatige .md-wijziging). */
app.post("/api/markdown-backup-current", (req, res) => {
  const name = safeMarkdownPath(req.body?.name);
  const full = name ? markdownFullPath(name) : null;
  if (!name || !full) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const bak = markdownBackupPath(name);
  if (!bak) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Markdown not found" });
      return;
    }
    const prev = fs.readFileSync(full, "utf8");
    ensureParentDir(bak);
    fs.writeFileSync(bak, prev, "utf8");
    res.json({ ok: true, name });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/markdown-revert-available", (req, res) => {
  const name = safeMarkdownPath(req.query.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const bak = markdownBackupPath(name);
  if (!bak) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    res.json({ name, available: fs.existsSync(bak) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/markdown-backup-file", (req, res) => {
  const name = safeMarkdownPath(req.query.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const bak = markdownBackupPath(name);
  if (!bak) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    if (!fs.existsSync(bak)) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    const content = fs.readFileSync(bak, "utf8");
    res.json({ name, content });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Zet .md terug naar de laatst opgeslagen backup en verwijdert die backup. */
app.post("/api/markdown-revert-last", (req, res) => {
  const name = safeMarkdownPath(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const externalRevert = req.body?.external === true;
  const full = externalRevert ? null : markdownFullPath(name);
  if (!externalRevert && !full) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  if (externalRevert && !name.startsWith("_mv_external/")) {
    res.status(400).json({ error: "Externe terugzetactie vereist een _mv_external/… sessiepad." });
    return;
  }
  const bak = markdownBackupPath(name);
  if (!bak) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    if (!fs.existsSync(bak)) {
      res.status(404).json({
        error:
          "Geen vorige versie op schijf. Maak eerst een backup (opslaan in de viewer, of POST /api/markdown-backup-current vóór de wijziging).",
      });
      return;
    }
    const restored = fs.readFileSync(bak, "utf8");
    fs.unlinkSync(bak);
    if (full) {
      fs.writeFileSync(full, restored, "utf8");
    }
    res.json({ ok: true, name, content: restored });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/templates", (_req, res) => {
  try {
    res.json({ files: readDirTemplates(), directory: TEMPLATES_DIR });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/template", (req, res) => {
  const name = safeTemplateName(req.query.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing template name" });
    return;
  }
  const resolvedDir = path.resolve(TEMPLATES_DIR);
  const full = path.resolve(resolvedDir, name);
  if (!full.startsWith(resolvedDir + path.sep) && full !== resolvedDir) {
    res.status(400).json({ error: "Path not allowed" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const raw = fs.readFileSync(full, "utf8");
    const json = JSON.parse(raw);
    res.json({ name, template: json });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/api/docx/templates", async (_req, res) => {
  try {
    if (DOCX_EXPORT_URL) {
      const { templates, directory } = await fetchDocxTemplatesFromService();
      res.json({
        templates,
        directory,
        llm2docxRoot: LLM2DOCX_ROOT,
        mode: DOCX_USE_PORTAL ? "portal" : "docker",
        docxServiceUrl: DOCX_EXPORT_URL,
      });
      return;
    }
    if (!fs.existsSync(DOCX_TEMPLATES_DIR)) {
      res.json({
        templates: [],
        directory: DOCX_TEMPLATES_DIR,
        llm2docxRoot: LLM2DOCX_ROOT,
        hint:
          "Templatesmap bestaat nog niet. Zet DOCX_EXPORT_URL (portaal :8080 met DOCX_EXPORT_STYLE=portal, of docx-export :8790), of configureer LLM2DOCX_ROOT / DOCX_TEMPLATES_DIR.",
      });
      return;
    }
    const names = fs
      .readdirSync(DOCX_TEMPLATES_DIR)
      .filter((n) => {
        if (!n.endsWith(".docx") || n.startsWith("~$")) return false;
        try {
          return fs.statSync(path.join(DOCX_TEMPLATES_DIR, n)).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b));
    res.json({
      templates: names,
      directory: DOCX_TEMPLATES_DIR,
      llm2docxRoot: LLM2DOCX_ROOT,
      mode: "local",
    });
  } catch (e) {
    const errMsg = String(e?.message || e);
    const unreachable = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|fetch failed|network|timeout|abort|not reachable/i.test(
      errMsg,
    );
    const suggestion = unreachable
      ? `Start het LLM2DOCX-portaal (bijv. op ${DOCX_EXPORT_URL}), of zet DOCX_EXPORT_URL tijdelijk leeg in .env en herstart de API om alleen lokale templates / Python-export te gebruiken.`
      : undefined;
    res.status(502).json({
      error: errMsg,
      docxServiceUrl: DOCX_EXPORT_URL || undefined,
      ...(suggestion ? { suggestion } : {}),
    });
  }
});

app.get("/api/docx/template-placeholders", async (req, res) => {
  const rawQ = req.query?.name ?? req.query?.template_name;
  const q = Array.isArray(rawQ) ? rawQ[0] : rawQ;
  const templateName = safeDocxTemplateName(typeof q === "string" ? q : "");
  if (!templateName) {
    res.status(400).json({ error: "Ongeldige of ontbrekende name (gebruik ?name=Jouwtemplate.docx)", placeholders: [] });
    return;
  }
  try {
    if (DOCX_EXPORT_URL) {
      const enc = encodeURIComponent(templateName);
      const url = `${DOCX_EXPORT_URL}/api/templates/${enc}/placeholders`;
      /** @type {Response} */
      let r;
      try {
        r = await fetch(url, {
          headers: docxExportAuthHeaders(),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        const b = String(/** @type {any} */ (e)?.message || e);
        throw new Error(`Word-export service niet bereikbaar (${url}). ${b}`);
      }
      if (r.status === 401) {
        res.status(401).json({
          error: DOCX_USE_PORTAL
            ? "LLM2DOCX-portaal: 401 — controleer DOCX_EXPORT_TOKEN."
            : "DOCX-export service: 401 — controleer DOCX_EXPORT_TOKEN.",
          placeholders: [],
        });
        return;
      }
      if (r.status === 404) {
        res.json({
          template_name: templateName,
          placeholders: [],
          hint: "Geen template of (nog) geen /placeholders op de DOCX-service. Update LLM2DOCX / herbouw de docx-export container.",
        });
        return;
      }
      if (!r.ok) {
        res.status(502).json({ error: await readDocxServiceJsonError(r), placeholders: [] });
        return;
      }
      const data = /** @type {any} */ (await r.json());
      const ph = Array.isArray(data.placeholders) ? data.placeholders : [];
      res.json({ template_name: data.template_name || templateName, placeholders: ph });
      return;
    }
    const tplFull = path.join(DOCX_TEMPLATES_DIR, templateName);
    if (!fs.existsSync(tplFull)) {
      res.status(404).json({ error: `Template niet gevonden: ${templateName}`, placeholders: [] });
      return;
    }
    const placeholders = await collectJinjaPlaceholderNamesFromDocxPath(tplFull);
    res.json({ template_name: templateName, placeholders });
  } catch (e) {
    res.status(500).json({ error: String(/** @type {any} */ (e)?.message || e), placeholders: [] });
  }
});

app.post("/api/docx/export", async (req, res) => {
  const markdownRaw = req.body?.markdown_content;
  if (typeof markdownRaw !== "string") {
    res.status(400).json({ error: "markdown_content is verplicht (string)" });
    return;
  }
  const templateName = safeDocxTemplateName(req.body?.template_name);
  if (!templateName) {
    res.status(400).json({
      error: "Ongeldige template_name: alleen een bestandsnaam zoals Huisstijl.docx (letters, cijfers, . _ - spatie).",
    });
    return;
  }
  const meta = coerceMetadataDict(req.body?.metadata_dict);
  const fallbackDl = "export.docx";
  const rawDl = req.body?.download_name;
  const downloadName = safeDocxDownloadName(typeof rawDl === "string" ? rawDl : null, fallbackDl);

  if (DOCX_EXPORT_URL) {
    try {
      const data = await runDocxExportHttp({
        markdown_content: markdownRaw,
        template_name: templateName,
        metadata_dict: meta,
        download_name: downloadName,
      });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.send(data);
    } catch (e) {
      const msg = String(e?.message || e);
      const isConn =
        /fetch failed|ECONNREFUSED|ENOTFOUND|network|socket|UND_ERR_SOCKET/i.test(msg) ||
        msg.includes("DOCX-export service");
      res.status(isConn ? 503 : 400).json({ error: msg });
    }
    return;
  }

  const tplFull = path.join(DOCX_TEMPLATES_DIR, templateName);
  if (!fs.existsSync(tplFull)) {
    res.status(404).json({
      error: `Template niet gevonden: ${templateName} (map ${DOCX_TEMPLATES_DIR})`,
    });
    return;
  }
  const outFn = `export_${randomUUID().replace(/-/g, "")}.docx`;
  try {
    ensureDocxOutputDir();
    const outPath = await runDocxExportBridge({
      markdown_content: markdownRaw,
      template_name: templateName,
      metadata_dict: meta,
      output_filename: outFn,
    });
    if (!outPath || !fs.existsSync(outPath)) {
      res.status(500).json({ error: "Exportbestand ontstond niet op schijf." });
      return;
    }
    const data = fs.readFileSync(outPath);
    fs.unlinkSync(outPath);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.send(data);
  } catch (e) {
    const msg = String(e?.message || e);
    const isTooling = /Python start mislukt|DOCX-bridge kon geen JSON/i.test(msg);
    res.status(isTooling ? 503 : 400).json({ error: msg });
  }
});

app.get("/api/review-comments", (req, res) => {
  const name = safeMarkdownPath(req.query.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const full = reviewJsonPath(name);
  if (!full) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  const resolvedReviews = path.resolve(REVIEWS_DIR);
  if (!full.startsWith(resolvedReviews + path.sep) && full !== resolvedReviews) {
    res.status(400).json({ error: "Path not allowed" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.json({ name, comments: [], agentChatUiHistory: [] });
      return;
    }
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw);
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const agentChatUiHistory = trimAgentChatHistory(normalizeAgentChatHistory(data.agentChatUiHistory));
    res.json({ name, comments, agentChatUiHistory });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/review-comments", (req, res) => {
  const name = safeMarkdownPath(req.body?.name);
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  const { comments } = req.body ?? {};
  if (!Array.isArray(comments)) {
    res.status(400).json({ error: "comments must be an array" });
    return;
  }
  const full = reviewJsonPath(name);
  if (!full) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  const resolvedReviews = path.resolve(REVIEWS_DIR);
  if (!full.startsWith(resolvedReviews + path.sep) && full !== resolvedReviews) {
    res.status(400).json({ error: "Path not allowed" });
    return;
  }
  try {
    ensureReviewsDir();
    let preservedHistory = [];
    let preservedUiHistory = [];
    try {
      if (fs.existsSync(full)) {
        const data = JSON.parse(fs.readFileSync(full, "utf8"));
        preservedHistory = trimAgentChatHistory(normalizeAgentChatHistory(data.agentChatHistory));
        preservedUiHistory = trimAgentChatHistory(normalizeAgentChatHistory(data.agentChatUiHistory));
      }
    } catch {
      /* bestaand bestand onleesbaar — start zonder geschiedenis */
    }
    const payload = { version: 1, comments, agentChatHistory: preservedHistory, agentChatUiHistory: preservedUiHistory };
    ensureParentDir(full);
    fs.writeFileSync(full, JSON.stringify(payload, null, 2), "utf8");
    const reviewRelativePath = path.relative(MARKDOWN_DIR, full).split(path.sep).join("/");
    console.log(`[review-comments] wrote ${full}`);
    res.json({ ok: true, name, reviewRelativePath });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent/chat", async (req, res) => {
  const runId = crypto.randomUUID();
  const activityStartedAt = Date.now();
  const mode = req.body?.mode === "ask" ? "ask" : req.body?.mode === "agent" ? "agent" : null;
  if (!mode) {
    agentLog(runId, "chat_bad_request", { reason: "invalid_mode" });
    res.status(400).json({ error: 'mode moet "ask" of "agent" zijn.' });
    return;
  }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    agentLog(runId, "chat_bad_request", { reason: "empty_message" });
    res.status(400).json({ error: "message is verplicht." });
    return;
  }
  const markdown = typeof req.body?.markdown === "string" ? req.body.markdown : "";
  const name =
    typeof req.body?.name === "string" && req.body.name.trim() ? safeMarkdownPath(req.body.name) : null;
  const activityChatId = safeAgentChatId(req.body?.chatId) || "";
  const activityChatTitle = cleanAgentChatTitle(req.body?.chatTitle || "");
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const wantDebug =
    req.body?.debugLlm === true || String(process.env.AGENT_LLM_DEBUG || "").trim() === "1";
  const llmDebug = wantDebug ? {} : null;
  const corpusWide = req.body?.corpusWide === true;
  const webSearch = mode === "ask" && req.body?.webSearch === true;
  const memoryWriteRequest = mode === "ask" && looksLikeCorpusMemoryWriteRequest(message);
  const durableMemorySignal = looksLikeDurableMemorySignal(message);
  const dreamMemoryRequest = looksLikeDreamMemoryRequest(message);
  const activityLogRequest = looksLikeActivityLogRequest(message);
  const useCorpusTools = corpusWide || memoryWriteRequest || (mode === "ask" && (durableMemorySignal || dreamMemoryRequest));
  const askToolMode = useCorpusTools || webSearch || activityLogRequest;
  const activityStream = (corpusWide || webSearch) && req.body?.activityStream !== false;
  const replyMarkdown = req.body?.replyMarkdown !== false;
  const activityBase = (extra = {}) => ({
    runId,
    chatId: activityChatId,
    chatTitle: activityChatTitle,
    mode,
    documentPath: name || "",
    request: truncStr(message, 1000),
    durationMs: Date.now() - activityStartedAt,
    corpusWide,
    webSearch,
    ...extra,
  });

  try {
    const config = readAgentConfig();
    if (!config.apiKey.trim() || !config.endpoint.trim() || !config.model.trim()) {
      agentLog(runId, "chat_config_missing", { mode });
      res.status(400).json({ error: "Agentconfig ontbreekt: vul API key, endpoint en model in." });
      return;
    }

    const virtualSession = !!(name && name.startsWith("_mv_external/"));

    if (mode === "agent" && activityLogRequest) {
      agentLog(runId, "chat_agent_activity_logs_as_ask", { historyLen: history.length });
      const bootstrap = {
        markdownBlob:
          `## Gebruikersvraag\n\n${message}\n\n---\n\n` +
          `## Activity logs\n\nGebruik read_activity_logs om de persistente Ask/Agent activity logs te lezen. Deze logs zijn geen bewerkbare Markdown-documenten.`,
        pickedPaths: [],
      };
      try {
        const result = await callCorpusAskAgentWithTools(
          config,
          bootstrap.markdownBlob,
          history,
          { runId },
          llmDebug,
          null,
          { replyMarkdown, enableCorpusTools: false, enableWebSearch: false, enableActivityLogs: true },
        );
        appendAgentActivityLog(activityBase({
          status: "done",
          reply: truncStr(result.reply, 1000),
          changed: false,
        }));
        res.json({
          reply: result.reply,
          changed: false,
          activities: result.activities,
          ...(llmDebug ? { debugLlm: llmDebug } : {}),
        });
      } catch (e) {
        const msgErr = String(e?.message || e);
        appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
        res.status(500).json({ error: msgErr });
      }
      return;
    }

    if (mode === "ask") {
      if (askToolMode) {
        agentLog(runId, "chat_ask_tools_start", {
          historyLen: history.length,
          activityStream,
          corpusWide,
          webSearch,
          memoryWriteRequest,
          durableMemorySignal,
          dreamMemoryRequest,
        });
        if (webSearch && !TAVILY_API_KEY) {
          res.status(400).json({
            error:
              "Tavily API key ontbreekt. Zet TAVILY_API_KEY in markdown-viewer/.env of .env.local en herstart de server.",
          });
          return;
        }
        let bootstrap;
        let memoryTargetPath = "";
        if (useCorpusTools) {
          let workingManifest = readManifest(MARKDOWN_DIR, { scope: "working" });
          let memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
          if (!workingManifest?.entries?.length || !memoryManifest) {
            try {
              const rebuilt = await runCorpusIndexRebuild("ask_bootstrap_missing_index");
              if (!rebuilt) throw new Error("Rebuild gaf geen resultaat.");
              workingManifest = rebuilt.working;
              memoryManifest = rebuilt.memory;
            } catch (e) {
              agentLog(runId, "chat_ask_corpus_rebuild_failed", { error: String(e?.message || e) });
              res.status(500).json({ error: `Corpus-index kon niet worden opgebouwd: ${String(e?.message || e)}` });
              return;
            }
          }
          memoryTargetPath = memoryWriteRequest
            ? pickMemoryTargetPath(message, memoryManifest, "")
            : durableMemorySignal
              ? pickMemoryTargetPath(message, memoryManifest, inferDurableMemoryTargetPath(message))
              : "";
          const workingBootstrap = buildCorpusAskContext(MARKDOWN_DIR, workingManifest, message, {
            includeFragments: false,
          });
          const memoryBootstrap = buildCorpusAskContext(MARKDOWN_DIR, memoryManifest, message, {
            includeFragments: false,
            sourceRootDir: MEMORY_DIR,
            indexDir: MEMORY_INDEX_DIR,
          });
          bootstrap = {
            markdownBlob:
              `## Gebruikersvraag\n\n${message}\n\n---\n\n` +
              `## Werkdocument-context\n\n` +
              `Dit zijn user-owned werkdocumenten onder Files/. Gebruik ze als bron/content, niet als long-term memory.\n\n` +
              workingBootstrap.markdownBlob +
              `\n\n---\n\n` +
              `## Long-term memory-context\n\n` +
              `Dit is agent-owned long-term memory onder Files/.memory/. Create/update-tools schrijven uitsluitend hier.\n\n` +
              memoryBootstrap.markdownBlob +
              `\n\n---\n\n` +
              `## Actieve chat short-term memory\n\n` +
              `Alleen de meegestuurde actieve chatgeschiedenis is short-term memory. Andere chats mogen niet als live context worden gebruikt.`,
            pickedPaths: [
              ...workingBootstrap.pickedPaths.map((p) => `working:${p}`),
              ...memoryBootstrap.pickedPaths.map((p) => `memory:${p}`),
            ],
          };
          if (memoryWriteRequest && memoryTargetPath) {
            bootstrap.markdownBlob +=
              `\n\n---\n\n## Verplicht geheugenvoorstel\n\n` +
              `Dit bericht is herkend als een verzoek om long-term memory bij te werken. ` +
              `Doelbestand onder Files/.memory/: \`${memoryTargetPath}\`.\n\n` +
              `Lees dit doelbestand met read_memory_markdown en maak daarna een update_corpus_markdown-actie ` +
              `met een exacte unieke find/replace. Geef niet alleen een tekst om zelf te plakken.`;
            if (!bootstrap.pickedPaths.includes(`memory:${memoryTargetPath}`)) {
              bootstrap.pickedPaths.unshift(`memory:${memoryTargetPath}`);
            }
          }
          if (durableMemorySignal && !memoryWriteRequest) {
            bootstrap.markdownBlob +=
              `\n\n---\n\n## Duurzaam memory-signaal herkend\n\n` +
              `Dit bericht lijkt duurzame persoonlijke context, voorkeuren, werkwijze of terugkerende verwachting te bevatten. ` +
              `Bepaal autonoom of dit in long-term memory hoort. Als dat zo is, voer direct één of meerdere memory-acties uit onder Files/.memory/.\n\n` +
              `Richtlijnen:\n` +
              `- Voorkeuren, antwoordstijl en werkwijze horen meestal onder \`voorkeuren/\` of \`werkwijzen/\`.\n` +
              `- Persoonlijke context over Joost of relaties hoort meestal onder \`personen/\`.\n` +
              `- Project- of klantcontext hoort meestal onder \`project-context/\`.\n` +
              `- Als een passend memory-document al bestaat, lees het eerst met read_memory_markdown en werk het bij.\n` +
              `- Als er nog geen passend document bestaat, maak er zelfstandig een aan.\n` +
              `- Geef geen aparte gebruikersmelding over de memory-mutatie.`;
          }
          if (dreamMemoryRequest) {
            bootstrap.markdownBlob +=
              `\n\n---\n\n## Droomverzoek herkend\n\n` +
              `De gebruiker vraagt dat het systeem gaat dromen. Behandel dit als opdracht om long-term memory bij te werken op basis van de actieve chat en, wanneer aanwezig, het geopende bestand. ` +
              `Bepaal autonoom welke bestaande memory-documenten moeten worden bijgewerkt of welke nieuwe memory-documenten nodig zijn. Geef geen aparte housekeeping-melding over memory-mutaties.`;
            if (markdown) {
              bootstrap.markdownBlob +=
                `\n\n## Geopend bestand bij droomverzoek\n\n` +
                `Pad: ${name || "(geen pad meegestuurd)"}\n\n` +
                `${markdown.slice(0, 24000)}`;
            }
          }
        } else {
          bootstrap = {
            markdownBlob:
              `## Gebruikersvraag\n\n${message}\n\n---\n\n` +
              `## Huidig Markdown-document (alleen ter referentie)\n\n${markdown || "(geen geopend document of lege inhoud)"}`,
            pickedPaths: [],
          };
        }
        agentLog(runId, "chat_ask_tools_bootstrap", {
          markdownChars: bootstrap.markdownBlob.length,
          pickedPaths: bootstrap.pickedPaths.slice(0, 40),
          pickedCount: bootstrap.pickedPaths.length,
          corpusWide,
          webSearch,
          memoryWriteRequest,
          durableMemorySignal,
          dreamMemoryRequest,
        });

        const ensureMemoryProposalFallback = async (result) => {
          if (
            (!memoryWriteRequest && !durableMemorySignal && !dreamMemoryRequest) ||
            (Array.isArray(result.executedMemoryActions) && result.executedMemoryActions.length) ||
            (Array.isArray(result.pendingMemoryActions) && result.pendingMemoryActions.length)
          ) {
            return result;
          }
          const pickedMemoryPath = (bootstrap.pickedPaths || [])
            .map((p) => String(p || ""))
            .find((p) => p.startsWith("memory:"))
            ?.replace(/^memory:/, "");
          const targetPath = memoryTargetPath || pickedMemoryPath || "";
          const targetPayload = readMemoryMarkdownToolPayload(targetPath);
          if (!targetPayload.ok || typeof targetPayload.content !== "string") {
            agentLog(runId, "memory_fallback_skipped", {
              targetPath,
              error: targetPayload.error || "Doelbestand kon niet worden gelezen.",
            });
            return result;
          }
          const fallback = await callMemoryProposalAgent(
            config,
            targetPath,
            targetPayload.content,
            message,
            history,
            { runId },
            llmDebug,
            { replyMarkdown },
          );
          if (!fallback.pendingMemoryActions.length) return result;
          const executed = [];
          const stillPending = [];
          const createdPaths = [];
          for (const action of fallback.pendingMemoryActions) {
            const applied = await executeMemoryAction(action, runId);
            if (applied.ok && applied.executed && applied.action) {
              executed.push(applied.action);
              if (applied.kind === "create" && applied.path) createdPaths.push(applied.path);
            } else if (applied.action) {
              stillPending.push(applied.action);
            }
          }
          if (!executed.length && !stillPending.length) return result;
          return {
            ...result,
            reply: stripMemoryHousekeepingFromReply(
              fallback.reply || result.reply || ensureMemoryActionQuestion(result.reply, stillPending),
              executed,
            ),
            executedMemoryActions: [
              ...(Array.isArray(result.executedMemoryActions) ? result.executedMemoryActions : []),
              ...executed,
            ],
            pendingMemoryActions: [
              ...(Array.isArray(result.pendingMemoryActions) ? result.pendingMemoryActions : []),
              ...stillPending,
            ],
            corpusCreatedPaths: [
              ...(Array.isArray(result.corpusCreatedPaths) ? result.corpusCreatedPaths : []),
              ...createdPaths,
            ],
            activities: [
              ...(Array.isArray(result.activities) ? result.activities : []),
            ],
          };
        };

        if (activityStream) {
          res.status(200);
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("X-Accel-Buffering", "no");
          let streamedReplyChars = 0;
          try {
            let result = await callCorpusAskAgentWithTools(
              config,
              bootstrap.markdownBlob,
              history,
              { runId },
              llmDebug,
              (payload) => {
                res.write(`${JSON.stringify(payload)}\n`);
              },
              {
                replyMarkdown,
                enableCorpusTools: useCorpusTools,
                enableWebSearch: webSearch,
                enableActivityLogs: activityLogRequest,
                enableMemoryWriteTools: memoryWriteRequest || durableMemorySignal || dreamMemoryRequest,
              },
            );
            result = await ensureMemoryProposalFallback(result);
            streamedReplyChars = result.reply.length;
            queueAgentInstructionsUpdate(config, {
              runId,
              mode: "ask",
              userContent: message,
              assistantContent: result.reply,
            });
            appendAgentActivityLog(activityBase({
              status: "done",
              reply: truncStr(result.reply, 1000),
              changed: false,
              memoryActionCount: Array.isArray(result.executedMemoryActions) ? result.executedMemoryActions.length : 0,
              corpusCreatedPaths: Array.isArray(result.corpusCreatedPaths) ? result.corpusCreatedPaths : [],
            }));
            res.write(
              `${JSON.stringify({
                type: "done",
                reply: result.reply,
                changed: false,
                ...(Array.isArray(result.viewerActions) && result.viewerActions.length
                  ? { viewerActions: result.viewerActions }
                  : {}),
                ...(Array.isArray(result.corpusCreatedPaths) && result.corpusCreatedPaths.length
                  ? { corpusCreatedPaths: result.corpusCreatedPaths }
                  : {}),
                ...(Array.isArray(result.executedMemoryActions) && result.executedMemoryActions.length
                  ? { executedMemoryActions: result.executedMemoryActions }
                  : {}),
                ...(Array.isArray(result.pendingMemoryActions) && result.pendingMemoryActions.length
                  ? { pendingMemoryActions: result.pendingMemoryActions }
                  : {}),
                ...(llmDebug ? { debugLlm: llmDebug } : {}),
              })}\n`,
            );
          } catch (e) {
            const msgErr = String(e?.message || e);
            agentLog(runId, "chat_ask_corpus_stream_error", { error: msgErr });
            appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
            res.write(`${JSON.stringify({ type: "error", error: msgErr })}\n`);
          }
          res.end();
          agentLog(runId, "chat_ask_done", {
            replyChars: streamedReplyChars,
            corpusWide,
            webSearch,
            memoryWriteRequest,
            durableMemorySignal,
            dreamMemoryRequest,
            streamed: true,
          });
          return;
        }

        try {
          let result = await callCorpusAskAgentWithTools(
            config,
            bootstrap.markdownBlob,
            history,
            { runId },
            llmDebug,
            null,
            {
              replyMarkdown,
              enableCorpusTools: useCorpusTools,
              enableWebSearch: webSearch,
              enableActivityLogs: activityLogRequest,
              enableMemoryWriteTools: memoryWriteRequest || durableMemorySignal || dreamMemoryRequest,
            },
          );
          result = await ensureMemoryProposalFallback(result);
          queueAgentInstructionsUpdate(config, {
            runId,
            mode: "ask",
            userContent: message,
            assistantContent: result.reply,
          });
          appendAgentActivityLog(activityBase({
            status: "done",
            reply: truncStr(result.reply, 1000),
            changed: false,
            memoryActionCount: Array.isArray(result.executedMemoryActions) ? result.executedMemoryActions.length : 0,
            corpusCreatedPaths: Array.isArray(result.corpusCreatedPaths) ? result.corpusCreatedPaths : [],
          }));
          agentLog(runId, "chat_ask_done", {
            replyChars: result.reply.length,
            corpusWide,
            webSearch,
            memoryWriteRequest,
            durableMemorySignal,
            dreamMemoryRequest,
            streamed: false,
          });
          res.json({
            reply: result.reply,
            changed: false,
            activities: result.activities,
            ...(Array.isArray(result.viewerActions) && result.viewerActions.length
              ? { viewerActions: result.viewerActions }
              : {}),
            ...(Array.isArray(result.corpusCreatedPaths) && result.corpusCreatedPaths.length
              ? { corpusCreatedPaths: result.corpusCreatedPaths }
              : {}),
            ...(Array.isArray(result.executedMemoryActions) && result.executedMemoryActions.length
              ? { executedMemoryActions: result.executedMemoryActions }
              : {}),
            ...(Array.isArray(result.pendingMemoryActions) && result.pendingMemoryActions.length
              ? { pendingMemoryActions: result.pendingMemoryActions }
              : {}),
            ...(llmDebug ? { debugLlm: llmDebug } : {}),
          });
        } catch (e) {
          agentLog(runId, "chat_ask_corpus_error", { error: String(e?.message || e) });
          appendAgentActivityLog(activityBase({ status: "error", error: String(e?.message || e) }));
          res.status(500).json({ error: String(e?.message || e) });
        }
        return;
      }

      agentLog(runId, "chat_ask_start", { markdownChars: markdown.length, historyLen: history.length });
      const askResult = await callAskAgent(config, markdown, message, history, { runId }, llmDebug, {
        replyMarkdown,
        currentPath: name,
      });
      const normalAskExecutedMemoryActions = [];
      const normalAskPendingMemoryActions = [];
      const normalAskCorpusCreatedPaths = [];
      for (const action of askResult.pendingMemoryActions || []) {
        if (action.kind === "delete_suggestion") {
          normalAskPendingMemoryActions.push(action);
          continue;
        }
        const applied = await executeMemoryAction(action, runId);
        if (applied.ok && applied.executed && applied.action) {
          normalAskExecutedMemoryActions.push(applied.action);
          if (applied.kind === "create" && applied.path) normalAskCorpusCreatedPaths.push(applied.path);
        } else if (applied.action) {
          normalAskPendingMemoryActions.push(applied.action);
        }
      }
      let reply = ensureMemoryAppliedNotice(askResult.reply, normalAskExecutedMemoryActions);
      reply = stripMemoryHousekeepingFromReply(reply, normalAskExecutedMemoryActions);
      queueAgentInstructionsUpdate(config, {
        runId,
        mode: "ask",
        userContent: message,
        assistantContent: reply,
      });
      appendAgentActivityLog(activityBase({
        status: "done",
        reply: truncStr(reply, 1000),
        changed: false,
        memoryActionCount: normalAskExecutedMemoryActions.length,
        corpusCreatedPaths: normalAskCorpusCreatedPaths,
      }));
      agentLog(runId, "chat_ask_done", { replyChars: reply.length });
      res.json({
        reply,
        changed: false,
        executedMemoryActions: normalAskExecutedMemoryActions,
        corpusCreatedPaths: normalAskCorpusCreatedPaths,
        pendingMemoryActions: normalAskPendingMemoryActions,
        ...(llmDebug ? { debugLlm: llmDebug } : {}),
      });
      return;
    }

    if (!name) {
      agentLog(runId, "chat_bad_request", { reason: "agent_missing_name" });
      res.status(400).json({
        error:
          'Voor agent-modus is het documentpad (name) verplicht, bijvoorbeeld "map/bestand.md" of een _mv_external/… sessiepad.',
      });
      return;
    }

    const { comments } = readReviewPayload(name);
    const pending = pendingAgentReviewComments(comments);
    if (pending.length > 0) {
      agentLog(runId, "chat_conflict_pending", { document: name, pending: pending.length });
      res.status(409).json({
        error:
          "Er staan nog agentwijzigingen open uit de review. Keur die eerst goed of af voordat je de chat-agent het document laat aanpassen.",
        pending: pending.length,
      });
      return;
    }

    if (!virtualSession) {
      const pathFull = markdownFullPath(name);
      if (!pathFull || !fs.existsSync(pathFull)) {
        agentLog(runId, "chat_not_found", { document: name });
        res.status(404).json({ error: "Markdown niet gevonden. Sla het document eerst op in Files/." });
        return;
      }
    }

    const selRaw = req.body?.selection;
    const selectionParts =
      selRaw && typeof selRaw === "object"
        ? {
            quote: typeof selRaw.quote === "string" ? selRaw.quote : "",
            prefix: typeof selRaw.prefix === "string" ? selRaw.prefix : "",
            suffix: typeof selRaw.suffix === "string" ? selRaw.suffix : "",
          }
        : { quote: "", prefix: "", suffix: "" };

    agentLog(runId, "chat_agent_start", { document: name, markdownChars: markdown.length });
    const synthetic = commentForAgentCall({
      id: "chat",
      body: message,
      quote: selectionParts.quote,
      prefix: selectionParts.prefix,
      suffix: selectionParts.suffix,
      replies: [],
    });
    const priorChatForApi = wrapChatHistoryForReviewAgent(history);
    const parsed = await callReviewAgent(
      config,
      markdown,
      synthetic,
      { runId, step: 1, commentId: "chat" },
      priorChatForApi,
      "chat",
      llmDebug,
      replyMarkdown,
    );
    const changesRaw = Array.isArray(parsed?.changes) ? parsed.changes : [];
    let nextMd = markdown;
    let changed = false;
    try {
      nextMd = applyPatchesToMarkdown(markdown, changesRaw, { chatCoerceRunId: runId });
      changed = nextMd !== markdown;
    } catch (e) {
      agentLog(runId, "chat_agent_patch_error", { document: name, error: String(e?.message || e) });
      res.status(422).json({
        error: String(e?.message || e),
        reply: typeof parsed?.reply === "string" ? parsed.reply : "",
        ...(llmDebug ? { debugLlm: llmDebug } : {}),
      });
      return;
    }

    let wroteFile = false;
    if (changed) {
      if (virtualSession) {
        const backupState = { backedUp: false };
        backupExternalMarkdownIfNeeded(name, markdown, backupState);
      } else {
        const pathFull = markdownFullPath(name);
        if (pathFull && fs.existsSync(pathFull)) {
          const backupState = { backedUp: false };
          backupMarkdownIfNeeded(name, pathFull, backupState);
          fs.writeFileSync(pathFull, nextMd, "utf8");
          wroteFile = true;
        }
      }
      try {
        const replyTextRaw = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
        const replyTextForReview =
          replyTextRaw ||
          (changed ? `Toegepast: ${changesRaw.length} patch(es).` : "Geen wijzigingen doorgevoerd.");
        appendAgentChatReviewApprovalThread(
          name,
          message,
          replyTextForReview,
          selectionParts,
          buildAgentHistoryUserSummary(synthetic, markdown),
          buildAgentHistoryAssistantSummary(parsed, null),
        );
      } catch (e) {
        agentLog(runId, "chat_review_thread_error", { document: name, error: String(e?.message || e) });
      }
    }

    agentLog(runId, "chat_agent_done", {
      document: name,
      changed,
      patches: changesRaw.length,
      wroteFile,
    });
    const replyTextRaw = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    const replyText =
      replyTextRaw ||
      (changed ? `Toegepast: ${changesRaw.length} patch(es).` : "Geen wijzigingen doorgevoerd.");
    const historyUserText = buildAgentHistoryUserSummary(synthetic, markdown);
    const historyAssistantText = buildAgentHistoryAssistantSummary(parsed, null);
    let agentMemoryFallback = {
      executedMemoryActions: [],
      pendingMemoryActions: [],
      corpusCreatedPaths: [],
      targetPath: "",
    };
    try {
      agentMemoryFallback = await executeDurableMemoryFallback(config, message, history, runId, llmDebug, {
        replyMarkdown,
        currentPath: name || "",
        currentMarkdown: markdown,
      });
    } catch (e) {
      agentLog(runId, "chat_agent_durable_memory_fallback_error", { error: String(e?.message || e) });
    }
    queueAgentInstructionsUpdate(config, {
      runId,
      mode: "agent",
      userContent: message,
      assistantContent: replyText,
    });
    appendAgentActivityLog(activityBase({
      status: "done",
      reply: truncStr(replyText, 1000),
      changed,
      wroteFile,
      memoryActionCount: Array.isArray(agentMemoryFallback.executedMemoryActions)
        ? agentMemoryFallback.executedMemoryActions.length
        : 0,
      corpusCreatedPaths: Array.isArray(agentMemoryFallback.corpusCreatedPaths)
        ? agentMemoryFallback.corpusCreatedPaths
        : [],
    }));
    res.json({
      reply: replyText,
      markdown: nextMd,
      changed,
      wroteFile,
      ...(Array.isArray(agentMemoryFallback.corpusCreatedPaths) && agentMemoryFallback.corpusCreatedPaths.length
        ? { corpusCreatedPaths: agentMemoryFallback.corpusCreatedPaths }
        : {}),
      ...(Array.isArray(agentMemoryFallback.executedMemoryActions) && agentMemoryFallback.executedMemoryActions.length
        ? { executedMemoryActions: agentMemoryFallback.executedMemoryActions }
        : {}),
      ...(Array.isArray(agentMemoryFallback.pendingMemoryActions) && agentMemoryFallback.pendingMemoryActions.length
        ? { pendingMemoryActions: agentMemoryFallback.pendingMemoryActions }
        : {}),
      ...(llmDebug ? { debugLlm: llmDebug } : {}),
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const isLlmPayloadError =
      /LLM-response|geen geldige JSON|Lege LLM-response|Lege reply van de LLM/i.test(msg);
    agentLog(runId, "chat_fatal", { mode, error: msg, isLlmPayloadError });
    appendAgentActivityLog(activityBase({ status: "error", error: msg }));
    res.status(isLlmPayloadError ? 422 : 500).json({
      error: msg,
      ...(llmDebug ? { debugLlm: llmDebug } : {}),
    });
  }
});

app.post("/api/agent/run", async (req, res) => {
  const runId = crypto.randomUUID();
  const name = safeMarkdownPath(req.body?.name);
  if (!name) {
    agentLog(runId, "run_bad_request", { reason: "invalid_name", name: req.body?.name });
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }

  const virtualSession = name.startsWith("_mv_external/");
  const hasStringMarkdown = typeof req.body?.markdown === "string";
  /** Virtueel pad = altijd inline markdown (geen .md in MARKDOWN_DIR); voorkomt 404 als body.markdown ontbreekt. */
  const external =
    virtualSession ||
    (req.body?.external === true && hasStringMarkdown);

  if (req.body?.external === true && !virtualSession && !hasStringMarkdown) {
    agentLog(runId, "run_bad_request", { reason: "external_missing_markdown", name });
    res.status(400).json({ error: "Voor external=true is markdown (string) verplicht in de requestbody." });
    return;
  }

  const full = external ? null : markdownFullPath(name);
  if (!external && !full) {
    agentLog(runId, "run_bad_request", { reason: "path_not_in_markdown_dir", name });
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }

  try {
    if (!external && (!full || !fs.existsSync(full))) {
      agentLog(runId, "run_not_found", { document: name });
      res.status(404).json({ error: "Markdown not found" });
      return;
    }
    const config = readAgentConfig();
    if (!config.apiKey.trim() || !config.endpoint.trim() || !config.model.trim()) {
      agentLog(runId, "run_config_missing", { document: name });
      res.status(400).json({ error: "Agentconfig ontbreekt: vul API key, endpoint en model in." });
      return;
    }

    const replyMarkdown = req.body?.replyMarkdown !== false;

    const { comments, agentChatHistory, agentChatUiHistory } = readReviewPayload(name);
    let chatHistory = [...agentChatHistory];
    let chatUiHistory = [...agentChatUiHistory];
    const pendingAgentReviews = pendingAgentReviewComments(comments);
    if (pendingAgentReviews.length > 0) {
      agentLog(runId, "run_conflict_pending_approval", {
        document: name,
        pending: pendingAgentReviews.length,
      });
      res.status(409).json({
        error:
          "Er staan nog agentwijzigingen open. Keur alle vorige agentwijzigingen eerst goed of af voordat je een nieuwe run start.",
        pending: pendingAgentReviews.length,
      });
      return;
    }
    let markdown = external
      ? hasStringMarkdown
        ? req.body.markdown
        : ""
      : fs.readFileSync(full, "utf8");
    const backupState = { backedUp: false };
    let processed = 0;
    let changed = 0;
    let failed = 0;
    let skipped = 0;

    agentLog(runId, "run_start", {
      document: name,
      markdownChars: markdown.length,
      totalComments: comments.length,
      agentChatHistoryMessages: chatHistory.length,
      model: config.model,
      endpointHost: safeEndpointHost(config.endpoint),
      verbose: AGENT_LOG_VERBOSE,
    });

    for (const comment of comments) {
      if (hasAgentReply(comment)) {
        skipped += 1;
        if (AGENT_LOG_VERBOSE) {
          agentLog(runId, "comment_skip", {
            commentId: comment?.id,
            reason: "already_has_agent_reply",
          });
        }
        continue;
      }
      if (!isProcessableAgentComment(comment)) {
        skipped += 1;
        if (AGENT_LOG_VERBOSE) {
          agentLog(runId, "comment_skip", {
            commentId: comment?.id,
            reason: "not_processable",
          });
        }
        continue;
      }
      processed += 1;
      const payload = commentForAgentCall(comment);
      const markdownAtRequest = markdown;
      try {
        const agentResult = await callReviewAgent(
          config,
          markdownAtRequest,
          payload,
          {
            runId,
            step: processed,
            commentId: comment.id,
          },
          chatHistory,
          "review",
          null,
          replyMarkdown,
        );
        const changes = Array.isArray(agentResult?.changes) ? agentResult.changes : [];
        const nextMarkdown = applyPatchesToMarkdown(markdownAtRequest, changes, { patchLogRunId: runId });
        const docMutated = nextMarkdown !== markdownAtRequest;
        if (docMutated) {
          if (external) {
            backupExternalMarkdownIfNeeded(name, markdownAtRequest, backupState);
          } else {
            backupMarkdownIfNeeded(name, full, backupState);
          }
          markdown = nextMarkdown;
          changed += changes.length;
        }
        addAgentReply(comment, agentResult?.reply || `Verwerkt met ${changes.length} wijziging(en).`);
        chatUiHistory.push({ role: "user", content: shortUserLineForUi(comment), mode: "agent" });
        const replyRaw = typeof agentResult?.reply === "string" ? agentResult.reply.trim() : "";
        const assistantUi =
          replyRaw ||
          (docMutated ? `Toegepast: ${changes.length} patch(es).` : "Geen wijzigingen doorgevoerd.");
        chatUiHistory.push({ role: "assistant", content: assistantUi, mode: "agent" });
        chatUiHistory = trimAgentChatHistory(chatUiHistory);
        chatHistory.push({ role: "user", content: buildAgentHistoryUserSummary(payload, markdownAtRequest), mode: "agent" });
        chatHistory.push({ role: "assistant", content: buildAgentHistoryAssistantSummary(agentResult, null), mode: "agent" });
        chatHistory = trimAgentChatHistory(chatHistory);
        agentLog(runId, "comment_done", {
          commentId: comment.id,
          step: processed,
          docMutated,
          patchesApplied: changes.length,
        });
      } catch (e) {
        failed += 1;
        chatUiHistory.push({ role: "user", content: shortUserLineForUi(comment), mode: "agent" });
        chatUiHistory.push({
          role: "assistant",
          content: `Geen wijziging toegepast: ${String(e?.message || e)}`,
          mode: "agent",
        });
        chatUiHistory = trimAgentChatHistory(chatUiHistory);
        chatHistory.push({ role: "user", content: buildAgentHistoryUserSummary(payload, markdownAtRequest), mode: "agent" });
        chatHistory.push({
          role: "assistant",
          content: buildAgentHistoryAssistantSummary(null, String(e?.message || e)),
          mode: "agent",
        });
        chatHistory = trimAgentChatHistory(chatHistory);
        agentLog(runId, "comment_failed", {
          commentId: comment.id,
          step: processed,
          error: String(e?.message || e),
        });
        addAgentReply(
          comment,
          `Geen wijziging uitgevoerd: ${String(e?.message || e)}. Pas de opdracht of selectie aan en probeer opnieuw.`,
        );
      }
    }

    if (backupState.backedUp && !external) {
      fs.writeFileSync(full, markdown, "utf8");
    }
    const reviewRelativePath = writeReviewComments(name, comments, chatHistory, chatUiHistory);
    agentLog(runId, "run_finish", {
      document: name,
      processed,
      changed,
      failed,
      skipped,
      wroteMarkdown: backupState.backedUp && !external,
      external,
      reviewRelativePath,
    });
    const responsePayload = { ok: true, name, processed, changed, failed, skipped, reviewRelativePath };
    if (external) {
      responsePayload.markdown = markdown;
    }
    res.json(responsePayload);
  } catch (e) {
    agentLog(runId, "run_fatal", { document: name, error: String(e?.message || e) });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

async function main() {
  const server = http.createServer(app);

  if (apiOnly) {
    server.listen(API_PORT, "0.0.0.0", () => {
      console.log(`Markdown viewer API (dev): http://127.0.0.1:${API_PORT}`);
      console.log(`API handlerRev=${API_HANDLER_REVISION} (controle: GET /api/health)`);
      console.log("Start Vite op poort 5173 (npm run dev) of open de app via de Vite-URL; /api wordt geproxied.");
      console.log(`Agentlog in de viewer: GET/DELETE http://127.0.0.1:${API_PORT}/api/agent/logs`);
      console.log(
        `Word: GET /api/docx/templates, …/export; POST /api/docx/import (DOCX→Markdown) — templates=${DOCX_TEMPLATES_DIR}`,
      );
      console.log(`LLM2DOCX_ROOT=${LLM2DOCX_ROOT} (override met LLM2DOCX_ROOT / DOCX_TEMPLATES_DIR / DOCX_PYTHON)`);
      logDocxExportEnv();
      console.log(`MARKDOWN_DIR=${MARKDOWN_DIR}`);
      console.log(`REVIEWS_DIR=${REVIEWS_DIR}`);
      scheduleCorpusRebuildOnStartup();
    });
    server.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        console.error(
          `API-poort ${API_PORT} is al in gebruik. Stop het andere proces of zet API_PORT=… op een vrije poort.`,
        );
      } else {
        console.error(err);
      }
      process.exit(1);
    });
    return;
  }

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: rootDir,
      configFile: path.join(rootDir, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: "spa",
    });
    /** Laat `/api/*` nooit Vite’s 404-middleware raken (die anders leeg 404 geeft). */
    app.use((req, res, next) => {
      const p = (req.originalUrl || req.url || "").split("?")[0] || "";
      if (p === "/api" || p.startsWith("/api/")) {
        next();
        return;
      }
      vite.middlewares(req, res, next);
    });
  } else {
    app.use(express.static(DIST));

    app.get("*", (_req, res) => {
      const indexHtml = path.join(DIST, "index.html");
      if (!fs.existsSync(indexHtml)) {
        res.status(503).send("Frontend not built. Run npm run build.");
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    const mode = isDev ? "development (Vite + API)" : "production";
    console.log(`Markdown viewer (${mode}): http://127.0.0.1:${PORT}`);
    console.log(`API handlerRev=${API_HANDLER_REVISION} (controle: GET /api/health)`);
    if (isDev) {
      console.log("Eén proces: API + Vite — gebruik alleen deze URL (geen aparte `vite` op :5173 zonder deze server).");
    }
    console.log(`Agentlog in de viewer: GET/DELETE http://127.0.0.1:${PORT}/api/agent/logs`);
    console.log(
        `Word: GET /api/docx/templates, …/export; POST /api/docx/import (DOCX→Markdown) — templates=${DOCX_TEMPLATES_DIR}`,
      );
    console.log(`LLM2DOCX_ROOT=${LLM2DOCX_ROOT}`);
    logDocxExportEnv();
    console.log(`MARKDOWN_DIR=${MARKDOWN_DIR}`);
    console.log(`REVIEWS_DIR=${REVIEWS_DIR}`);
    console.log(`TEMPLATES_DIR=${TEMPLATES_DIR}`);
    scheduleCorpusRebuildOnStartup();
  });
  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      console.error(
        `Poort ${PORT} is al in gebruik. Stop het andere proces of zet env PORT=… op een vrije poort.`,
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
