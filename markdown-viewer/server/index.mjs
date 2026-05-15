import "./load-env.mjs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const MARKDOWN_DIR = process.env.MARKDOWN_DIR || path.join(rootDir, "..", "Files");
const REVIEWS_DIR = process.env.REVIEWS_DIR || path.join(MARKDOWN_DIR, ".reviews");
const AGENT_CONFIG_PATH = path.join(rootDir, "agent.config.json");
const AGENT_CONFIG_LEGACY_PATH = path.join(rootDir, "agent.config");
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

function safeDocxDownloadName(raw, fallback) {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const t = raw.trim();
  if (t.includes("..") || t.includes("/") || t.includes("\\")) return fallback;
  if (!SAFE_DOCX_BASENAME.test(t)) return fallback;
  return t;
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

async function fetchDocxTemplatesFromService() {
  const url = `${DOCX_EXPORT_URL}/api/templates`;
  const r = await fetch(url, { headers: docxExportAuthHeaders() });
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
  if (DOCX_USE_PORTAL) {
    const items = Array.isArray(data) ? data : [];
    const templates = items
      .map((x) => (typeof x?.name === "string" ? x.name : null))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return { templates, directory: DOCX_EXPORT_URL };
  }
  return data;
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

function ensureParentDir(full) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
}

function readableAgentConfigPath() {
  if (fs.existsSync(AGENT_CONFIG_PATH)) return AGENT_CONFIG_PATH;
  if (fs.existsSync(AGENT_CONFIG_LEGACY_PATH)) return AGENT_CONFIG_LEGACY_PATH;
  return AGENT_CONFIG_PATH;
}

function readAgentConfig() {
  const configPath = readableAgentConfigPath();
  if (!fs.existsSync(configPath)) {
    return { apiKey: "", endpoint: "", model: "" };
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const data = JSON.parse(raw);
  return {
    apiKey: typeof data.apiKey === "string" ? data.apiKey : "",
    endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
    model: typeof data.model === "string" ? data.model : "",
  };
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
  if (!apiKey) throw new Error("apiKey is verplicht");
  const config = { apiKey, endpoint, model };
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  return config;
}

function markdownChatCompletionsUrl(endpoint) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

function readReviewComments(name) {
  const full = reviewJsonPath(name);
  if (!full || !fs.existsSync(full)) return [];
  const raw = fs.readFileSync(full, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data.comments) ? data.comments : [];
}

function writeReviewComments(name, comments) {
  const full = reviewJsonPath(name);
  if (!full) throw new Error("Invalid review path");
  ensureReviewsDir();
  ensureParentDir(full);
  fs.writeFileSync(full, JSON.stringify({ version: 1, comments }, null, 2), "utf8");
  return path.relative(MARKDOWN_DIR, full).split(path.sep).join("/");
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

function parseAgentJsonResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Lege LLM-response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (m) return JSON.parse(m[1].trim());
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("LLM-response is geen geldige JSON");
  }
}

async function callReviewAgent(config, markdown, comment, logMeta = {}) {
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
  const userMessage =
    "Verwerk deze reviewopdracht met het volledige markdowndocument als context. " +
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
  agentLog(runId, "llm_request_start", logReq);

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
            content:
              "Je bent een review-agent voor markdown. Geef uitsluitend JSON terug met {\"changes\":[{\"find\":\"...\",\"replace\":\"...\",\"replaceAll\":false}],\"reply\":\"...\"}. " +
              "Je krijgt altijd het volledige actuele markdowndocument mee als context. Gebruik die volledige documentcontext om de opdracht te begrijpen. " +
              "Gebruik replaceAll:true alleen als de opdracht expliciet documentbreed is, bijvoorbeeld terminologie consequent overal vervangen. " +
              "Maak alleen gerichte wijzigingen via exacte find/replace patches. Vermijd meta-zinnen over ‘de opdracht’ in je reply; antwoord kort inhoudelijk op wat er is gedaan.",
          },
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
  const content = choice?.message?.content;
  agentLog(runId, "llm_response_ok", {
    step,
    commentId,
    elapsedMs,
    contentChars: String(content ?? "").length,
    finishReason: choice?.finish_reason ?? null,
    usage: data?.usage ?? null,
  });

  if (content == null || String(content).trim() === "") {
    agentLog(runId, "llm_empty_message_content", {
      step,
      commentId,
      choiceKeys: choice?.message ? Object.keys(choice.message) : [],
    });
  }

  try {
    const parsed = parseAgentJsonResponse(content);
    const changes = Array.isArray(parsed?.changes) ? parsed.changes : [];
    agentLog(runId, "llm_parse_ok", {
      step,
      commentId,
      changesCount: changes.length,
      replyChars: String(parsed?.reply ?? "").length,
    });
    return parsed;
  } catch (e) {
    agentLog(runId, "llm_content_parse_error", {
      step,
      commentId,
      error: String(e?.message || e),
      contentSnippet: truncStr(content, 800),
    });
    throw e;
  }
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

const app = express();

app.disable("x-powered-by");
/** Cross-origin als Vite op een andere poort draait en `VITE_API_ORIGIN` naar deze server wijst. */
const enableLocalhostApiCors = apiOnly || !isDev;
if (enableLocalhostApiCors) {
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
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
  res.json({ ok: true });
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
    res.json({ ok: true, name });
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
  if (!full.startsWith(resolvedDir + path.sep) && full !== resolvedDir) {
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
    if (!fs.existsSync(bak)) {
      res.status(404).json({
        error:
          "Geen vorige versie op schijf. Maak eerst een backup (opslaan in de viewer, of POST /api/markdown-backup-current vóór de wijziging).",
      });
      return;
    }
    const restored = fs.readFileSync(bak, "utf8");
    fs.writeFileSync(full, restored, "utf8");
    fs.unlinkSync(bak);
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
      const data = await fetchDocxTemplatesFromService();
      const templates = Array.isArray(data.templates) ? data.templates : [];
      res.json({
        templates,
        directory: typeof data.directory === "string" ? data.directory : DOCX_EXPORT_URL,
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
    res.status(502).json({
      error: String(e?.message || e),
      docxServiceUrl: DOCX_EXPORT_URL || undefined,
    });
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
      res.json({ name, comments: [] });
      return;
    }
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw);
    const comments = Array.isArray(data.comments) ? data.comments : [];
    res.json({ name, comments });
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
    const payload = { version: 1, comments };
    ensureParentDir(full);
    fs.writeFileSync(full, JSON.stringify(payload, null, 2), "utf8");
    const reviewRelativePath = path.relative(MARKDOWN_DIR, full).split(path.sep).join("/");
    console.log(`[review-comments] wrote ${full}`);
    res.json({ ok: true, name, reviewRelativePath });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/agent/run", async (req, res) => {
  const runId = crypto.randomUUID();
  const name = safeMarkdownPath(req.body?.name);
  const full = name ? markdownFullPath(name) : null;
  if (!name || !full) {
    agentLog(runId, "run_bad_request", { reason: "invalid_name", name: req.body?.name });
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
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

    const comments = readReviewComments(name);
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
    let markdown = fs.readFileSync(full, "utf8");
    const backupState = { backedUp: false };
    let processed = 0;
    let changed = 0;
    let failed = 0;
    let skipped = 0;

    agentLog(runId, "run_start", {
      document: name,
      markdownChars: markdown.length,
      totalComments: comments.length,
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
      try {
        const agentResult = await callReviewAgent(config, markdown, payload, {
          runId,
          step: processed,
          commentId: comment.id,
        });
        const changes = Array.isArray(agentResult?.changes) ? agentResult.changes : [];
        const nextMarkdown = applyExactPatches(markdown, changes);
        const docMutated = nextMarkdown !== markdown;
        if (docMutated) {
          backupMarkdownIfNeeded(name, full, backupState);
          markdown = nextMarkdown;
          changed += changes.length;
        }
        addAgentReply(comment, agentResult?.reply || `Verwerkt met ${changes.length} wijziging(en).`);
        agentLog(runId, "comment_done", {
          commentId: comment.id,
          step: processed,
          docMutated,
          patchesApplied: changes.length,
        });
      } catch (e) {
        failed += 1;
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

    if (backupState.backedUp) {
      fs.writeFileSync(full, markdown, "utf8");
    }
    const reviewRelativePath = writeReviewComments(name, comments);
    agentLog(runId, "run_finish", {
      document: name,
      processed,
      changed,
      failed,
      skipped,
      wroteMarkdown: backupState.backedUp,
      reviewRelativePath,
    });
    res.json({ ok: true, name, processed, changed, failed, skipped, reviewRelativePath });
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
      console.log("Start Vite op poort 5173 (npm run dev) of open de app via de Vite-URL; /api wordt geproxied.");
      console.log(`Agentlog in de viewer: GET/DELETE http://127.0.0.1:${API_PORT}/api/agent/logs`);
      console.log(`Word-export: GET /api/docx/templates, POST /api/docx/export — templates=${DOCX_TEMPLATES_DIR}`);
      console.log(`LLM2DOCX_ROOT=${LLM2DOCX_ROOT} (override met LLM2DOCX_ROOT / DOCX_TEMPLATES_DIR / DOCX_PYTHON)`);
      logDocxExportEnv();
      console.log(`MARKDOWN_DIR=${MARKDOWN_DIR}`);
      console.log(`REVIEWS_DIR=${REVIEWS_DIR}`);
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
    app.use(vite.middlewares);
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
    if (isDev) {
      console.log("Eén proces: API + Vite — gebruik alleen deze URL (geen aparte `vite` op :5173 zonder deze server).");
    }
    console.log(`Agentlog in de viewer: GET/DELETE http://127.0.0.1:${PORT}/api/agent/logs`);
    console.log(`Word-export: GET /api/docx/templates, POST /api/docx/export — templates=${DOCX_TEMPLATES_DIR}`);
    console.log(`LLM2DOCX_ROOT=${LLM2DOCX_ROOT}`);
    logDocxExportEnv();
    console.log(`MARKDOWN_DIR=${MARKDOWN_DIR}`);
    console.log(`REVIEWS_DIR=${REVIEWS_DIR}`);
    console.log(`TEMPLATES_DIR=${TEMPLATES_DIR}`);
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
