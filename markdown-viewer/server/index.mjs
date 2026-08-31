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
import { marked } from "marked";
import TurndownService from "turndown";
import {
  rebuildCorpusIndex,
  readManifest,
  buildCorpusAskContext,
  extractMarkdownSections,
  linkUnlinkedMentionsInMarkdown,
  scoreMarkdownSectionsForQuestion,
  retrievalBudgetForQuestion,
  unlinkedMentionSuggestionsFromManifest,
  searchCorpusManifests,
  scoreEntriesForQuestion,
  ensureCorpusMetaComment,
  extractDocumentMetadata,
  stripCorpusMetaFromMarkdown,
  resolveCanonicalDocumentPath,
} from "./corpus-index.mjs";
import { createCorpusIndexScheduler } from "./corpus-index-scheduler.mjs";
import { createCorpusOrganizer, resolveRedirectTarget, isInboxPath, isOrganizerExemptPath, isDraftContentReadyForOrganize, writeWorkDocumentDraft } from "./corpus-organizer.mjs";
import {
  classifyNexusIntent,
  defaultExperimentPathPatterns,
  formatInternalKanbanDisambiguationBlock,
  INTERNAL_KANBAN_DISAMBIGUATION_RULE,
  INTERNAL_KANBAN_TOOL_PREFIX,
  toolGroupsToCorpusOpts,
} from "./nexus/nexus-intent.mjs";
import {
  createNexusRunContext,
  hasPriorKanbanSearch,
} from "./nexus/nexus-run-cache.mjs";
import { assertPatchAllowed, isProtectedDocumentPath } from "./nexus/nexus-protected-paths.mjs";
import { normalizeReviewAgentLlmPayload } from "./nexus/nexus-agent-response.mjs";
import {
  extractStructuredToolContext,
  formatEvidenceBlock,
  formatEvidenceFooter,
  nexusStructuredEvidenceEnabled,
} from "./nexus/nexus-evidence.mjs";
import {
  applyExactPatchesResilient,
  applySectionScopedPatches,
  coerceAgentChangesForEmptyDocument,
  countPatchFindOccurrences,
  dedupePatchChanges,
  extractMarkdownBodyFromAgentReply,
  isEffectivelyEmptyDocumentMarkdown,
  resolveEmptyDocumentChanges,
} from "./nexus/nexus-patch.mjs";
import {
  formatMemoryPathResolutionError,
  resolveMemoryMarkdownPath,
} from "./nexus/nexus-memory-path.mjs";
import {
  browserSessionHelpText,
  browserSessionStatus,
  clearBrowserSyncedCookie,
  getBrowserSyncedCookie,
  primeBrowserCookieFromDisk,
  startConfluenceDebugEdge,
  syncConfluenceBrowserSession,
} from "./nexus/nexus-confluence-browser-session.mjs";
import {
  confluenceConfigPayload as buildConfluenceConfigPayload,
  confluenceFetch,
  diagnoseConfluenceAuth,
  resetConfluenceGatewaySession,
} from "./nexus/nexus-confluence.mjs";
import { buildModelCatalog, phaseLabelNl } from "./nexus/nexus-model-catalog.mjs";
import {
  createModelTrace,
  isAutoModel,
  publicRouterPayload,
  readModelRouterConfig,
  resolveLlmConfig,
  shouldRunStrategyPhase,
} from "./nexus/nexus-model-router.mjs";
import { recordModelRouterEvent, readModelRouterScores, topModelsByPhase } from "./nexus/nexus-model-learning.mjs";
import { getTemplateChecklist } from "./nexus/nexus-template-profiles.mjs";
import {
  boostCriticalThreadResults,
  upsertCriticalThread,
} from "./nexus/nexus-critical-threads.mjs";
import {
  buildActivityOverview,
  formatActivityOverviewMarkdown,
} from "./nexus/nexus-activity-overview.mjs";
import { buildTimesheetDraftPayload, formatTimesheetDraftMarkdown } from "./timesheet-builder.mjs";
import {
  pushNexusToolMessage,
  suggestKanbanDuplicateTask,
  tryNexusToolCache,
} from "./nexus/nexus-tool-bridge.mjs";
import { nexusVoicePromptBlock } from "./nexus/nexus-voice.mjs";
import {
  looksLikeOrganicMemoryContext,
  organicMemoryBootstrapHint,
  shouldRunOrganicMemoryReflection,
  createOrganicMemoryScheduler,
  startOrganicStaleChatScheduler,
} from "./nexus-organic-memory.mjs";
import {
  formatNexusViewerContextBlock,
  resolveNexusViewerDocument,
  resolveViewerOpenDocument,
  truncateNexusHeuristicBlob,
} from "./nexus/nexus-viewer-context.mjs";
import {
  MEMORY_DIRNAME,
  safeDocxDownloadName,
  safeDocxTemplateName,
  safeFolderPath,
  safeMarkdownPath,
  safeMemoryMarkdownPath,
  safeTemplateName,
  suggestedMdNameFromDocxUpload,
} from "./path-safety.mjs";
import {
  createManagedOutlookCalendarEventPayload,
  createOutlookDraftPayload,
  createOutlookReplyDraftPayload,
  outlookConfigPayload,
  readOutlookMailPayload,
  searchManagedOutlookCalendarPayload,
  searchOutlookCalendarPayload,
  searchOutlookMailPayload,
  updateManagedOutlookCalendarEventPayload,
} from "./outlook-tools.mjs";
import { createEmailAgent } from "./email-agent.mjs";
import { createKanbanStore, KANBAN_PRIORITIES, KANBAN_STATUSES } from "./kanban-store.mjs";
import {
  getKanbanProjectCatalog,
  getKanbanProjectCatalogPrompt,
  getKanbanProjectRegistry,
  resolveKanbanProject,
} from "./kanban-projects.mjs";
import { createKanbanCommentsStore } from "./kanban-comments.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
/** Verhoog bij relevante API-gedragswijzigingen; controleer met GET /api/health of je de juiste server draait. */
const API_HANDLER_REVISION = "2026-05-28-agent-activity-log-tool";
const MARKDOWN_DIR = process.env.MARKDOWN_DIR || path.join(rootDir, "..", "Files");
const MEMORY_DIR = process.env.MEMORY_DIR || path.join(MARKDOWN_DIR, MEMORY_DIRNAME);
const CRITICAL_THREADS_PATH =
  process.env.NEXUS_CRITICAL_THREADS_PATH || path.join(MEMORY_DIR, "system", "critical-threads.json");
const KANBAN_DIR = process.env.KANBAN_DIR ? path.resolve(process.env.KANBAN_DIR) : path.join(MARKDOWN_DIR, ".kanban");
const NEXUS_DEBUG_DIR = process.env.NEXUS_DEBUG_DIR ? path.resolve(process.env.NEXUS_DEBUG_DIR) : path.join(MARKDOWN_DIR, ".nexus-debug");
const NEXUS_ERROR_LOG_PATH = process.env.NEXUS_ERROR_LOG_PATH || path.join(NEXUS_DEBUG_DIR, "errorlog.md");
const NEXUS_FIX_LOG_PATH = process.env.NEXUS_FIX_LOG_PATH || path.join(NEXUS_DEBUG_DIR, "fixlog.md");
const MEMORY_INDEX_DIR = path.join(MEMORY_DIR, ".mv-index");
const MEMORY_MANIFEST_FILE = "memory-manifest.json";
const REVIEWS_DIR = process.env.REVIEWS_DIR || path.join(MARKDOWN_DIR, ".reviews");
const AGENT_CONFIG_PATH = process.env.AGENT_CONFIG_PATH || path.join(rootDir, "agent.config.json");
const AGENT_CONFIG_LEGACY_PATH = process.env.AGENT_CONFIG_LEGACY_PATH || path.join(rootDir, "agent.config");
const AGENT_INSTRUCTIONS_PATH = process.env.AGENT_INSTRUCTIONS_PATH || path.join(rootDir, "agent-instructions.md");
const AGENT_CHATS_PATH = process.env.AGENT_CHATS_PATH || path.join(rootDir, "agent-chats.json");
const AGENT_ACTIVITY_LOGS_PATH = process.env.AGENT_ACTIVITY_LOGS_PATH || path.join(rootDir, "agent-activity-logs.jsonl");
const PROMPT_MACROS_PATH = process.env.PROMPT_MACROS_PATH || path.join(rootDir, "prompt-macros.json");
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
const IOMS_AUTH_ENABLED = process.env.IOMS_AUTH_DISABLED !== "1";
const IOMS_AUTH_USER = (process.env.IOMS_AUTH_USER || "joost").trim() || "joost";
const IOMS_AUTH_PASSWORD = (process.env.IOMS_AUTH_PASSWORD || "").trim();
const OUTLOOK_TOOLS_ENABLED = process.env.OUTLOOK_TOOLS_DISABLED !== "1" && process.platform === "win32";

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
const ORGANIC_MEMORY_REFLECTION_ENABLED = process.env.ORGANIC_MEMORY_REFLECTION !== "0";

/** Corpus-index onder MARKDOWN_DIR/.mv-index/ — zet op `0` om uit te zetten. */
const CORPUS_INDEX_AUTO_START = process.env.CORPUS_INDEX_AUTO_START !== "0";
const CORPUS_INDEX_ON_SAVE = process.env.CORPUS_INDEX_ON_SAVE !== "0";
const CORPUS_INDEX_YIELD_EVERY = Math.max(0, Number(process.env.CORPUS_INDEX_YIELD_EVERY || 15) || 15);
const CORPUS_INDEX_DEBOUNCE_MS = Math.min(
  120000,
  Math.max(500, Number(process.env.CORPUS_INDEX_DEBOUNCE_MS || 5000) || 5000),
);

/** Max tekens per bestand bij corpus-tool read_corpus_markdown (truncate met melding). */
const CORPUS_READ_MAX_CHARS = Math.min(
  2_000_000,
  Math.max(8000, Number(process.env.CORPUS_READ_MAX_CHARS || 120000) || 120000),
);

const LLM_MESSAGE_TOTAL_MAX_CHARS = Math.min(
  1_000_000,
  Math.max(120000, Number(process.env.LLM_MESSAGE_TOTAL_MAX_CHARS || 360000) || 360000),
);
const LLM_MESSAGE_MAX_CHARS = Math.min(
  500000,
  Math.max(8000, Number(process.env.LLM_MESSAGE_MAX_CHARS || 90000) || 90000),
);
const LLM_TOOL_MESSAGE_MAX_CHARS = Math.min(
  200000,
  Math.max(4000, Number(process.env.LLM_TOOL_MESSAGE_MAX_CHARS || 18000) || 18000),
);

/** Max tekens bij corpus-tool create_corpus_markdown (nieuw bestand). */
const CORPUS_CREATE_MAX_CHARS = Math.min(
  2_000_000,
  Math.max(2000, Number(process.env.CORPUS_CREATE_MAX_CHARS || 400000) || 400000),
);

/** Max LLM-tool-rondes (read → denken → …) bij corpus-chat. */
const CORPUS_ASK_MAX_ROUNDS = Math.min(40, Math.max(2, Number(process.env.CORPUS_ASK_MAX_ROUNDS || 14) || 14));
/** LLM provider/gateway stabiliteit. Blijf onder bekende 240s stream timeout en retry alleen transient fouten. */
const LLM_REQUEST_TIMEOUT_MS = Math.min(
  230000,
  Math.max(30000, Number(process.env.LLM_REQUEST_TIMEOUT_MS || 210000) || 210000),
);
const LLM_RETRY_MAX = Math.min(5, Math.max(0, Number(process.env.LLM_RETRY_MAX || 2) || 2));
const LLM_RETRY_BASE_MS = Math.min(10000, Math.max(250, Number(process.env.LLM_RETRY_BASE_MS || 1200) || 1200));

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

/** Optionele Confluence-integratie. PAT blijft server-side en wordt nooit naar de browser/LLM teruggegeven. */
const CONFLUENCE_BASE_URL = String(process.env.CONFLUENCE_BASE_URL || "").trim().replace(/\/+$/, "");
const CONFLUENCE_PAT = String(process.env.CONFLUENCE_PAT || "").trim();
const CONFLUENCE_TIMEOUT_MS = Math.min(
  60000,
  Math.max(3000, Number(process.env.CONFLUENCE_TIMEOUT_MS || 20000) || 20000),
);
const CONFLUENCE_PAGE_MAX_CHARS = Math.min(
  200000,
  Math.max(2000, Number(process.env.CONFLUENCE_PAGE_MAX_CHARS || 60000) || 60000),
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

async function executeCorpusIndexRebuild(reason) {
  ensureMemoryRoot();
  const yieldEvery = CORPUS_INDEX_YIELD_EVERY;
  const working = await rebuildCorpusIndex(MARKDOWN_DIR, { scope: "working", yieldEvery });
  const memory = await rebuildCorpusIndex(MARKDOWN_DIR, {
    scope: "memory",
    sourceRootDir: MEMORY_DIR,
    indexDir: MEMORY_INDEX_DIR,
    yieldEvery,
  });
  console.log(
    `[corpus-index] rebuilt (${reason}): ${working.entryCount} werkdocument(en), ${memory.entryCount} memory-document(en)`,
  );
  return { working, memory };
}

const corpusIndexScheduler = createCorpusIndexScheduler(executeCorpusIndexRebuild);

function scheduleCorpusIndexRebuild(reason = "scheduled") {
  return corpusIndexScheduler.schedule(reason);
}

async function runCorpusIndexRebuild(reason) {
  try {
    return await corpusIndexScheduler.runAndWait(reason);
  } catch (e) {
    console.error(`[corpus-index] rebuild mislukt (${reason}):`, e?.message || e);
    return null;
  }
}

function getCorpusIndexStatus() {
  return corpusIndexScheduler.snapshot();
}

function scheduleCorpusRebuildAfterSave() {
  if (!CORPUS_INDEX_ON_SAVE) return;
  if (corpusSaveRebuildTimer) clearTimeout(corpusSaveRebuildTimer);
  corpusSaveRebuildTimer = setTimeout(() => {
    corpusSaveRebuildTimer = null;
    scheduleCorpusIndexRebuild("save");
  }, CORPUS_INDEX_DEBOUNCE_MS);
}

function scheduleCorpusRebuildOnStartup() {
  if (!CORPUS_INDEX_AUTO_START) return;
  setTimeout(() => scheduleCorpusIndexRebuild("startup"), 1200);
}

const organicMemoryReflectionScheduler = createOrganicMemoryScheduler({
  runReflection: async (payload) => {
    const config = readAgentConfig();
    if (!config.apiKey?.trim() || !config.endpoint?.trim() || !config.model?.trim()) return null;
    return executeDurableMemoryFallback(
      config,
      payload.message,
      Array.isArray(payload.history) ? payload.history : [],
      payload.runId || "organic-memory",
      null,
      {
        organicReflection: true,
        reply: payload.reply || "",
        currentPath: payload.documentPath || "",
        currentMarkdown: payload.currentMarkdown || "",
        replyMarkdown: false,
      },
    );
  },
  log: (event, detail) => agentLog("organic-memory", event, detail),
});

function scheduleOrganicMemoryReflectionForTurn(opts) {
  if (!ORGANIC_MEMORY_REFLECTION_ENABLED) return { scheduled: false };
  if (!shouldRunOrganicMemoryReflection(opts)) return { scheduled: false };
  return organicMemoryReflectionScheduler.schedule({
    chatId: opts.chatId || "",
    message: opts.message || "",
    reply: opts.reply || "",
    history: opts.history || [],
    runId: opts.runId || "organic-memory",
    documentPath: opts.documentPath || "",
    currentMarkdown: opts.currentMarkdown || "",
  });
}

function organicReflectionMeta(extra) {
  const reflection = scheduleOrganicMemoryReflectionForTurn({
    chatId: extra.chatId,
    message: extra.message,
    reply: extra.reply,
    history: extra.history,
    runId: extra.runId,
    mode: extra.mode,
    documentPath: extra.documentPath,
    currentMarkdown: extra.currentMarkdown,
    weekPlan2ndbrain: extra.weekPlan2ndbrain === true,
    executedMemoryCount: extra.executedMemoryCount || 0,
    durableSignal: extra.durableSignal === true,
    organicSignal: extra.organicSignal === true,
  });
  return reflection.scheduled ? { organicMemoryReflection: reflection } : {};
}

function startOrganicMemorySchedulers() {
  startOrganicStaleChatScheduler({
    readChats: readAgentChatsPayload,
    promoteStaleChat: (id) => promoteAgentChatSession(id, "organic-stale"),
    log: (event, detail) => agentLog("organic-memory", event, detail),
  });
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

function approxTokensFromChars(chars) {
  return Math.max(0, Math.ceil(Math.max(0, Number(chars) || 0) / 4));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isLlmRetryableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function isLlmRetryableFetchError(error) {
  const msg = String(error?.message || error || "");
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket|terminated|aborted|timeout/i.test(
    msg,
  );
}

function isToolsUnsupportedBody(body) {
  return /tools cannot be specified per-request|unsupported_parameter/i.test(String(body || ""));
}

function llmHttpErrorMessage(status, body) {
  if (status === 504 && /stream timeout/i.test(String(body || ""))) {
    return "LLM-call mislukt (504): stream timeout. De provider/gateway brak de aanvraag af na lange verwerking; probeer een kleinere opdracht of splits grote transcript/documenttaken.";
  }
  if (status === 429) {
    return `LLM-call mislukt (429): rate limit/resource exhausted. Probeer het zo opnieuw. ${String(body || "").slice(0, 350)}`;
  }
  if (status === 400 && isToolsUnsupportedBody(body)) {
    return "LLM-call mislukt (400): dit model/endpoint ondersteunt geen per-request tools. Gebruik een tool-capable model of schakel de gevraagde toolmodus uit.";
  }
  return `LLM-call mislukt (${status}): ${String(body || "").slice(0, 500)}`;
}

function truncateForLlm(value, maxChars, label = "ingekort") {
  const s = String(value || "");
  if (s.length <= maxChars) return s;
  const head = Math.max(1000, Math.floor(maxChars * 0.7));
  const tail = Math.max(1000, maxChars - head - 220);
  return (
    s.slice(0, head) +
    `\n\n...[${label}: ${s.length} tekens teruggebracht tot ${maxChars}]...\n\n` +
    s.slice(Math.max(head, s.length - tail))
  );
}

function messageContentChars(content) {
  if (typeof content === "string") return content.length;
  try {
    return JSON.stringify(content || "").length;
  } catch {
    return String(content || "").length;
  }
}

function compactLlmMessages(messages, runId = "—") {
  if (!Array.isArray(messages)) return { messages, compacted: false, beforeChars: 0, afterChars: 0 };
  let compacted = false;
  const beforeChars = messages.reduce((sum, m) => sum + messageContentChars(m?.content), 0);
  const out = messages.map((m, idx) => {
    if (!m || typeof m !== "object") return m;
    const role = m.role;
    const isLastUser = role === "user" && idx === messages.length - 1;
    const max =
      role === "tool"
        ? LLM_TOOL_MESSAGE_MAX_CHARS
        : role === "system"
          ? Math.min(LLM_MESSAGE_MAX_CHARS, 45000)
          : isLastUser
            ? Math.max(LLM_MESSAGE_MAX_CHARS, 140000)
            : LLM_MESSAGE_MAX_CHARS;
    if (typeof m.content === "string" && m.content.length > max) {
      compacted = true;
      return { ...m, content: truncateForLlm(m.content, max, `${role || "message"} voor LLM-context`) };
    }
    return m;
  });

  let afterChars = out.reduce((sum, m) => sum + messageContentChars(m?.content), 0);
  if (afterChars > LLM_MESSAGE_TOTAL_MAX_CHARS) {
    compacted = true;
    for (let i = 1; i < out.length - 1 && afterChars > LLM_MESSAGE_TOTAL_MAX_CHARS; i += 1) {
      const m = out[i];
      if (!m || typeof m !== "object" || typeof m.content !== "string") continue;
      const max = m.role === "tool" ? 6000 : 12000;
      if (m.content.length <= max) continue;
      const prev = m.content.length;
      out[i] = { ...m, content: truncateForLlm(m.content, max, "extra contextbudget compaction") };
      afterChars += out[i].content.length - prev;
    }
  }
  while (afterChars > LLM_MESSAGE_TOTAL_MAX_CHARS) {
    let largestIdx = -1;
    let largestLen = 0;
    for (let i = 0; i < out.length; i += 1) {
      const len = typeof out[i]?.content === "string" ? out[i].content.length : 0;
      if (len > largestLen) {
        largestLen = len;
        largestIdx = i;
      }
    }
    if (largestIdx < 0 || largestLen <= 4000) break;
    compacted = true;
    const nextMax = Math.max(4000, Math.floor(largestLen * 0.55));
    const prev = out[largestIdx].content.length;
    out[largestIdx] = {
      ...out[largestIdx],
      content: truncateForLlm(out[largestIdx].content, nextMax, "hard contextbudget compaction"),
    };
    afterChars += out[largestIdx].content.length - prev;
  }
  if (compacted) {
    agentLog(runId, "llm_messages_compacted", {
      beforeChars,
      afterChars,
      approxBeforeTokens: approxTokensFromChars(beforeChars),
      approxAfterTokens: approxTokensFromChars(afterChars),
      messageCount: messages.length,
    });
  }
  return { messages: out, compacted, beforeChars, afterChars };
}

function compactLlmRequestBody(rawBody, runId = "—") {
  if (typeof rawBody !== "string" || !rawBody.trim()) return rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (!Array.isArray(parsed?.messages)) return rawBody;
    const compacted = compactLlmMessages(parsed.messages, runId);
    if (!compacted.compacted) return rawBody;
    return JSON.stringify({ ...parsed, messages: compacted.messages });
  } catch {
    return rawBody;
  }
}

async function fetchLlmTextWithRetry(url, fetchOptions, meta = {}) {
  const runId = meta.runId || "—";
  const logPrefix = meta.logPrefix || "llm";
  const maxRetries = Number.isFinite(meta.maxRetries) ? Math.max(0, meta.maxRetries) : LLM_RETRY_MAX;
  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("LLM request timeout")), LLM_REQUEST_TIMEOUT_MS);
    try {
      const compactedBody = compactLlmRequestBody(fetchOptions.body, runId);
      const response = await fetch(url, {
        ...fetchOptions,
        body: compactedBody,
        signal: controller.signal,
      });
      const body = await response.text();
      const attemptMs = Date.now() - attemptStartedAt;
      if (response.ok) {
        if (attempt > 0) {
          agentLog(runId, `${logPrefix}_retry_success`, {
            ...meta.logFields,
            attempt,
            status: response.status,
            attemptMs,
            totalMs: Date.now() - startedAt,
          });
        }
        return { status: response.status, body, elapsedMs: Date.now() - startedAt, attempts: attempt + 1 };
      }

      const retryable = isLlmRetryableStatus(response.status) && attempt < maxRetries;
      agentLog(runId, `${logPrefix}_http_${retryable ? "retry" : "error"}`, {
        ...meta.logFields,
        attempt,
        status: response.status,
        attemptMs,
        bodySnippet: truncStr(body, 1000),
      });
      if (!retryable) {
        throw new Error(llmHttpErrorMessage(response.status, body));
      }
      lastError = new Error(llmHttpErrorMessage(response.status, body));
    } catch (e) {
      const attemptMs = Date.now() - attemptStartedAt;
      const retryable = isLlmRetryableFetchError(e) && attempt < maxRetries;
      agentLog(runId, `${logPrefix}_fetch_${retryable ? "retry" : "failed"}`, {
        ...meta.logFields,
        attempt,
        attemptMs,
        error: String(e?.message || e),
      });
      if (!retryable) throw e;
      lastError = e;
    } finally {
      clearTimeout(timeout);
    }

    const backoffMs = Math.min(15000, LLM_RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250));
    await sleep(backoffMs);
  }

  throw lastError || new Error("LLM-call mislukt na retries.");
}

function normalizeTokenUsage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const promptTokens = Number.isFinite(raw.prompt_tokens)
    ? raw.prompt_tokens
    : Number.isFinite(raw.promptTokens)
      ? raw.promptTokens
      : 0;
  const completionTokens = Number.isFinite(raw.completion_tokens)
    ? raw.completion_tokens
    : Number.isFinite(raw.completionTokens)
      ? raw.completionTokens
      : 0;
  const totalTokens = Number.isFinite(raw.total_tokens)
    ? raw.total_tokens
    : Number.isFinite(raw.totalTokens)
      ? raw.totalTokens
      : promptTokens + completionTokens;
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return {
    promptTokens: Math.round(promptTokens),
    completionTokens: Math.round(completionTokens),
    totalTokens: Math.round(totalTokens),
  };
}

function addTokenUsage(target, usage) {
  if (!usage) return;
  target.promptTokens += usage.promptTokens || 0;
  target.completionTokens += usage.completionTokens || 0;
  target.totalTokens += usage.totalTokens || 0;
}

function finalizePerformanceMetrics(metrics, extra = {}) {
  if (!metrics || typeof metrics !== "object") return null;
  const durationMs = Number.isFinite(extra.durationMs)
    ? Math.max(0, Math.round(extra.durationMs))
    : Number.isFinite(metrics.startedAt)
      ? Math.max(0, Date.now() - metrics.startedAt)
      : 0;
  const tokenUsage = metrics.tokenUsage || {};
  const hasTokenUsage = !!(tokenUsage.promptTokens || tokenUsage.completionTokens || tokenUsage.totalTokens);
  return {
    durationMs,
    llmMs: Math.max(0, Math.round(metrics.llmMs || 0)),
    llmCallCount: Math.max(0, Math.round(metrics.llmCallCount || 0)),
    toolCallCount: Math.max(0, Math.round(metrics.toolCallCount || 0)),
    contextChars: Math.max(0, Math.round(metrics.contextChars || 0)),
    approxContextTokens: approxTokensFromChars(metrics.contextChars || 0),
    retrievedChars: Math.max(0, Math.round(metrics.retrievedChars || 0)),
    approxRetrievedTokens: approxTokensFromChars(metrics.retrievedChars || 0),
    replyChars: Math.max(0, Math.round(extra.replyChars || metrics.replyChars || 0)),
    ...(hasTokenUsage ? { tokenUsage } : {}),
    ...(metrics.retrievalMeta ? { retrievalMeta: metrics.retrievalMeta } : {}),
  };
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
    performanceMetrics:
      raw?.performanceMetrics && typeof raw.performanceMetrics === "object" ? raw.performanceMetrics : undefined,
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

function timesheetBuilderDeps() {
  return {
    readActivityLogs: (args) => readActivityLogsToolPayload(args),
    listKanbanTasks: (args) => kanbanStore.listTasks(args),
    searchEmailMemory: (args) => searchEmailMemoryToolPayload(args),
    searchOutlookCalendar: (args) => searchOutlookCalendarPayload(args),
    searchManagedCalendar: (args) => searchManagedOutlookCalendarPayload(args),
    searchOutlookMail: (args) => searchOutlookMailPayload(args),
  };
}

async function buildTimesheetDraftToolPayload(args = {}) {
  const fromDate = typeof args.fromDate === "string" ? args.fromDate.trim() : "";
  const toDate = typeof args.toDate === "string" ? args.toDate.trim() : "";
  const includeCalendar = args.includeCalendar !== false;
  const includeOutlookMail = args.includeOutlookMail !== false;
  const payload = await buildTimesheetDraftPayload(
    { fromDate, toDate, includeCalendar, includeOutlookMail },
    timesheetBuilderDeps(),
  );
  return {
    ok: true,
    ...payload,
    userFacingInstruction:
      "Dit is een evidence-first urenconcept (80% klant / 20% overig, 8,0 u per werkdag, één regel per activiteit). " +
      "Gebruik dit als basis; verdiep ontbrekende signalen via de macro-bronnen en schrijf het eindoverzicht in het gevraagde formaat.",
  };
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

function emailMemorySearchText(item) {
  return [
    item?.subject,
    item?.title,
    item?.summary,
    item?.importanceReason,
    item?.action,
    item?.userContext,
    item?.processedUserContext,
    item?.from,
    item?.to,
    item?.folder,
    item?.direction,
    item?.priority,
    item?.category,
    ...(Array.isArray(item?.tags) ? item.tags : []),
    ...(Array.isArray(item?.relatedMemory) ? item.relatedMemory : []),
  ]
    .filter(Boolean)
    .join("\n");
}

function emailMemoryScore(item, terms) {
  const text = emailMemorySearchText(item).toLowerCase();
  if (!terms.length) return 1;
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (text.includes(term)) score += 3;
    if (String(item?.subject || "").toLowerCase().includes(term)) score += 4;
    if (Array.isArray(item?.tags) && item.tags.some((tag) => String(tag).toLowerCase().includes(term))) score += 3;
  }
  return score;
}

function normalizeEmailMemoryResult(raw, source) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    source,
    id: String(item.id || item.notificationId || item.messageKey || ""),
    status: String(item.status || item.notificationStatus || ""),
    mailDate: String(item.mailDate || item.processedAt || item.createdAt || ""),
    direction: String(item.direction || ""),
    folder: String(item.folder || ""),
    subject: String(item.subject || item.title || "(geen onderwerp)"),
    from: String(item.from || ""),
    to: String(item.to || ""),
    priority: String(item.priority || ""),
    requiresAction: item.requiresAction === true,
    summary: truncStr(String(item.summary || ""), 900),
    importanceReason: truncStr(String(item.importanceReason || ""), 700),
    action: truncStr(String(item.action || ""), 700),
    userContext: truncStr(String(item.userContext || ""), 1200),
    userContextUpdatedAt: String(item.userContextUpdatedAt || ""),
    processedUserContext: truncStr(String(item.processedUserContext || ""), 1600),
    processedUserContextUpdatedAt: String(item.processedUserContextUpdatedAt || ""),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string").slice(0, 12) : [],
    relatedMemory: Array.isArray(item.relatedMemory)
      ? item.relatedMemory.filter((rel) => typeof rel === "string").slice(0, 8)
      : [],
    memoryPath: String(item.memoryPath || ""),
    digestPath: String(item.digestPath || ""),
    messageKey: String(item.messageKey || ""),
  };
}

function readEmailAgentEventRecords(limit = 1000) {
  const systemDir = path.join(MEMORY_DIR, "system");
  if (!fs.existsSync(systemDir)) return [];
  const files = fs
    .readdirSync(systemDir, { withFileTypes: true })
    .filter((d) => d.isFile() && /^email-agent-events-\d{4}-\d{2}\.jsonl$/i.test(d.name))
    .map((d) => path.join(systemDir, d.name))
    .sort((a, b) => a.localeCompare(b));
  const records = [];
  for (const file of files.slice(-6)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(-limit)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object") records.push(parsed);
      } catch {
        /* ignore malformed JSONL line */
      }
    }
  }
  return records.slice(-limit);
}

function markdownSection(content, heading) {
  const source = String(content || "").replace(/\r\n/g, "\n");
  const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = re.exec(source);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = source.slice(start);
  const next = rest.search(/^##\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function parseLegacyEmailNote(content, memoryPath) {
  const actionSection = markdownSection(content, "Actie");
  return {
    source: "legacy-note",
    memoryPath,
    subject: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(memoryPath, ".md"),
    summary: markdownSection(content, "Samenvatting"),
    importanceReason: markdownSection(content, "Waarom relevant"),
    action: actionSection.match(/^-\s*Gevraagde actie:\s*(.+)$/im)?.[1]?.trim() || "",
    requiresAction: /Actie nodig:\s*ja/i.test(actionSection),
    priority: actionSection.match(/^-\s*Prioriteit:\s*(.+)$/im)?.[1]?.trim() || "",
    mailDate: content.match(/^mailDate:\s*"?([^"\n]+)"?\s*$/im)?.[1]?.trim() || "",
    direction: content.match(/^direction:\s*"?([^"\n]+)"?\s*$/im)?.[1]?.trim() || "",
    folder: content.match(/^folder:\s*"?([^"\n]+)"?\s*$/im)?.[1]?.trim() || "",
    from: content.match(/^from:\s*"?([^"\n]+)"?\s*$/im)?.[1]?.trim() || "",
    to: content.match(/^to:\s*"?([^"\n]+)"?\s*$/im)?.[1]?.trim() || "",
    tags: (markdownSection(content, "Tags").match(/#[\w-]+/g) || []).map((tag) => tag.slice(1)),
  };
}

function readLegacyEmailMemoryNotes(limit = 300) {
  const root = path.join(MEMORY_DIR, "email-agent");
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir, prefix = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^\d{4}-\d{2}$/.test(entry.name)) walk(full, rel);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md") || !/^\d{4}-\d{2}\//.test(rel)) continue;
      try {
        out.push(parseLegacyEmailNote(fs.readFileSync(full, "utf8"), `email-agent/${rel}`));
      } catch {
        /* ignore unreadable legacy note */
      }
    }
  };
  walk(root);
  return out
    .sort((a, b) => String(b.mailDate || "").localeCompare(String(a.mailDate || "")))
    .slice(0, limit);
}

function readEmailDigestResults(limit = 200) {
  const dir = path.join(MEMORY_DIR, "email-agent", "digests");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => path.join(dir, d.name))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files.slice(-12)) {
    const rel = `email-agent/digests/${path.basename(file)}`;
    const lines = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("- "));
    for (const line of lines) {
      out.push({
        source: "digest",
        digestPath: rel,
        subject: rel,
        summary: line.replace(/^-\s*/, "").trim(),
      });
    }
  }
  return out.slice(-limit);
}

function readEmailAgentNotificationsForSearch() {
  const statePath = path.join(MEMORY_DIR, "system", "email-agent-state.json");
  try {
    if (!fs.existsSync(statePath)) return [];
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return Array.isArray(raw?.notifications) ? raw.notifications : [];
  } catch {
    return [];
  }
}

function searchEmailMemoryToolPayload(args = {}) {
  const query = String(args.query || "").trim();
  const limit = Math.min(50, Math.max(1, Number(args.limit || 12) || 12));
  const includeArchived = args.includeArchived === true;
  const requiresActionOnly = args.requiresActionOnly === true;
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length >= 2)
    .slice(0, 12);
  const candidates = [
    ...readEmailAgentNotificationsForSearch().map((item) => normalizeEmailMemoryResult(item, "notification-state")),
    ...readEmailAgentEventRecords().map((item) => normalizeEmailMemoryResult(item, "event-store")),
    ...readEmailDigestResults().map((item) => normalizeEmailMemoryResult(item, "digest")),
    ...readLegacyEmailMemoryNotes().map((item) => normalizeEmailMemoryResult(item, item.source || "legacy-note")),
  ];
  const seen = new Set();
  const results = candidates
    .filter((item) => includeArchived || item.status !== "archived")
    .filter((item) => !requiresActionOnly || item.requiresAction)
    .map((item) => ({ ...item, score: emailMemoryScore(item, terms) }))
    .filter((item) => !terms.length || item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.mailDate || "").localeCompare(String(a.mailDate || ""));
    })
    .filter((item) => {
      const key = item.messageKey || `${item.source}|${item.mailDate}|${item.subject}|${item.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  return {
    ok: true,
    source: "email-memory",
    query,
    results,
    count: results.length,
    totalCandidates: candidates.length,
    note:
      "Read-only e-mailmemory: afgeleide Outlook-samenvattingen, acties en metadata uit state/eventstore/digests/legacy-notities; geen volledige e-mailbody.",
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
  return (
    `\n\n## Huidige tijd\n` +
    `- Server lokale tijd: ${local}\n` +
    `- ISO-8601 UTC: ${now.toISOString()}\n\n` +
    `## Datuminterpretatie\n` +
    `- Interpreteer relatieve datums zoals vandaag, morgen, gisteren, deze week en volgende week altijd vanaf de server lokale tijd hierboven, tenzij Joost expliciet een andere referentiedatum noemt.\n` +
    `- Maak geen aannames over de weekdag uit een weekplan, agenda-item of documentkop als die botst met of losstaat van de serverdatum. Koppel weekplanregels alleen aan een datum/dag wanneer dat expliciet uit de bron blijkt.\n` +
    `- Als Joost "morgen" of een andere relatieve datum gebruikt en de planning/context ambigu is, schrijf expliciet welke kalenderdatum je bedoelt of stel één verduidelijkingsvraag.\n`
  );
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

- Je naam is **Nexus** (intern, alleen in interactie met Joost; niet in externe/klantteksten tenzij expliciet gevraagd).
- Antwoord helder, compact en praktisch.
- Gebruik Markdown wanneer dat de leesbaarheid verbetert.
- Raadpleeg relevante context voordat je aangeeft iets niet te weten. Gebruik de heuristische baseline én tools actief over corpus, memory, e-mailmemory en Kanban; beperk je niet tot het geopende document.
- «Kanban», «Kanban bord», «Nexus Kanban» en «Kanban taken» verwijzen **altijd** naar het interne Actie-Kanban in iOMS (\`Files/.kanban/tasks.json\`), niet naar Jira, Azure DevOps of andere externe boards.
- Stel alleen inhoudelijke vervolgvragen wanneer ontbrekende informatie het resultaat merkbaar verbetert.
- Interpreteer relatieve datums zoals vandaag, morgen en deze week vanaf de actuele serverdatum die in de prompt staat. Neem geen weekdag aan uit een weekplan of document tenzij die expliciet aan een datum is gekoppeld; bij twijfel benoem de kalenderdatum of vraag om verduidelijking.

## Links in werkdocumenten

- Maak interne links in werkdocumenten als gewone Markdown-links: \`[zichtbare tekst](relatief/pad/Bestand.md)\`.
- Gebruik paden relatief aan \`Files/\`; zet \`Files/\` zelf niet in de link.
- Gebruik forward slashes (\`/\`) en behoud spaties in bestandsnamen; encodeer spaties niet als \`%20\`.
- Escape de vierkante haken van een link niet. Schrijf dus \`[managed services](90-experiments-en-test/Managed Services.md)\`, niet \`\\[managed services\\](...)\` of \`[managed services\\](...)\`.
- Gebruik geen wiki-links (\`[[...]]\`) wanneer je een klikbare browserlink in de markdown-viewer wilt maken.

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

function memoryPathExists(relPath) {
  const full = memoryFullPath(relPath);
  return !!(full && fs.existsSync(full));
}

function workingMarkdownPathExists(relPath) {
  const full = corpusEntryFullPath(MARKDOWN_DIR, relPath);
  return !!(full && fs.existsSync(full));
}

function resolveMemoryPathOnDisk(relRaw, options = {}) {
  const memoryManifest =
    options.memoryManifest ||
    readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  const workingManifest =
    options.workingManifest || readManifest(MARKDOWN_DIR, { scope: "working" });
  return resolveMemoryMarkdownPath(relRaw, {
    memoryManifest,
    workingManifest,
    memoryExists: memoryPathExists,
    workingExists: workingMarkdownPathExists,
    allowFuzzy: options.allowFuzzy !== false,
  });
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

function isDocxServiceConnectionError(error) {
  const msg = String(error?.message || error || "");
  return (
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|network|socket|timeout|abort|UND_ERR_SOCKET/i.test(
      msg,
    ) || msg.includes("DOCX-export service niet bereikbaar")
  );
}

function listLocalDocxTemplates() {
  if (!fs.existsSync(DOCX_TEMPLATES_DIR)) return [];
  return fs
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
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error("[markdown-files] readdir mislukt:", dir, e?.message || e);
    return out;
  }
  for (const d of entries) {
    if (d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    const full = path.join(dir, d.name);
    try {
      if (d.isDirectory()) out.push(...readDirMarkdown(full, rel));
      if (d.isFile() && d.name.endsWith(".md")) out.push(rel);
    } catch (e) {
      console.error("[markdown-files] entry overgeslagen:", rel, e?.message || e);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function readDirFolders(dir = MARKDOWN_DIR, prefix = "") {
  if (!fs.existsSync(MARKDOWN_DIR)) return [];
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error("[markdown-files] folder readdir mislukt:", dir, e?.message || e);
    return out;
  }
  for (const d of entries) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    out.push(rel);
    try {
      out.push(...readDirFolders(path.join(dir, d.name), rel));
    } catch (e) {
      console.error("[markdown-files] submap overgeslagen:", rel, e?.message || e);
    }
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
    let st;
    try {
      st = fs.statSync(full);
    } catch (e) {
      console.error("[markdown-files] stat overgeslagen:", name, e?.message || e);
      continue;
    }
    details.push({
      name,
      folder: markdownFolderFromPath(name),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
  }
  return details;
}

function secondBrainSummaryFromManifest(manifest, scope) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const tagCounts = manifest?.tagCounts && typeof manifest.tagCounts === "object" ? manifest.tagCounts : {};
  const relationEntries = entries
    .map((entry) => ({
      path: entry.path,
      title: entry.title,
      linkCount: Array.isArray(entry.linksOut) ? entry.linksOut.length : 0,
      backlinkCount: Array.isArray(entry.backlinks) ? entry.backlinks.length : Number(entry.linksInCount || 0),
      unlinkedMentionCount: Array.isArray(entry.unlinkedMentions) ? entry.unlinkedMentions.length : 0,
      relatedCount: Array.isArray(entry.related) ? entry.related.length : 0,
    }))
    .sort(
      (a, b) =>
        b.backlinkCount +
          b.linkCount +
          b.unlinkedMentionCount -
        (a.backlinkCount + a.linkCount + a.unlinkedMentionCount),
    )
    .slice(0, 25);
  return {
    scope,
    generatedAt: manifest?.generatedAt || "",
    entryCount: entries.length,
    metadataKeys: Array.isArray(manifest?.metadataKeys) ? manifest.metadataKeys : [],
    tagCounts,
    relationEntries,
    staleCandidates: entries
      .filter((entry) => {
        const props = entry.properties && typeof entry.properties === "object" ? entry.properties : {};
        return /^(stale|archived|draft)$/i.test(String(props.status || props.state || ""));
      })
      .map((entry) => ({ path: entry.path, title: entry.title, status: entry.properties?.status || entry.properties?.state }))
      .slice(0, 50),
    unlinkedMentions: entries
      .flatMap((entry) =>
        Array.isArray(entry.unlinkedMentions)
          ? entry.unlinkedMentions.map((mention) => ({
              from: entry.path,
              to: mention.path,
              title: mention.title,
              mention: mention.mention,
            }))
          : [],
      )
      .slice(0, 100),
  };
}

function readSecondBrainManifestsOrThrow() {
  const workingManifest = readManifest(MARKDOWN_DIR, { scope: "working" });
  const memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  if (!workingManifest?.entries?.length || !memoryManifest?.entries) {
    const err = new Error("Corpus-index ontbreekt of is leeg. Gebruik eerst POST /api/corpus-index/rebuild.");
    err.statusCode = 404;
    throw err;
  }
  return { workingManifest, memoryManifest };
}

function secondBrainUnlinkedMentionPayload(limit = 500) {
  const { workingManifest, memoryManifest } = readSecondBrainManifestsOrThrow();
  const working = unlinkedMentionSuggestionsFromManifest(workingManifest, { scope: "working", limit });
  const memory = unlinkedMentionSuggestionsFromManifest(memoryManifest, { scope: "memory", limit });
  return {
    generatedAt: new Date().toISOString(),
    working,
    memory,
    totalCount: working.length + memory.length,
  };
}

function corpusEntryFullPath(sourceRoot, relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  const resolvedRoot = path.resolve(sourceRoot);
  const full = path.resolve(resolvedRoot, ...normalized.split("/"));
  if (!full.startsWith(resolvedRoot + path.sep) && full !== resolvedRoot) return null;
  return full;
}

function applyUnlinkedMentionSuggestionsForScope(scope, manifest, sourceRoot, opts = {}) {
  const selectedIds = Array.isArray(opts.ids) && opts.ids.length ? new Set(opts.ids.map(String)) : null;
  const allSuggestions = unlinkedMentionSuggestionsFromManifest(manifest, { scope, limit: opts.limit || 1000 });
  const suggestions = selectedIds ? allSuggestions.filter((item) => selectedIds.has(item.id)) : allSuggestions;
  const byFile = new Map();
  for (const suggestion of suggestions) {
    const list = byFile.get(suggestion.from) || [];
    list.push(suggestion);
    byFile.set(suggestion.from, list);
  }

  const files = [];
  const applied = [];
  const skipped = [];
  for (const [from, fileSuggestions] of byFile.entries()) {
    const full = corpusEntryFullPath(sourceRoot, from);
    if (!full || !fs.existsSync(full)) {
      skipped.push(...fileSuggestions.map((suggestion) => ({ ...suggestion, reason: "source-not-found" })));
      continue;
    }
    const before = fs.readFileSync(full, "utf8");
    const result = linkUnlinkedMentionsInMarkdown(before, from, fileSuggestions, {
      maxPerFile: opts.maxPerFile || 50,
    });
    if (result.changed) {
      fs.writeFileSync(full, result.content, "utf8");
      files.push({ path: from, appliedCount: result.applied.length });
      applied.push(...result.applied);
    }
    skipped.push(...result.skipped);
  }

  return {
    scope,
    suggestionCount: suggestions.length,
    filesChanged: files.length,
    appliedCount: applied.length,
    skippedCount: skipped.length,
    files,
    applied,
    skipped,
  };
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
  const resolved = resolveMemoryPathOnDisk(relRaw);
  if (!resolved.ok) {
    return {
      ok: false,
      error: formatMemoryPathResolutionError(resolved) || resolved.error,
      pathScope: resolved.pathScope,
      code: resolved.code,
      requestedPath: resolved.requestedPath,
      suggestions: resolved.suggestions,
      memorySuggestions: resolved.memorySuggestions,
      hint: resolved.hint,
    };
  }
  const name = resolved.path;
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
      requestedPath: resolved.requestedPath !== name ? resolved.requestedPath : undefined,
      resolvedVia: resolved.resolvedVia !== "exact" ? resolved.resolvedVia : undefined,
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

function markdownPayloadForScope(scope, relRaw) {
  if (scope === "memory") {
    const payload = readMemoryMarkdownToolPayload(relRaw);
    return { ...payload, scope: "memory" };
  }
  const payload = readCorpusMarkdownToolPayload(relRaw);
  return { ...payload, scope: "working" };
}

function readMarkdownOutlineToolPayload(scope, relRaw, queryRaw = "") {
  const payload = markdownPayloadForScope(scope, relRaw);
  if (!payload.ok) return payload;
  const sections = extractMarkdownSections(payload.content || "");
  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";
  const budget = retrievalBudgetForQuestion(query || relRaw);
  const ranked = query ? scoreMarkdownSectionsForQuestion(query, sections, { limit: budget.sectionLimit }) : null;
  const sectionsForPayload = ranked
    ? ranked.sections
    : sections.slice(0, budget.sectionLimit).map((s, idx) => ({ ...s, originalIndex: idx }));
  return {
    ok: true,
    scope: payload.scope,
    path: payload.path,
    displayPath: payload.displayPath,
    contextType: payload.contextType,
    sectionCount: sections.length,
    query,
    retrievalMeta: ranked?.meta || {
      algorithm: "document-order",
      candidateCount: sections.length,
      returnedCount: sectionsForPayload.length,
    },
    budget,
    sections: sectionsForPayload.map((s, idx) => ({
      index: Number.isInteger(s.originalIndex) ? s.originalIndex + 1 : idx + 1,
      ...(query ? { rank: idx + 1 } : {}),
      id: s.id,
      level: s.level,
      heading: s.heading,
      headingPath: s.headingPath,
      startLine: s.startLine,
      endLine: s.endLine,
      contentChars: s.contentChars,
      preview:
        s.preview.length > budget.sectionPreviewChars
          ? `${s.preview.slice(0, budget.sectionPreviewChars)}…`
          : s.preview,
      ...(typeof s.score === "number" ? { score: Math.round(s.score * 1000) / 1000 } : {}),
    })),
    omittedSections: Math.max(0, sections.length - sectionsForPayload.length),
    fallbackInstruction: sections.length
      ? undefined
      : "Geen koppen gevonden. Gebruik read_corpus_markdown/read_memory_markdown als je de volledige inhoud nodig hebt.",
  };
}

function normalizeHeadingSelector(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim();
}

function readMarkdownSectionToolPayload(scope, relRaw, selectorRaw) {
  const payload = markdownPayloadForScope(scope, relRaw);
  if (!payload.ok) return payload;
  const content = String(payload.content || "");
  const sections = extractMarkdownSections(content);
  if (!sections.length) {
    return {
      ok: false,
      scope: payload.scope,
      path: payload.path,
      displayPath: payload.displayPath,
      error: "Geen koppen of secties gevonden in dit document. Gebruik read_corpus_markdown/read_memory_markdown als fallback.",
    };
  }

  const selector = String(selectorRaw || "").trim();
  const selectorNorm = normalizeHeadingSelector(selector);
  const numeric = Number(selector);
  let match = null;
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= sections.length) match = sections[numeric - 1];
  if (!match && selectorNorm) {
    match =
      sections.find((s) => normalizeHeadingSelector(s.id) === selectorNorm) ||
      sections.find((s) => normalizeHeadingSelector(s.headingPath.join(" > ")) === selectorNorm) ||
      sections.find((s) => normalizeHeadingSelector(s.heading) === selectorNorm);
  }
  if (!match) {
    return {
      ok: false,
      scope: payload.scope,
      path: payload.path,
      displayPath: payload.displayPath,
      error: `Sectie niet gevonden: ${selector || "(leeg)"}. Lees eerst de outline en gebruik index, id, heading of headingPath.`,
    };
  }

  const lines = content.split(/\r?\n/);
  const sectionBody = lines.slice(match.startLine, match.endLine).join("\n").trim();
  const truncated = sectionBody.length > CORPUS_READ_MAX_CHARS;
  return {
    ok: true,
    scope: payload.scope,
    path: payload.path,
    displayPath: payload.displayPath,
    contextType: payload.contextType,
    section: {
      id: match.id,
      level: match.level,
      heading: match.heading,
      headingPath: match.headingPath,
      startLine: match.startLine,
      endLine: match.endLine,
    },
    content: truncated
      ? `${sectionBody.slice(0, CORPUS_READ_MAX_CHARS)}\n\n---\n*[Sectie ingekort voor contextlimiet.]*\n`
      : sectionBody,
    truncated,
  };
}

async function createCorpusMarkdownToolPayload(relRaw, contentRaw) {
  ensureMemoryRoot();
  const resolved = resolveMemoryPathOnDisk(relRaw, { allowFuzzy: false });
  const name = resolved.ok ? resolved.path : safeMemoryMarkdownPath(relRaw);
  if (!name) {
    if (!resolved.ok && resolved.code === "working_document") {
      return {
        ok: false,
        error: formatMemoryPathResolutionError(resolved),
        pathScope: resolved.pathScope,
        code: resolved.code,
        hint: resolved.hint,
      };
    }
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

function isWorkDocumentToolPath(relRaw) {
  const name = safeMarkdownPath(relRaw);
  if (!name) return null;
  if (isOrganizerExemptPath(name)) return null;
  if (isProtectedDocumentPath(name)) return null;
  return name;
}

function scheduleWorkDocumentOrganizeIfReady(relPath, content) {
  if (!isInboxPath(relPath)) return;
  if (!isDraftContentReadyForOrganize(content)) return;
  corpusOrganizer.scheduleOrganizeAfterSave(relPath);
}

function resolveWorkDocumentSavePath(requestedPath, content) {
  const name = safeMarkdownPath(requestedPath);
  if (!name) return null;
  const full = markdownFullPath(name);
  if (full && fs.existsSync(full)) return name;
  const manifest = readManifest(MARKDOWN_DIR, { scope: "working" });
  return resolveCanonicalDocumentPath(manifest, name, content) || name;
}

async function syncOrganizeWorkDocumentAfterSave(relPath, content, runId = "save-sync") {
  let canonicalPath = relPath;
  let movedFrom = null;
  let movedTo = null;
  if (!isInboxPath(relPath)) return { canonicalPath, movedFrom, movedTo };
  if (!isDraftContentReadyForOrganize(content)) {
    corpusOrganizer.scheduleOrganizeAfterSave(relPath);
    return { canonicalPath, movedFrom, movedTo };
  }
  const result = await corpusOrganizer.organizeInboxFileNow(relPath, { runId });
  if (result?.status === "moved" && result.move?.toPath) {
    movedFrom = result.move.fromPath;
    movedTo = result.move.toPath;
    canonicalPath = result.move.toPath;
  }
  return { canonicalPath, movedFrom, movedTo };
}

async function writeWorkMarkdownWithOrganize(relPath, content, runId = "save") {
  const writePath = resolveWorkDocumentSavePath(relPath, content);
  if (!writePath) throw new Error("Invalid or missing markdown file name");
  const full = markdownFullPath(writePath);
  if (!full) throw new Error("Invalid or missing markdown file name");
  if (fs.existsSync(full)) {
    const prev = fs.readFileSync(full, "utf8");
    const bak = markdownBackupPath(writePath);
    if (bak) {
      ensureParentDir(bak);
      fs.writeFileSync(bak, prev, "utf8");
    }
  } else {
    ensureParentDir(full);
  }
  fs.writeFileSync(full, content, "utf8");
  scheduleCorpusRebuildAfterSave();
  void syncOrganizeWorkDocumentAfterSave(writePath, content, runId).catch((e) => {
    console.error(`[corpus-organizer] post-save organize failed:`, e?.message || e);
  });
  return {
    name: writePath,
    writePath,
    movedFrom: null,
    movedTo: null,
  };
}

/** Nieuw naamloos werkdocument in 00-inbox/ (draft); optionele startinhoud. */
async function createWorkDocumentToolPayload(contentRaw = "") {
  try {
    const initial =
      typeof contentRaw === "string" ? contentRaw.replace(/\r\n/g, "\n") : "";
    if (initial.length > CORPUS_CREATE_MAX_CHARS) {
      return {
        ok: false,
        error: `Inhoud te lang (${initial.length} tekens; max ${CORPUS_CREATE_MAX_CHARS}).`,
      };
    }
    const created = writeWorkDocumentDraft({ markdownDir: MARKDOWN_DIR, content: initial });
    if (!created.ok) return created;
    scheduleCorpusRebuildAfterSave();
    scheduleWorkDocumentOrganizeIfReady(created.path, created.content);
    return {
      ok: true,
      path: created.path,
      docId: created.docId,
      charsWritten: created.charsWritten,
      isDraft: true,
      message:
        "Naamloos werkdocument aangemaakt in 00-inbox/. Corpus Gardener classificeert en hernoemt na voldoende inhoud.",
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Werk een inbox-werkdocument bij (draft of concept); niet voor .memory/ of bestaande georganiseerde docs. */
async function updateWorkDocumentToolPayload(relRaw, args = {}, runId = "—") {
  const name = isWorkDocumentToolPath(relRaw);
  if (!name) {
    return { ok: false, error: "Ongeldig of niet-toegestaan werkdocumentpad." };
  }
  if (!isInboxPath(name)) {
    return {
      ok: false,
      error:
        "update_work_document werkt alleen op documenten in 00-inbox/. Voor bestaande werkdocumenten: Agent-modus op het geopende document of read + patch-flow.",
    };
  }
  const full = markdownFullPath(name);
  if (!full || !fs.existsSync(full)) {
    return { ok: false, error: `Werkdocument niet gevonden: ${name}` };
  }

  const contentArg = typeof args.content === "string" ? args.content.replace(/\r\n/g, "\n") : null;
  const find = typeof args.find === "string" ? args.find : "";
  const replace = typeof args.replace === "string" ? args.replace.replace(/\r\n/g, "\n") : "";

  try {
    const before = fs.readFileSync(full, "utf8");
    let next = before;

    if (contentArg != null) {
      if (contentArg.length > CORPUS_CREATE_MAX_CHARS) {
        return {
          ok: false,
          error: `Inhoud te lang (${contentArg.length} tekens; max ${CORPUS_CREATE_MAX_CHARS}).`,
        };
      }
      const meta = extractDocumentMetadata(before);
      const docId = meta.properties.doc_id || null;
      next = ensureCorpusMetaComment(contentArg, docId, { status: "draft" }).content;
    } else {
      if (!find) return { ok: false, error: "Geef content (volledige vervanging) of find+replace op." };
      next = applyPatchesToMarkdown(
        before,
        [{ find, replace, replaceAll: false }],
        { patchLogRunId: runId, documentPath: name },
      );
    }

    if (next === before) {
      return {
        ok: true,
        executed: false,
        path: name,
        message: "Geen wijziging: inhoud bleef gelijk.",
      };
    }

    const backupState = { backedUp: false };
    backupMarkdownIfNeeded(name, full, backupState);
    fs.writeFileSync(full, next, "utf8");
    scheduleCorpusRebuildAfterSave();
    scheduleWorkDocumentOrganizeIfReady(name, next);
    return {
      ok: true,
      executed: true,
      path: name,
      charsWritten: next.length,
      visibleChars: stripCorpusMetaFromMarkdown(next).trim().length,
    };
  } catch (e) {
    const message = String(e?.message || e);
    return {
      ok: false,
      error: message,
      hint: /find komt 0 keer voor/i.test(message)
        ? "Lees het document met read_corpus_markdown en gebruik een letterlijke find-string, of gebruik content voor volledige vervanging."
        : undefined,
    };
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

function hasMemoryWriteDeferral(reply) {
  const text = String(reply || "");
  if (!text.trim()) return false;
  return (
    /\bgeen\s+schrijfrecht(en)?\b.{0,220}\b(\.memory|memory|geheugen|long[-\s]?term)\b/is.test(text) ||
    /\bhuidige\s+tooling\b.{0,220}\b(long[-\s]?term\s+memory|\.memory|memory|geheugen)\b.{0,220}\b(niet|geen)\b.{0,120}\b(aanpassen|bijwerken|toevoegen|schrijven|vastleggen)\b/is.test(text) ||
    /\bkan\b.{0,100}\bniet\b.{0,120}\bzelf\b.{0,180}\b(\.memory|memory|geheugen|long[-\s]?term|toevoegen|bijschrijven|aanpassen)\b/is.test(text) ||
    /\bzodra\b.{0,160}\b(memory[-\s]?(wijzigingen|schrijf[-\s]?tools?)|schrijfrecht(en)?|write[-\s]?tools?)\b.{0,160}\b(toegestaan|beschikbaar|weer)\b/is.test(text) ||
    /\bhoort dit thuis in\b.{0,120}\bFiles\/\.memory\//i.test(text) ||
    /\bje kunt\b.{0,180}\b(één-op-één|een-op-een|plakken|zelf toevoegen|zelf aanmaken)\b/is.test(text)
  );
}

function memoryPathFromText(text) {
  const source = String(text || "");
  const m = /Files\/\.memory\/([^\s`"')\]}]+\.md)/i.exec(source);
  return m?.[1]?.replace(/\\/g, "/").replace(/^\/+/, "") || "";
}

function stripMemoryPermissionClaimsFromReply(reply) {
  const base = String(reply || "").trim();
  if (!base) return base;
  return base
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n/)
        .filter((line) => {
          const s = line.trim();
          if (!s) return true;
          if (/\bgeen\s+schrijfrecht(en)?\b.{0,160}\b(\.memory|memory|geheugen|long[-\s]?term)\b/i.test(s)) return false;
          if (/\bhuidige\s+tooling\b.{0,180}\b(long[-\s]?term\s+memory|\.memory|memory|geheugen)\b.{0,180}\b(niet|geen)\b.{0,100}\b(aanpassen|bijwerken|toevoegen|schrijven|vastleggen)\b/i.test(s)) {
            return false;
          }
          if (/\bkan\b.{0,80}\bniet\b.{0,80}\bzelf\b.{0,120}\b(\.memory|memory|geheugen|long[-\s]?term|toevoegen|bijschrijven)\b/i.test(s)) {
            return false;
          }
          if (/\bbinnen deze sessie\b.{0,120}\bgeen\b.{0,80}\bschrijfrecht(en)?\b/i.test(s)) return false;
          if (/\bvolgende sessie met schrijfrecht(en)?\b/i.test(s)) return false;
          if (/\bzodra\b.{0,160}\b(memory[-\s]?(wijzigingen|schrijf[-\s]?tools?)|schrijfrecht(en)?|write[-\s]?tools?)\b.{0,160}\b(toegestaan|beschikbaar|weer)\b/i.test(s)) return false;
          if (/\bhoort dit thuis in\b.{0,120}\bFiles\/\.memory\//i.test(s)) return false;
          if (/\bje kunt\b.{0,160}\b(één-op-één|een-op-een|plakken|zelf toevoegen|zelf aanmaken)\b/i.test(s)) return false;
          if (/\bik kan je wel\b.{0,160}\b(tekst|voorstel)\b.{0,80}\b(plakken|toevoegen)\b/i.test(s)) return false;
          return true;
        })
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function stripMemoryHousekeepingFromReply(reply, actions = []) {
  const base = stripMemoryPermissionClaimsFromReply(reply);
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

const NEXUS_RESEARCH_BASELINE_RULE =
  "In het eerste user-bericht staat een heuristische baseline: BM25-routekaarten voor corpus en memory, plus compacte e-mailmemory- en Actie-Kanban-snapshots (intern iOMS Kanban, niet externe tooling) en relevante secties uit het geopende document. " +
  "Behandel die baseline als verplichte eerste verkenning; antwoord niet alsof alleen het geopende document bestaat. " +
  "Verdiep proactief met tools wanneer de baseline onvolledig lijkt: read_corpus_outline/read_memory_outline + read_*_section voor gerichte corpus/memory-leesacties; opnieuw search_email_memory of search_kanban_tasks bij twijfel; Confluence-, web_search- of Outlook-tools wanneer de vraag actuele externe info, Confluence-inhoud, agenda/mail of live mailbox vereist. " +
  "Lees geen volledige bestanden als outline+section volstaan. Geef pas je finale JSON-antwoord wanneer corpus, memory, e-mailmemory en het interne Actie-Kanban voldoende zijn meegenomen voor de vraag. " +
  INTERNAL_KANBAN_DISAMBIGUATION_RULE;

function executeOnActiveObjectPromptBlock(name = "") {
  const ref = String(name || "");
  if (ref.startsWith("email-followup:")) {
    return (
      "## Verplichte actiemodus (Joost)\n" +
      "Joost heeft expliciet aangegeven dat je UITVOERBARE acties moet nemen op de actieve e-mailfollow-up, niet alleen advies in chat.\n" +
      "- Verwerk context/correcties via update_email_followup_context met het id uit de e-mailcontext.\n" +
      "- Maak een Outlook-reply-concept wanneer een antwoord nodig is; verzend nooit automatisch.\n" +
      "- Werk Kanban-koppelingen bij wanneer relevant.\n" +
      "Voer minstens één passende tool-actie uit wanneer de opdracht daarom vraagt. Beschrijf niet alleen wat je zou doen.\n\n---\n\n"
    );
  }
  if (ref.startsWith("kanban-task:")) {
    return (
      "## Verplichte actiemodus (Joost)\n" +
      "Joost heeft expliciet aangegeven dat je UITVOERBARE acties moet nemen op de actieve Kanban-taak, niet alleen advies in chat.\n" +
      "- Werk de taak bij via update_kanban_task, verplaats via move_kanban_task, koppel bronnen via link_kanban_source, of fuseer via merge_kanban_tasks wanneer passend.\n" +
      "- Plaats uitgebreide commentaar, analyse of voorbereidingsnotities via add_kanban_comment op de taak-id; gebruik summary alleen voor een korte taaksamenvatting, niet voor lange inhoud.\n" +
      "- Maak geen dubbele taak als er al een passende taak openstaat.\n" +
      "Voer minstens één passende Kanban-tool-actie uit wanneer de opdracht daarom vraagt.\n\n---\n\n"
    );
  }
  return (
    "## Verplichte actiemodus (Joost)\n" +
    "Joost heeft expliciet aangegeven dat je een concreet reviewvoorstel/wijziging in het geopende document moet opleveren, niet alleen uitleg in chat.\n" +
    "Lever documentwijzigingen via het reviewproces; beschrijf niet alleen wat je zou doen.\n\n---\n\n"
  );
}

function looksLikeCorpusMemoryWriteRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  const writeIntent =
    /\b(werk|werkt)\s+(dit\s+)?(bij|in)\b/.test(text) ||
    /\b(verwerk|vastleggen|leg vast|toevoegen|voeg toe|aanvullen|vul aan|bijwerken|bijschrijven|schrijf bij|update|maak aan|neem op|opslaan|sla op|onthoud)\b/.test(text) ||
    /\b(statusregel|actiepunt|timestamp|dossier|geheugen|corpus|notitie)\b/.test(text);
  const targetHint = /\b(dossier|document|bestand|notitie|corpus|geheugen|memory|long[-\s]?term|\.memory|overzicht\.md|\.md)\b/.test(text);
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
    ) ||
    /\b(we|wij|jullie|organisatie|bedrijf|team|managed services|service management)\b.{0,140}\b(iso\s*27001|iso\s*9001|gecertificeerd|certificering|audit|compliance|informatiebeveiliging)\b/.test(
      text,
    ) ||
    /\b(iso\s*27001|iso\s*9001|gecertificeerd|certificering)\b.{0,140}\b(kaders|processen|ingericht|managed services|sla|security|compliance|organisatie)\b/.test(
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

function looksLikeOutlookToolRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  const outlookSignal = /\b(outlook|agenda|kalender|calendar|2ndbrain)\b/.test(text);
  const actionSignal =
    /\b(plan|planning|plannen|verwerk|verwerken|zet|maak|aanmaken|schrijf|toevoegen|blok|focusblok|afspraak|afspraken|vul|vullen|aanvul|aanvullen)\b/.test(
      text,
    );
  return outlookSignal && actionSignal;
}

function isWeekPlan2ndbrainRequest(promptMacroId, message) {
  if (promptMacroId === "weekplan-2ndbrain") return true;
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  return looksLikeOutlookToolRequest(message) && /\b(2ndbrain|weekplan|week\s*vullen|focusblok(?:en)?)\b/.test(text);
}

function isMeetingReportRequest(promptMacroId, message) {
  if (promptMacroId === "meeting-report") return true;
  const text = String(message || "").toLowerCase();
  return (
    /\bgespreksverslag\b/.test(text) &&
    (/\btranscript\b/.test(text) || /\bmaak op basis van onderstaand\b/.test(text))
  );
}

/** Toolcontext vóór review-agent overslaan: transcript vult tokens en leidt tot lege changes. */
function shouldSkipAgentToolContext({ promptMacroId, message, markdown }) {
  if (isMeetingReportRequest(promptMacroId, message)) return true;
  if (!isEffectivelyEmptyDocumentMarkdown(markdown)) return false;
  const text = String(message || "").toLowerCase();
  return (
    /\b(gespreksverslag|transcript)\b/.test(text) ||
    /\b(vul|vullen|plaats|werk\s+uit)\b[\s\S]{0,120}\b(document|markdown|bestand|pagina)\b/.test(text)
  );
}

/** Plain-text sjabloon voor body van 2ndbrain-agenda-afspraken (macro + tool-prompts). */
function secondBrainEventBodyTemplateGuide() {
  return (
    "**Body van elke 2ndbrain-afspraak (verplicht)**\n\n" +
    "Subject = korte actie + dossier (max ~80 tekens). Alle detail, instructies en context in het **body**-veld (plain text, Nederlandse kopjes, geen emoji).\n\n" +
    "Gebruik dit sjabloon — vul elke sectie; laat een sectie alleen weg als de info echt onbekend is:\n\n" +
    "DOEL\n" +
    "Wat moet na dit blok af zijn? Eén concrete uitkomst.\n\n" +
    "INSTRUCTIES\n" +
    "1. Eerste concrete stap (open, lees, bel, schrijf, afstemmen).\n" +
    "2. Volgende stap.\n" +
    "(Max ~7 genummerde stappen; geen vage termen zoals 'verder werken' of 'oppakken'.)\n\n" +
    "ACHTERGROND\n" +
    "Waarom dit nu: deadline, klant/SLA-context, escalatie, afhankelijkheid van anderen, open pijnpunten uit mail of Kanban.\n\n" +
    "VERWACHTE OUTPUT\n" +
    "Concreet deliverable: wat is klaar (mail verstuurd, RCA af, deck klaar, ticket gesloten, besluit vastgelegd).\n\n" +
    "BRONNEN\n" +
    "Kanban-id + titel + nextAction; relevant mail-onderwerp/datum; document- of memory-pad; URL indien relevant.\n\n" +
    "KLAAR WANNEER\n" +
    "- Acceptatiecriterium 1\n" +
    "- Acceptatiecriterium 2\n" +
    "(Max 5 bullets; meetbaar waar mogelijk.)\n\n" +
    "Totaal body bij voorkeur 800–2500 tekens; INSTRUCTIES en VERWACHTE OUTPUT zijn het belangrijkst."
  );
}

function secondBrainEventBodyToolHint() {
  return (
    "Verplicht voor weekplan/2ndbrain: plain-text body met kopjes DOEL, INSTRUCTIES (genummerd), ACHTERGROND, VERWACHTE OUTPUT, BRONNEN, KLAAR WANNEER. " +
    "Subject blijft kort; alle stappen, context en deliverables in body. Geen emoji; concreet Nederlands."
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
    const resolved = resolveMemoryPathOnDisk(normalized.path);
    if (!resolved.ok) {
      return {
        ok: false,
        executed: false,
        action: normalized,
        error: formatMemoryPathResolutionError(resolved) || resolved.error,
        code: resolved.code,
        pathScope: resolved.pathScope,
        requestedPath: resolved.requestedPath,
        suggestions: resolved.suggestions,
        memorySuggestions: resolved.memorySuggestions,
        hint: resolved.hint,
      };
    }
    const targetPath = resolved.path;
    const full = memoryFullPath(targetPath);
    if (!full || !fs.existsSync(full)) {
      return { ok: false, executed: false, action: normalized, error: `Memory-bestand niet gevonden: ${targetPath}` };
    }
    if (!normalized.find) {
      return { ok: false, executed: false, action: normalized, error: "find ontbreekt voor update." };
    }
    let before = "";
    try {
      before = fs.readFileSync(full, "utf8");
      const next = applyPatchesToMarkdown(
        before,
        [{ find: normalized.find, replace: normalized.replace, replaceAll: false }],
        { patchLogRunId: runId, documentPath: targetPath },
      );
      if (next === before) {
        return {
          ok: true,
          executed: false,
          action: { ...normalized, path: targetPath },
          path: targetPath,
          kind: "update",
          message: "Geen wijziging: find/replace resulteerde in dezelfde inhoud.",
        };
      }
      const backupState = { backedUp: false };
      backupMarkdownIfNeeded(targetPath, full, backupState);
      fs.writeFileSync(full, next, "utf8");
      await runCorpusIndexRebuild("memory_update_corpus_markdown");
      return {
        ok: true,
        executed: true,
        action: { ...normalized, path: targetPath, rollbackContent: before },
        path: targetPath,
        requestedPath: resolved.requestedPath !== targetPath ? resolved.requestedPath : undefined,
        resolvedVia: resolved.resolvedVia !== "exact" ? resolved.resolvedVia : undefined,
        kind: "update",
        charsWritten: next.length,
      };
    } catch (e) {
      const message = String(e?.message || e);
      const patchMiss = /find komt 0 keer voor/i.test(message);
      return {
        ok: false,
        executed: false,
        action: { ...normalized, path: targetPath },
        path: targetPath,
        error: message,
        hint: patchMiss
          ? "Lees het doelbestand opnieuw met read_memory_markdown en gebruik een find-string die letterlijk in de huidige inhoud voorkomt."
          : undefined,
        preview: patchMiss ? before.slice(0, 1200) : undefined,
      };
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

function confluenceConfigPayload() {
  return buildConfluenceConfigPayload(process.env);
}

function confluenceHeaders() {
  return { Accept: "application/json" };
}

function confluencePageIdFromUrl(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const pageId = u.searchParams.get("pageId");
    if (pageId && /^\d+$/.test(pageId)) return pageId;
    const pathParts = u.pathname.split("/").filter(Boolean);
    for (let i = 0; i < pathParts.length; i += 1) {
      if ((pathParts[i] === "pages" || pathParts[i] === "content") && /^\d+$/.test(pathParts[i + 1] || "")) {
        return pathParts[i + 1];
      }
    }
    const numeric = pathParts.find((part) => /^\d{5,}$/.test(part));
    return numeric || "";
  } catch {
    return "";
  }
}

function decodeConfluenceDisplayPathPart(part) {
  try {
    return decodeURIComponent(String(part || "").replace(/\+/g, "%20")).trim();
  } catch {
    return String(part || "").replace(/\+/g, " ").trim();
  }
}

function confluenceDisplayPageFromUrl(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const pathParts = u.pathname.split("/").filter(Boolean);
    const displayIdx = pathParts.findIndex((part) => part.toLowerCase() === "display");
    if (displayIdx < 0) return null;
    const spaceKey = decodeConfluenceDisplayPathPart(pathParts[displayIdx + 1] || "");
    const title = pathParts
      .slice(displayIdx + 2)
      .map(decodeConfluenceDisplayPathPart)
      .join("/")
      .trim();
    if (!spaceKey || !title) return null;
    return { spaceKey, title };
  } catch {
    return null;
  }
}

function confluenceApiUrl(apiPath, params = {}) {
  if (!/^https?:\/\//i.test(CONFLUENCE_BASE_URL)) {
    throw new Error("CONFLUENCE_BASE_URL ontbreekt of is geen geldige http(s)-URL.");
  }
  const url = new URL(`${CONFLUENCE_BASE_URL}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim()) url.searchParams.set(key, String(value));
  }
  return url;
}

function confluenceAbsoluteUrl(link) {
  const raw = typeof link === "string" ? link.trim() : "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${CONFLUENCE_BASE_URL.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

function confluenceCqlString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function confluenceServiceReady() {
  primeBrowserCookieFromDisk();
  return Boolean(
    CONFLUENCE_BASE_URL &&
      (CONFLUENCE_PAT || getBrowserSyncedCookie() || browserSessionStatus().enabled),
  );
}

function confluenceNotReadyError() {
  return {
    ok: false,
    error:
      "Confluence-config ontbreekt. Zet CONFLUENCE_BASE_URL en koppel een browser-sessie (Open Edge / Browser-sessie) of CONFLUENCE_PAT.",
  };
}

async function searchConfluencePayload({ query, spaceKey, limit } = {}, runId = "—") {
  if (!confluenceServiceReady()) {
    return confluenceNotReadyError();
  }
  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) return { ok: false, error: "Zoekterm ontbreekt." };
  const max = Math.min(50, Math.max(1, Number(limit || 10) || 10));
  const space = String(spaceKey || "").trim();
  const escaped = confluenceCqlString(q);
  const parts = ["type = page", `(title ~ "${escaped}" OR text ~ "${escaped}")`];
  if (space) parts.push(`space = "${confluenceCqlString(space)}"`);
  const cql = `${parts.join(" AND ")} ORDER BY lastmodified DESC`;
  const timeout = AbortSignal.timeout(CONFLUENCE_TIMEOUT_MS);
  const apiUrl = confluenceApiUrl("/rest/api/content/search", {
    cql,
    limit: max,
    expand: "space,version",
  });
  try {
    const { response, bodyText, authError } = await confluenceFetch(apiUrl, { signal: timeout });
    if (authError) {
      return { ok: false, error: authError };
    }
    if (!response.ok) {
      return { ok: false, error: await readConfluenceJsonError(new Response(bodyText, { status: response.status })) };
    }
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return { ok: false, error: confluenceNonJsonError(response, bodyText, "Confluence search response") };
    }
    const results = Array.isArray(data?.results)
      ? data.results.map((item) => {
          const webui = typeof item?._links?.webui === "string" ? item._links.webui : "";
          const tinyui = typeof item?._links?.tinyui === "string" ? item._links.tinyui : "";
          return {
            id: String(item?.id || ""),
            type: String(item?.type || ""),
            status: String(item?.status || ""),
            title: String(item?.title || ""),
            space: {
              key: String(item?.space?.key || ""),
              name: String(item?.space?.name || ""),
            },
            version: {
              number: typeof item?.version?.number === "number" ? item.version.number : null,
              when: String(item?.version?.when || ""),
              by: String(item?.version?.by?.displayName || item?.version?.by?.username || ""),
            },
            url: confluenceAbsoluteUrl(webui || tinyui),
          };
        })
      : [];
    agentLog(runId, "confluence_search", {
      query: q,
      spaceKey: space,
      resultCount: results.length,
    });
    return {
      ok: true,
      query: q,
      spaceKey: space,
      cql,
      limit: max,
      size: typeof data?.size === "number" ? data.size : results.length,
      results,
    };
  } catch (e) {
    const aborted = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, error: aborted ? "Confluence zoeken duurde te lang." : String(e?.message || e) };
  }
}

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function confluenceStorageHtmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

let confluenceTurndown = null;

function confluenceNodeChildren(node) {
  return Array.from(node?.children || node?.childNodes || []).filter((child) => child && child.nodeType === 1);
}

function confluenceTableRows(tableNode) {
  if (typeof tableNode?.querySelectorAll === "function") {
    return Array.from(tableNode.querySelectorAll("tr"));
  }
  const out = [];
  const visit = (node) => {
    for (const child of confluenceNodeChildren(node)) {
      if (String(child.nodeName || "").toLowerCase() === "tr") out.push(child);
      visit(child);
    }
  };
  visit(tableNode);
  return out;
}

function confluenceTableCells(rowNode) {
  return confluenceNodeChildren(rowNode).filter((cell) => {
    const n = String(cell.nodeName || "").toLowerCase();
    return n === "td" || n === "th";
  });
}

function confluenceTableCellText(cellNode) {
  return decodeHtmlEntities(String(cellNode?.textContent || ""))
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function confluenceTableToMarkdown(tableNode) {
  const rows = confluenceTableRows(tableNode)
    .map((row) => confluenceTableCells(row).map(confluenceTableCellText))
    .filter((row) => row.length > 0);
  if (!rows.length) return "";
  const maxCols = Math.max(...rows.map((row) => row.length), 1);
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
  const firstRow = confluenceTableRows(tableNode)[0];
  const firstRowHasHeader = confluenceTableCells(firstRow).some(
    (cell) => String(cell.nodeName || "").toLowerCase() === "th",
  );
  const header = firstRowHasHeader ? normalized[0] : normalized[0].map((_, idx) => (idx === 0 ? " " : `Kolom ${idx + 1}`));
  const body = firstRowHasHeader ? normalized.slice(1) : normalized;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function htmlAttrEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlTextEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function confluenceMacroPlaceholderFromNode(node) {
  const name = node?.getAttribute?.("ac:name") || "confluence-macro";
  const originalStorage = String(node?.outerHTML || "");
  const encoded = Buffer.from(originalStorage, "utf8").toString("base64");
  const preview = decodeHtmlEntities(String(node?.textContent || ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return (
    `\n\n<div class="mv-confluence-macro" data-confluence-macro-name="${htmlAttrEscape(name)}" ` +
    `data-confluence-macro-b64="${encoded}" contenteditable="false">\n` +
    `<strong>Confluence macro: ${htmlTextEscape(name)}</strong>\n` +
    `<span>Dit blok is vergrendeld en wordt bij opslaan exact teruggezet in Confluence.</span>` +
    (preview ? `\n<small>${htmlTextEscape(preview)}</small>` : "") +
    `\n</div>\n\n`
  );
}

function restoreConfluenceMacrosInStorageHtml(html) {
  return String(html || "").replace(/<div\b[^>]*\bmv-confluence-macro\b[^>]*>[\s\S]*?<\/div>/gi, (block) => {
    const m = block.match(/\bdata-confluence-macro-b64=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const encoded = m?.[1] || m?.[2] || m?.[3] || "";
    if (!encoded) return block;
    try {
      return Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      return block;
    }
  });
}

function confluenceStorageHtmlToMarkdown(html) {
  if (!confluenceTurndown) {
    confluenceTurndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
    });
    confluenceTurndown.addRule("confluenceTables", {
      filter: "table",
      replacement(_content, node) {
        const md = confluenceTableToMarkdown(node);
        return md ? `\n\n${md}\n\n` : "\n\n";
      },
    });
    confluenceTurndown.addRule("confluenceStructuredMacro", {
      filter(node) {
        return typeof node?.nodeName === "string" && node.nodeName.toLowerCase() === "ac:structured-macro";
      },
      replacement(_content, node) {
        return confluenceMacroPlaceholderFromNode(node);
      },
    });
  }
  return confluenceTurndown.turndown(String(html || "")).replace(/\u00a0/g, " ").trim();
}

function markdownToConfluenceStorageHtml(markdown) {
  marked.setOptions({ gfm: true, breaks: false });
  return restoreConfluenceMacrosInStorageHtml(marked.parse(String(markdown || ""), { async: false }));
}

async function readConfluenceJsonError(response) {
  const text = await response.text().catch(() => "");
  if (!text) return `Confluence request mislukt (${response.status}).`;
  try {
    const data = JSON.parse(text);
    const msg = data?.message || data?.errorMessage || data?.error || text;
    return `Confluence request mislukt (${response.status}): ${truncStr(String(msg), 500)}`;
  } catch {
    return `Confluence request mislukt (${response.status}): ${truncStr(text, 500)}`;
  }
}

function confluenceBodySnippet(text) {
  return truncStr(
    decodeHtmlEntities(
      String(text || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
    500,
  );
}

function confluenceNonJsonError(response, bodyText, label = "Confluence response") {
  const contentType = response.headers?.get?.("content-type") || "";
  const location = response.headers?.get?.("location") || "";
  const parts = [
    `${label} was geen JSON`,
    `status ${response.status}`,
    contentType ? `content-type: ${contentType}` : "",
    location ? `redirect: ${location}` : "",
    confluenceBodySnippet(bodyText) ? `body: ${confluenceBodySnippet(bodyText)}` : "",
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}

async function fetchConfluencePagePayload({ pageId, url, expand } = {}, runId = "—") {
  if (!confluenceServiceReady()) {
    return confluenceNotReadyError();
  }
  const id = String(pageId || "").trim() || confluencePageIdFromUrl(url);
  const displayPage = id ? null : confluenceDisplayPageFromUrl(url);
  const expandValue =
    typeof expand === "string" && expand.trim()
      ? expand.trim()
      : "body.storage,version,space,ancestors,_links";
  if ((!id || !/^\d+$/.test(id)) && !displayPage) {
    return {
      ok: false,
      error:
        "Geef een numerieke Confluence pageId, een URL waarin pageId voorkomt, of een /display/{spaceKey}/{paginatitel}-URL.",
    };
  }
  const apiUrl = id
    ? confluenceApiUrl(`/rest/api/content/${encodeURIComponent(id)}`, { expand: expandValue })
    : confluenceApiUrl("/rest/api/content", {
        spaceKey: displayPage.spaceKey,
        title: displayPage.title,
        type: "page",
        expand: expandValue,
      });
  try {
    const { response, bodyText, authError } = await confluenceFetch(apiUrl, {
      signal: AbortSignal.timeout(CONFLUENCE_TIMEOUT_MS),
    });
    if (authError) {
      return { ok: false, error: authError };
    }
    if (!response.ok) {
      return { ok: false, error: await readConfluenceJsonError(new Response(bodyText, { status: response.status })) };
    }
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      return { ok: false, error: confluenceNonJsonError(response, bodyText) };
    }
    if (!id) {
      const results = Array.isArray(data?.results) ? data.results : [];
      if (!results.length) {
        return {
          ok: false,
          error: `Confluence-pagina niet gevonden voor space "${displayPage.spaceKey}" en titel "${displayPage.title}".`,
        };
      }
      data = results[0];
    }
    const storageHtml = typeof data?.body?.storage?.value === "string" ? data.body.storage.value : "";
    const text = confluenceStorageHtmlToText(storageHtml);
    const markdown = confluenceStorageHtmlToMarkdown(storageHtml);
    const webui = typeof data?._links?.webui === "string" ? data._links.webui : "";
    const tinyui = typeof data?._links?.tinyui === "string" ? data._links.tinyui : "";
    const pageUrl = webui
      ? `${CONFLUENCE_BASE_URL}${webui.startsWith("/") ? webui : `/${webui}`}`
      : tinyui
        ? `${CONFLUENCE_BASE_URL}${tinyui.startsWith("/") ? tinyui : `/${tinyui}`}`
        : "";
    const payload = {
      ok: true,
      id: String(data?.id || id),
      type: typeof data?.type === "string" ? data.type : "",
      status: typeof data?.status === "string" ? data.status : "",
      title: typeof data?.title === "string" ? data.title : "",
      space: {
        key: typeof data?.space?.key === "string" ? data.space.key : "",
        name: typeof data?.space?.name === "string" ? data.space.name : "",
      },
      version: {
        number: typeof data?.version?.number === "number" ? data.version.number : null,
        when: typeof data?.version?.when === "string" ? data.version.when : "",
        by: typeof data?.version?.by?.displayName === "string" ? data.version.by.displayName : "",
      },
      ancestors: Array.isArray(data?.ancestors)
        ? data.ancestors.map((a) => ({ id: String(a?.id || ""), title: String(a?.title || "") })).filter((a) => a.id || a.title)
        : [],
      url: pageUrl,
      storageHtml: truncStr(storageHtml, CONFLUENCE_PAGE_MAX_CHARS),
      text: truncStr(text, CONFLUENCE_PAGE_MAX_CHARS),
      markdown: truncStr(markdown, CONFLUENCE_PAGE_MAX_CHARS),
      truncated:
        storageHtml.length > CONFLUENCE_PAGE_MAX_CHARS ||
        text.length > CONFLUENCE_PAGE_MAX_CHARS ||
        markdown.length > CONFLUENCE_PAGE_MAX_CHARS,
    };
    agentLog(runId, "confluence_page_fetch", {
      pageId: payload.id,
      title: truncStr(payload.title, 240),
      chars: payload.text.length,
      truncated: payload.truncated,
    });
    return payload;
  } catch (e) {
    const aborted = e?.name === "AbortError" || e?.name === "TimeoutError";
    return {
      ok: false,
      error: aborted ? "Confluence ophalen duurde te lang." : String(e?.message || e),
    };
  }
}

async function updateConfluencePageFromMarkdown({ pageId, title, baseVersion, markdown } = {}, runId = "—") {
  if (!confluenceServiceReady()) {
    return confluenceNotReadyError();
  }
  const id = String(pageId || "").trim();
  if (!id || !/^\d+$/.test(id)) {
    return { ok: false, error: "Numerieke Confluence pageId ontbreekt." };
  }
  if (typeof markdown !== "string") {
    return { ok: false, error: "Markdown-inhoud ontbreekt." };
  }

  const latest = await fetchConfluencePagePayload({ pageId: id, expand: "version,space,_links" }, runId);
  if (!latest.ok) return latest;
  const latestVersion = Number(latest.version?.number || 0);
  const expectedVersion = Number(baseVersion || 0);
  if (expectedVersion > 0 && latestVersion > 0 && latestVersion !== expectedVersion) {
    return {
      ok: false,
      conflict: true,
      error: `Confluence-pagina is intussen gewijzigd. Lokale basisversie ${expectedVersion}, actuele versie ${latestVersion}. Importeer opnieuw voordat je opslaat.`,
      currentVersion: latestVersion,
    };
  }

  const nextVersion = Math.max(latestVersion, expectedVersion) + 1;
  const pageTitle = typeof title === "string" && title.trim() ? title.trim() : latest.title || `Confluence ${id}`;
  const apiUrl = confluenceApiUrl(`/rest/api/content/${encodeURIComponent(id)}`);
  const { response, bodyText, authError } = await confluenceFetch(apiUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
      type: "page",
      title: pageTitle,
      version: { number: nextVersion },
      body: {
        storage: {
          value: markdownToConfluenceStorageHtml(markdown),
          representation: "storage",
        },
      },
    }),
    signal: AbortSignal.timeout(CONFLUENCE_TIMEOUT_MS),
  });
  if (authError) {
    return { ok: false, error: authError };
  }
  if (response.status === 409) {
    return {
      ok: false,
      conflict: true,
      error: "Confluence weigerde opslaan door een versieconflict. Importeer opnieuw en probeer daarna opnieuw.",
    };
  }
  if (!response.ok) {
    return { ok: false, error: await readConfluenceJsonError(new Response(bodyText, { status: response.status })) };
  }
  let data = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = {};
  }
  const savedVersion = typeof data?.version?.number === "number" ? data.version.number : nextVersion;
  agentLog(runId, "confluence_page_update", {
    pageId: id,
    title: truncStr(pageTitle, 240),
    version: savedVersion,
    markdownChars: markdown.length,
  });
  return {
    ok: true,
    id,
    title: pageTitle,
    version: savedVersion,
    url: latest.url || "",
  };
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

function debugLogRelativePath(full) {
  const rel = path.relative(MARKDOWN_DIR, full).replace(/\\/g, "/");
  return rel && !rel.startsWith("..") ? rel : full;
}

function ensureNexusDebugLogs() {
  ensureParentDir(NEXUS_ERROR_LOG_PATH);
  ensureParentDir(NEXUS_FIX_LOG_PATH);
  if (!fs.existsSync(NEXUS_ERROR_LOG_PATH)) {
    fs.writeFileSync(
      NEXUS_ERROR_LOG_PATH,
      [
        "# Nexus errorlog",
        "",
        "Automatisch logboek voor fouten, toolproblemen, user-ontevredenheid en testbevindingen.",
        "Cursor kan dit bestand uitlezen om oorzaken te identificeren en fixes te implementeren.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  if (!fs.existsSync(NEXUS_FIX_LOG_PATH)) {
    fs.writeFileSync(
      NEXUS_FIX_LOG_PATH,
      [
        "# Nexus fixlog",
        "",
        "Cursor noteert hier fixes, oorzaken en verificatie-instructies.",
        "Nexus kan deze instructies lezen, tests uitvoeren en bevindingen terugschrijven naar het errorlog.",
        "",
        "## Open verificaties",
        "",
        "- Geen open verificaties.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function readNexusDebugLog(kind) {
  ensureNexusDebugLogs();
  const full = kind === "fix" ? NEXUS_FIX_LOG_PATH : NEXUS_ERROR_LOG_PATH;
  return { ok: true, kind, path: debugLogRelativePath(full), content: fs.readFileSync(full, "utf8") };
}

function appendNexusDebugMarkdown(kind, markdown) {
  ensureNexusDebugLogs();
  const full = kind === "fix" ? NEXUS_FIX_LOG_PATH : NEXUS_ERROR_LOG_PATH;
  const text = String(markdown || "").trim();
  if (!text) return { ok: false, error: "Lege log-entry.", path: debugLogRelativePath(full) };
  fs.appendFileSync(full, `\n\n${text}\n`, "utf8");
  return { ok: true, path: debugLogRelativePath(full), charsWritten: text.length };
}

function isNexusVerifiedStatus(status) {
  return /\b(geverifieerd|opgelost|succesvol|fixed|verified|resolved)\b/i.test(String(status || ""));
}

function removeNexusDebugSections(full, predicate) {
  ensureParentDir(full);
  if (!fs.existsSync(full)) return { path: debugLogRelativePath(full), removed: 0, remaining: 0 };
  const raw = fs.readFileSync(full, "utf8");
  const matches = [...raw.matchAll(/^## .*(?:\r?\n|$)/gm)];
  if (!matches.length) {
    return { path: debugLogRelativePath(full), removed: 0, remaining: raw.trim() ? 1 : 0 };
  }

  const preamble = raw.slice(0, matches[0].index || 0).trim();
  const sections = matches.map((m, idx) => {
    const start = m.index || 0;
    const end = idx + 1 < matches.length ? matches[idx + 1].index || raw.length : raw.length;
    return raw.slice(start, end).trim();
  });
  const kept = [];
  let removed = 0;
  for (const section of sections) {
    if (predicate(section)) {
      removed += 1;
    } else {
      kept.push(section);
    }
  }

  const next = kept.length ? [preamble, ...kept].filter(Boolean).join("\n\n").trim() + "\n" : "";
  fs.writeFileSync(full, next, "utf8");
  return { path: debugLogRelativePath(full), removed, remaining: kept.length };
}

function cleanupNexusDebugIssue(input = {}) {
  ensureNexusDebugLogs();
  const errorId = String(input.errorId || "").trim();
  if (!errorId) return { ok: false, error: "errorId ontbreekt." };
  const escaped = errorId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const errorIdPattern = new RegExp(`\\b${escaped}\\b`);
  const error = removeNexusDebugSections(NEXUS_ERROR_LOG_PATH, (section) => errorIdPattern.test(section));
  const fix = removeNexusDebugSections(NEXUS_FIX_LOG_PATH, (section) => errorIdPattern.test(section));
  return {
    ok: true,
    errorId,
    removed: {
      error: error.removed,
      fix: fix.removed,
    },
    remaining: {
      error: error.remaining,
      fix: fix.remaining,
    },
    paths: {
      error: error.path,
      fix: fix.path,
    },
  };
}

function appendNexusErrorLogEntry(input = {}) {
  const ts = new Date().toISOString();
  const id = input.id || `nexus-error-${ts.replace(/[:.]/g, "-")}`;
  const lines = [
    `## ${ts} — ${input.title || "Nexus foutmelding"}`,
    "",
    `- id: ${id}`,
    "- status: open",
    `- runId: ${input.runId || "onbekend"}`,
    `- component: ${input.component || "nexus"}`,
    `- tool: ${input.tool || "n.v.t."}`,
    `- context: ${input.context || "onbekend"}`,
    "",
    "### Opdracht",
    input.command || "(niet vastgelegd)",
    "",
    "### Foutmelding",
    input.error || "(geen foutmelding vastgelegd)",
    "",
    "### Technische context",
    "```json",
    JSON.stringify(input.detail || {}, null, 2).slice(0, 8000),
    "```",
    "",
    "### Verwachte samenwerking",
    "Cursor: analyseer oorzaak, implementeer fix en schrijf verificatie-instructies in `Files/.nexus-debug/fixlog.md`.",
    "Nexus: lees daarna de fixlog, voer de verificatie uit en schrijf bevindingen terug in dit errorlog.",
  ];
  return appendNexusDebugMarkdown("error", lines.join("\n"));
}

function appendNexusFixLogEntry(input = {}) {
  const ts = new Date().toISOString();
  const status = input.status || "te verifieren";
  const lines = [
    `## ${ts} — ${input.title || "Fixnotitie"}`,
    "",
    `- errorId: ${input.errorId || "onbekend"}`,
    `- status: ${status}`,
    "",
    "### Oorzaak",
    input.cause || "(nog niet ingevuld)",
    "",
    "### Geimplementeerde fix",
    input.fix || "(nog niet ingevuld)",
    "",
    "### Verificatie-instructies voor Nexus",
    input.verification || "(nog niet ingevuld)",
  ];
  const appended = appendNexusDebugMarkdown("fix", lines.join("\n"));
  if (appended.ok && input.errorId && isNexusVerifiedStatus(status)) {
    return { ...appended, cleanup: cleanupNexusDebugIssue({ errorId: input.errorId }) };
  }
  return appended;
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
      modelRouter: data.modelRouter && typeof data.modelRouter === "object" ? data.modelRouter : undefined,
    };
  } catch (e) {
    console.error(`[agent-config] Kon ${configPath} niet parsen:`, e?.message || e);
    return null;
  }
}

function mergeAgentConfigLayers(/* layers: oldest first, later wins for non-empty */ ...layers) {
  const out = { apiKey: "", endpoint: "", model: "", modelRouter: undefined };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.apiKey.trim()) out.apiKey = layer.apiKey;
    if (layer.endpoint.trim()) out.endpoint = layer.endpoint;
    if (layer.model.trim()) out.model = layer.model;
    if (layer.modelRouter && typeof layer.modelRouter === "object") out.modelRouter = layer.modelRouter;
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

function emailAgentSecondBrainContext(mail, folder) {
  const query = [
    mail?.subject || "",
    folder,
    mail?.senderEmail || mail?.senderName || "",
    mail?.to || "",
    String(mail?.bodySnippet || "").slice(0, 1600),
  ]
    .filter(Boolean)
    .join("\n");
  if (!query.trim()) return "";
  try {
    const workingManifest = readManifest(MARKDOWN_DIR, { scope: "working" });
    const memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
    const parts = [];
    if (workingManifest?.entries?.length) {
      const ctx = buildCorpusAskContext(MARKDOWN_DIR, workingManifest, query, {
        includeFragments: false,
        maxDocs: 6,
        maxChars: 4500,
      });
      if (ctx?.markdownBlob?.trim()) {
        parts.push(`## Relevante werkdocumenten\n\n${ctx.markdownBlob.trim()}`);
      }
    }
    if (memoryManifest?.entries?.length) {
      const ctx = buildCorpusAskContext(MARKDOWN_DIR, memoryManifest, query, {
        includeFragments: false,
        sourceRootDir: MEMORY_DIR,
        indexDir: MEMORY_INDEX_DIR,
        maxDocs: 8,
        maxChars: 5500,
      });
      if (ctx?.markdownBlob?.trim()) {
        parts.push(`## Relevante long-term memory\n\n${ctx.markdownBlob.trim()}`);
      }
    }
    return truncStr(parts.join("\n\n---\n\n"), 10000);
  } catch (e) {
    agentLog("—", "email_agent_context_error", { error: String(e?.message || e) });
    return "";
  }
}

async function classifyEmailForEmailAgent({ mail, folder, runId }) {
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) {
    throw new Error("Agentconfig ontbreekt voor e-mailclassificatie.");
  }
  const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
  const payload = {
    direction: folder === "sent" ? "outgoing" : "incoming",
    folder,
    metadata: {
      subject: mail?.subject || "",
      from: mail?.senderEmail || mail?.senderName || "",
      to: mail?.to || "",
      cc: mail?.cc || "",
      receivedTime: mail?.receivedTime || "",
      sentOn: mail?.sentOn || "",
      unread: mail?.unread === true,
      importance: mail?.importance ?? null,
      categories: mail?.categories || "",
      hasAttachments: mail?.hasAttachments === true,
    },
    bodySnippet: String(mail?.bodySnippet || "").slice(0, 8000),
    secondBrainContext: emailAgentSecondBrainContext(mail, folder),
  };
  const llmResult = await fetchLlmTextWithRetry(
    url,
    {
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
              "Je classificeert Outlook e-mails voor een persoonlijke Second Brain e-mailagent. " +
              "Sla nooit volledige mailbody op; extraheer alleen afgeleide samenvatting, actiepunten en metadata. " +
              "Bepaal of de e-mail relevant is en of Joost actie moet ondernemen. " +
              "Als Joost alleen in CC staat en niet in Aan/To, dan is requiresAction altijd false en relevant meestal false (CC is ter informatie). " +
              "Zet requiresAction alleen op true bij een duidelijke persoonlijke actie/vraag aan Joost (beantwoorden, beslissen, akkoord geven, iets opleveren). " +
              "Automatische meldingen (Confluence, JIRA-updates, agenda-acceptaties/-afwijzingen, noreply, nieuwsbrieven, Recruitee/iO-notificaties, Teams/Planner) krijgen requiresAction=false; relevant=true alleen als het nuttig kan zijn voor projectgeheugen (bijv. Confluence/JIRA), anders relevant=false. " +
              "Gebruik de meegegeven Second Brain-context om te bepalen bij welk bestaand project, dossier, klant, persoon of werkwijze de mail hoort. " +
              "Gebruik relatedMemory uitsluitend voor bestaande, herkenbare context uit die Second Brain-context; verzin geen dossiernamen. " +
              "Formuleer importanceReason en action altijd concreet wanneer relevant=true; laat deze velden niet leeg. " +
              "Geef uitsluitend JSON terug met deze velden: " +
              "{relevant:boolean, category:string, requiresAction:boolean, priority:'laag'|'middel'|'hoog', " +
              "summary:string, keyPoints:string[], action:string, deadline:string, tags:string[], " +
              "relatedMemory:string[], importanceReason:string, confidence:'low'|'medium'|'high', classifier:string}. " +
              "Gebruik Nederlands. Markeer nieuwsbrieven/ruis zonder actie meestal als relevant=false.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    },
    {
      runId,
      logPrefix: "email_agent_llm",
      logFields: { folder, subject: truncStr(mail?.subject || "", 160) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  return parseAgentJsonResponse(content);
}

async function classifyDocumentForCorpusOrganizer({ content, relPath, manifest, routingRules, heuristic, runId }) {
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) {
    throw new Error("Agentconfig ontbreekt voor corpus-classificatie.");
  }
  const url = `${config.endpoint.replace(/\/+$/, "")}/chat/completions`;
  const similar = scoreEntriesForQuestion(String(content || "").slice(0, 2000), manifest || { entries: [] })
    .filter((row) => row.entry?.path && row.entry.path !== relPath && !row.entry.isRedirect)
    .slice(0, 8)
    .map((row) => ({
      path: row.entry.path,
      title: row.entry.title,
      preview: String(row.entry.preview || "").slice(0, 120),
      score: row.score,
    }));
  const payload = {
    relPath,
    titleHint: path.basename(relPath, ".md"),
    bodySnippet: String(content || "").slice(0, 6000),
    heuristic,
    routingFolders: (routingRules?.folders || []).map((f) => ({
      prefix: f.prefix,
      purpose: f.purpose,
      keywords: (f.keywords || []).slice(0, 12),
    })),
    similarDocuments: similar,
  };
  const llmResult = await fetchLlmTextWithRetry(
    url,
    {
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
              "Je classificeert Markdown-werkdocumenten voor een persoonlijke kennisbank (iOMS Files/). " +
              "Kies het beste doelpad binnen de bestaande mappenstructuur. Gebruik routingFolders als leidraad. " +
              "Geef uitsluitend JSON: {targetPath:string, confidence:number (0-1), rationale:string, topics:string[], classifier:'llm'}. " +
              "targetPath moet eindigen op .md, relatief aan Files/, zonder leading slash. " +
              "Voor projecten: 02-projecten/<project>/<Bestandsnaam>.md. " +
              "Gebruik underscore-naamgeving voor bestanden. " +
              "confidence >= 0.85 alleen bij duidelijke match.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    },
    {
      runId,
      logPrefix: "corpus_organizer_llm",
      logFields: { path: truncStr(relPath, 120) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const parsed = parseAgentJsonResponse(normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim());
  return { ...parsed, classifier: "llm" };
}

function normalizeEmailAgentMemoryPath(raw) {
  const value = String(raw || "")
    .replace(/^Files\/\.memory\//i, "")
    .replace(/^\.memory\//i, "")
    .trim();
  const safe = safeMemoryMarkdownPath(value);
  if (!safe) return "";
  if (/^email-agent\//i.test(safe)) return "";
  return safe;
}

function emailAgentMemoryCandidates(classification) {
  const related = Array.isArray(classification?.relatedMemory) ? classification.relatedMemory : [];
  const out = [];
  for (const raw of related) {
    const pathName = normalizeEmailAgentMemoryPath(raw);
    if (!pathName || out.some((item) => item.path === pathName)) continue;
    const full = memoryFullPath(pathName);
    if (!full || !fs.existsSync(full)) continue;
    let preview = "";
    try {
      preview = fs.readFileSync(full, "utf8").slice(0, 1400);
    } catch {
      preview = "";
    }
    out.push({ path: pathName, preview });
  }
  return out.slice(0, 6);
}

function emailAgentMemorySignalMarkdown(event) {
  const tags = Array.isArray(event.tags) && event.tags.length ? ` Tags: ${event.tags.join(", ")}.` : "";
  const action = event.requiresAction && event.action ? ` Actie: ${event.action}` : "";
  return `- ${event.mailDate || event.processedAt} · ${event.direction} · **${event.subject || "(geen onderwerp)"}** — ${event.summary || ""}${action}${tags} <!-- ${event.messageKey} -->`;
}

function appendEmailSignalToMemory(pathName, event) {
  const full = memoryFullPath(pathName);
  if (!full || !fs.existsSync(full)) return { changed: false, error: `Memory-bestand niet gevonden: ${pathName}` };
  const signal = emailAgentMemorySignalMarkdown(event);
  let content = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
  if (content.includes(event.messageKey)) return { changed: false, path: pathName };
  const heading = "## E-mailsignalen";
  if (!content.includes(heading)) {
    content = `${content.trimEnd()}\n\n${heading}\n\n${signal}\n`;
  } else {
    content = content.replace(heading, `${heading}\n\n${signal}`);
  }
  content = content.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${JSON.stringify(new Date().toISOString())}`);
  fs.writeFileSync(full, content, "utf8");
  return { changed: true, path: pathName };
}

function appendEmailDigestSignal(memoryDir, digestPath, event) {
  const full = path.join(memoryDir, digestPath);
  ensureParentDir(full);
  const month = String(digestPath.match(/(\d{4}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 7));
  const header =
    "---\n" +
    "type: email-agent-digest\n" +
    "owner: agent\n" +
    `period: ${JSON.stringify(month)}\n` +
    `updatedAt: ${JSON.stringify(new Date().toISOString())}\n` +
    "confidence: medium\n" +
    "---\n\n" +
    `# E-maildigest ${month}\n\n` +
    "Compact overzicht van relevante e-mailsignalen. Volledige e-mailbody blijft in Outlook.\n";
  if (!fs.existsSync(full)) fs.writeFileSync(full, header, "utf8");
  let content = fs.readFileSync(full, "utf8");
  if (content.includes(event.messageKey)) return { changed: false, path: digestPath };
  content = `${content.trimEnd()}\n\n${emailAgentMemorySignalMarkdown(event)}\n`;
  content = content.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${JSON.stringify(new Date().toISOString())}`);
  fs.writeFileSync(full, content, "utf8");
  return { changed: true, path: digestPath };
}

function emailAgentDigestPathForDate(value = new Date().toISOString()) {
  const d = new Date(value || Date.now());
  const safe = Number.isFinite(d.getTime()) ? d : new Date();
  const month = `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}`;
  return `email-agent/digests/${month}.md`;
}

function appendEmailUserContextMemory(notification, previousContext = "") {
  const userContext = String(notification?.userContext || "").trim();
  if (!userContext || userContext === String(previousContext || "").trim()) return { changed: false };
  const updatedAt = notification?.userContextUpdatedAt || new Date().toISOString();
  const digestPath = emailAgentDigestPathForDate(notification?.mailDate || updatedAt);
  const eventId = `user-context:${notification?.id || notification?.messageKey || ""}:${updatedAt}`;
  const event = {
    version: 1,
    type: "email-agent-user-context",
    processedAt: updatedAt,
    mailDate: notification?.mailDate || "",
    messageKey: notification?.messageKey || "",
    notificationId: notification?.id || "",
    subject: notification?.subject || notification?.title || "",
    from: notification?.from || "",
    to: notification?.to || "",
    folder: notification?.folder || "",
    direction: notification?.direction || "",
    userContext,
    digestPath,
  };
  const eventFile = path.join(MEMORY_DIR, "system", `email-agent-events-${digestPath.match(/(\d{4}-\d{2})/)?.[1] || updatedAt.slice(0, 7)}.jsonl`);
  ensureParentDir(eventFile);
  fs.appendFileSync(eventFile, `${JSON.stringify(event)}\n`, "utf8");

  const digestFull = path.join(MEMORY_DIR, digestPath);
  ensureParentDir(digestFull);
  if (!fs.existsSync(digestFull)) {
    const month = digestPath.match(/(\d{4}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 7);
    fs.writeFileSync(
      digestFull,
      "---\n" +
        "type: email-agent-digest\n" +
        "owner: agent\n" +
        `period: ${JSON.stringify(month)}\n` +
        `updatedAt: ${JSON.stringify(updatedAt)}\n` +
        "confidence: medium\n" +
        "---\n\n" +
        `# E-maildigest ${month}\n\n` +
        "Compact overzicht van relevante e-mailsignalen. Volledige e-mailbody blijft in Outlook.\n",
      "utf8",
    );
  }
  let content = fs.readFileSync(digestFull, "utf8");
  if (content.includes(eventId)) return { changed: false, digestPath };
  const line = `- ${updatedAt} · gebruikerscontext · **${notification?.subject || notification?.title || "(geen onderwerp)"}** — ${userContext.replace(/\s+/g, " ")} <!-- ${eventId} -->`;
  content = `${content.trimEnd()}\n\n${line}\n`;
  content = content.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${JSON.stringify(updatedAt)}`);
  fs.writeFileSync(digestFull, content, "utf8");
  return { changed: true, digestPath };
}

function normalizeEmailContextInterpretation(raw, notification, userContext) {
  const o = raw && typeof raw === "object" ? raw : {};
  const priority = ["laag", "middel", "hoog"].includes(o.priority) ? o.priority : notification?.priority || "middel";
  return {
    summary:
      typeof o.summary === "string" && o.summary.trim()
        ? truncStr(o.summary.trim(), 900)
        : notification?.summary || "",
    importanceReason:
      typeof o.importanceReason === "string" && o.importanceReason.trim()
        ? truncStr(o.importanceReason.trim(), 500)
        : notification?.importanceReason || "",
    action: typeof o.action === "string" ? truncStr(o.action.trim(), 500) : notification?.action || "",
    requiresAction: typeof o.requiresAction === "boolean" ? o.requiresAction : notification?.requiresAction === true,
    priority,
    tags: Array.isArray(o.tags)
      ? o.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 10)
      : Array.isArray(notification?.tags)
        ? notification.tags
        : [],
    processedUserContext: [
      String(notification?.processedUserContext || "").trim(),
      `<!-- ${new Date().toISOString()} – gebruikerscontext verwerkt -->\n${userContext}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

async function reinterpretEmailNotificationWithUserContext({ notification, userContext, memoryMarkdown = "", runId }) {
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) {
    throw new Error("Agentconfig ontbreekt voor e-mailherinterpretatie.");
  }
  const secondBrainContext = emailAgentSecondBrainContext(
    {
      subject: notification?.subject || "",
      senderEmail: notification?.from || "",
      to: notification?.to || "",
      bodySnippet: [
        notification?.summary || "",
        notification?.importanceReason || "",
        notification?.action || "",
        notification?.processedUserContext || "",
        userContext,
      ].join("\n").slice(0, 3000),
    },
    notification?.folder || "inbox",
  );
  const llmResult = await fetchLlmTextWithRetry(
    `${config.endpoint.replace(/\/+$/, "")}/chat/completions`,
    {
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
              "Je herinterpreteert een bestaande e-mailagent-notificatie nadat Joost extra context/correctie heeft gegeven. " +
              "Behandel userContext als expliciete menselijke feedback die zwaarder weegt dan de eerdere automatische inschatting. " +
              "Werk alleen afgeleide velden bij; sla geen volledige mailbody op. " +
              "Maak summary, importanceReason en action concreet en consistent met Joosts context. " +
              "Geef uitsluitend JSON terug met: {summary:string, importanceReason:string, action:string, requiresAction:boolean, priority:'laag'|'middel'|'hoog', tags:string[]}. Gebruik Nederlands.",
          },
          {
            role: "user",
            content: JSON.stringify({
              notification,
              userContext,
              processedUserContext: notification?.processedUserContext || "",
              emailMemoryNote: memoryMarkdown,
              secondBrainContext,
            }),
          },
        ],
      }),
    },
    {
      runId,
      logPrefix: "email_context_reinterpret_llm",
      logFields: { notificationId: notification?.id || "", subject: truncStr(notification?.subject || "", 160) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  return normalizeEmailContextInterpretation(parseAgentJsonResponse(content), notification, userContext);
}

async function processEmailNotificationUserContext({ notificationId, userContext, runId }) {
  const submittedUserContext = String(userContext || "").trim();
  if (!submittedUserContext) return { ok: false, error: "Context ontbreekt." };
  const beforePayload = emailAgent.getNotification(notificationId);
  const before = beforePayload?.notification || null;
  if (!before) return { ok: false, error: "Notificatie niet gevonden." };
  const reinterpretation = await reinterpretEmailNotificationWithUserContext({
    notification: before,
    userContext: submittedUserContext,
    memoryMarkdown: beforePayload?.memoryMarkdown || "",
    runId,
  });
  const contextNotification = {
    ...before,
    ...reinterpretation,
    userContext: submittedUserContext,
    userContextUpdatedAt: new Date().toISOString(),
  };
  const memoryResult = appendEmailUserContextMemory(contextNotification, before?.userContext || "");
  const payload = emailAgent.updateNotification(notificationId, {
    ...reinterpretation,
    userContext: "",
  });
  agentLog(runId, "email_context_reinterpreted", {
    notificationId: before.id,
    subject: truncStr(before.subject || before.title || "", 200),
    requiresAction: reinterpretation.requiresAction,
    priority: reinterpretation.priority,
    memoryChanged: memoryResult.changed === true,
  });
  return { ...payload, memoryResult };
}

async function decideEmailMemoryTarget({ event, classification, runId }) {
  const candidates = emailAgentMemoryCandidates(classification);
  if (!candidates.length) return { targetPath: "", reason: "Geen bestaande relatedMemory kandidaat." };
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) {
    return { targetPath: candidates[0].path, reason: "Fallback: eerste bestaande relatedMemory kandidaat." };
  }
  const llmResult = await fetchLlmTextWithRetry(
    `${config.endpoint.replace(/\/+$/, "")}/chat/completions`,
    {
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
              "Je beslist of een afgeleid e-mailsignaal duurzaam in een bestaand Second Brain memory-document moet worden verwerkt. " +
              "Kies alleen een targetPath uit candidates als het signaal echt bij dat bestaande dossier/persoon/werkwijze hoort. " +
              "Bij twijfel: digestOnly=true. Geef uitsluitend JSON: {digestOnly:boolean,targetPath:string,reason:string}.",
          },
          { role: "user", content: JSON.stringify({ event, candidates }) },
        ],
      }),
    },
    {
      runId,
      logPrefix: "email_memory_merge_llm",
      logFields: { subject: truncStr(event?.subject || "", 160) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  const parsed = parseAgentJsonResponse(content);
  const targetPath = normalizeEmailAgentMemoryPath(parsed?.targetPath);
  if (parsed?.digestOnly === true || !targetPath || !candidates.some((item) => item.path === targetPath)) {
    return { targetPath: "", reason: typeof parsed?.reason === "string" ? parsed.reason : "Digest-only." };
  }
  return { targetPath, reason: typeof parsed?.reason === "string" ? parsed.reason : "" };
}

async function processEmailMemoryForEmailAgent({ event, classification, digestPath, runId }) {
  if (!event?.relevant) return { changed: false, updates: [], digestPath };
  let decision = { targetPath: "", reason: "Digest-only fallback." };
  try {
    decision = await decideEmailMemoryTarget({ event, classification, runId });
  } catch (e) {
    agentLog(runId, "email_memory_merge_decision_failed", {
      subject: truncStr(event?.subject || "", 160),
      error: String(e?.message || e),
    });
  }
  if (decision.targetPath) {
    const update = appendEmailSignalToMemory(decision.targetPath, event);
    return {
      changed: update.changed === true,
      updates: [{ kind: "memory", path: decision.targetPath, changed: update.changed === true, reason: decision.reason }],
      digestPath,
    };
  }
  const digest = appendEmailDigestSignal(MEMORY_DIR, digestPath, event);
  return {
    changed: digest.changed === true,
    updates: [{ kind: "digest", path: digestPath, changed: digest.changed === true, reason: decision.reason }],
    digestPath,
  };
}

function kanbanSourceRefFromEmailNotification(notification, mail) {
  const direction = notification?.direction || (notification?.folder === "sent" ? "outgoing" : "incoming");
  return {
    id: `email:${notification?.entryId || notification?.id || mail?.entryId || ""}`,
    type: direction === "outgoing" ? "sent_email" : "email",
    label: notification?.subject || mail?.subject || "E-mail",
    entryId: notification?.entryId || mail?.entryId || "",
    storeId: notification?.storeId || mail?.storeId || "",
    notificationId: notification?.id || "",
    path: notification?.memoryPath || "",
    timestamp: notification?.mailDate || mail?.receivedTime || mail?.sentOn || "",
  };
}

function emailKanbanSignal({ mail, folder, classification, notification }) {
  const outgoing = folder === "sent" || notification?.direction === "outgoing";
  const recipientText = outgoing ? notification?.to || mail?.to || "" : notification?.from || mail?.senderEmail || mail?.senderName || "";
  const rawProject = Array.isArray(classification?.tags) ? classification.tags[0] || "" : "";
  const project = resolveKanbanProjectForTask(rawProject, {
    title: notification?.title || mail?.subject || "",
    summary: classification?.summary || notification?.summary || "",
    subject: notification?.subject || mail?.subject || "",
  }) || resolveKanbanProjectForTask(notification?.subject || mail?.subject || "", {
    title: notification?.title || mail?.subject || "",
    summary: classification?.summary || notification?.summary || "",
  });
  return {
    kind: outgoing ? "sent_email_update" : "incoming_email_action",
    direction: outgoing ? "outgoing" : "incoming",
    folder: folder || notification?.folder || "",
    title: notification?.title || mail?.subject || (outgoing ? "Verzonden e-mail" : "E-mail opvolgen"),
    status: outgoing ? "waiting" : classification?.priority === "hoog" ? "today" : "inbox",
    priority: classification?.priority === "hoog" ? "hoog" : classification?.priority === "laag" ? "laag" : "middel",
    project,
    people: [recipientText].filter(Boolean),
    dueDate: classification?.deadline || "",
    action: outgoing
      ? "Verzonden e-mail gevonden; bepaal of een bestaande Kanban-taak hiermee is uitgevoerd, wacht op reactie of verdere opvolging nodig heeft."
      : classification?.action || notification?.action || "Bepaal de opvolging voor deze e-mail.",
    summary: classification?.summary || notification?.summary || "",
    subject: notification?.subject || mail?.subject || "",
    from: notification?.from || mail?.senderEmail || mail?.senderName || "",
    to: notification?.to || mail?.to || "",
    bodySnippet: String(mail?.bodySnippet || "").slice(0, 1600),
    sourceRef: kanbanSourceRefFromEmailNotification(notification, mail),
  };
}

function normalizeKanbanDecision(raw, fallbackSignal) {
  const o = raw && typeof raw === "object" ? raw : {};
  const action = ["create", "update", "move", "complete", "ignore"].includes(o.action) ? o.action : "";
  const status = KANBAN_STATUSES.includes(o.status) ? o.status : fallbackSignal.status || "inbox";
  const priority = KANBAN_PRIORITIES.includes(o.priority) ? o.priority : fallbackSignal.priority || "middel";
  const projectInput = typeof o.project === "string" && o.project.trim() ? o.project.trim() : fallbackSignal.project || "";
  return {
    action: action || "create",
    taskId: typeof o.taskId === "string" ? o.taskId.trim() : "",
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 240) : fallbackSignal.title,
    status,
    priority,
    project: resolveKanbanProjectForTask(projectInput, {
      title: typeof o.title === "string" ? o.title : fallbackSignal.title,
      summary: typeof o.summary === "string" ? o.summary : fallbackSignal.summary,
      subject: fallbackSignal.subject || "",
    }),
    dueDate: typeof o.dueDate === "string" ? o.dueDate.trim().slice(0, 80) : fallbackSignal.dueDate,
    nextAction:
      typeof o.nextAction === "string" && o.nextAction.trim()
        ? o.nextAction.trim().slice(0, 600)
        : fallbackSignal.action,
    summary:
      typeof o.summary === "string" && o.summary.trim()
        ? o.summary.trim().slice(0, 2500)
        : fallbackSignal.summary,
    rationale: typeof o.rationale === "string" ? o.rationale.trim().slice(0, 1000) : "",
  };
}

async function decideKanbanSignalWithLlm({ signal, candidates, runId }) {
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) return null;
  const llmResult = await fetchLlmTextWithRetry(
    `${config.endpoint.replace(/\/+$/, "")}/chat/completions`,
    {
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
              "Je bent de Actie-Kanban beslisser voor Joost. " +
              "Beslis voor een nieuw signaal of dit een bestaande taak moet updaten, een nieuwe taak moet maken, een taak moet verplaatsen/afronden, of genegeerd moet worden. " +
              "Maak geen duplicaten: als een kandidaat duidelijk dezelfde actie/afspraak/opvolging is, kies update met taskId. " +
              "Als signal.kind='sent_email_update' of direction='outgoing': maak NOOIT een nieuwe taak. Match de verzonden mail op bestaande open taken. Als de taak was om een mail/reply/draft te schrijven en deze verzonden mail lijkt die actie te zijn, kies complete of move/update naar waiting met een passende nextAction zoals wachten op reactie. Als de verzonden mail niet duidelijk bij een kandidaat past, kies ignore. " +
              getKanbanProjectCatalogPrompt(loadKanbanProjectRegistry()) + " " +
              "Geef uitsluitend JSON: {action:'create'|'update'|'move'|'complete'|'ignore',taskId:string,title:string,project:string,status:'inbox'|'today'|'this_week'|'waiting'|'scheduled'|'doing'|'done'|'ignored',priority:'laag'|'middel'|'hoog'|'kritiek',dueDate:string,nextAction:string,summary:string,rationale:string}. " +
              "Gebruik Nederlands en formuleer nextAction als concrete eerstvolgende stap.",
          },
          { role: "user", content: JSON.stringify({ signal, candidates }) },
        ],
      }),
    },
    {
      runId,
      logPrefix: "kanban_ingest_llm",
      logFields: { title: truncStr(signal?.title || "", 160) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  return normalizeKanbanDecision(parseAgentJsonResponse(content), signal);
}

async function processKanbanSignalForEmailAgent(input) {
  const signal = emailKanbanSignal(input);
  try {
    upsertCriticalThread(CRITICAL_THREADS_PATH, {
      notificationId: input?.notification?.id || signal.sourceRef,
      subject: signal.subject,
      tags: Array.isArray(input?.classification?.tags) ? input.classification.tags : [],
      client: signal.project,
      mailDate: input?.mail?.receivedDate || input?.notification?.mailDate || "",
    });
  } catch {
    /* non-blocking */
  }
  const outgoing = signal.kind === "sent_email_update" || signal.direction === "outgoing";
  const openStatuses = new Set(["inbox", "today", "this_week", "waiting", "scheduled", "doing"]);
  const allCandidates = kanbanStore.searchTasks({
    query: `${signal.title}\n${signal.subject}\n${signal.summary}\n${signal.action}\n${signal.to}\n${signal.from}\n${signal.bodySnippet}`,
    project: signal.project,
    people: signal.people,
    sourceRefs: [signal.sourceRef],
    limit: 20,
  }).tasks;
  const candidates = outgoing
    ? allCandidates.filter((task) => openStatuses.has(task.status)).slice(0, 8)
    : allCandidates.slice(0, 8);
  let decision = null;
  try {
    decision = await decideKanbanSignalWithLlm({ signal, candidates, runId: input.runId });
  } catch (e) {
    agentLog(input.runId, "kanban_ingest_decision_failed", {
      title: truncStr(signal.title || "", 160),
      error: String(e?.message || e),
    });
  }
  if (outgoing) {
    if (!candidates.length) {
      decision = { action: "ignore", rationale: "Verzonden e-mail matcht niet duidelijk op een open Kanban-taak." };
    } else if (!decision || decision.action === "create" || (decision.action !== "ignore" && !decision.taskId)) {
      const best = candidates[0];
      decision = {
        action: best.matchScore >= 25 ? "move" : "ignore",
        taskId: best.matchScore >= 25 ? best.id : "",
        status: best.matchScore >= 25 ? "waiting" : undefined,
        nextAction: best.matchScore >= 25 ? "Wacht op reactie op de verzonden e-mail." : "",
        summary: best.matchScore >= 25 ? `${best.summary || ""}\n\nVerzonden e-mail verwerkt: ${signal.subject}`.trim() : "",
        rationale:
          best.matchScore >= 25
            ? "Fallback: verzonden e-mail lijkt bij deze open taak te horen."
            : "Geen voldoende sterke match voor verzonden e-mail.",
      };
    }
  }
  const payload = kanbanStore.ingestSignal(signal, decision, { actor: "agent" });
  agentLog(input.runId, "kanban_ingest_done", {
    action: payload.action || decision?.action || "",
    taskId: payload?.task?.id || "",
    title: truncStr(payload?.task?.title || signal.title || "", 200),
    candidateCount: candidates.length,
    direction: signal.direction,
  });
  return payload;
}

function emailReplyHtmlFromMarkdown(markdown) {
  const body = String(markdown || "").trim();
  const html = marked.parse(body || "");
  return (
    '<div style="font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.45;">' +
    html +
    "</div>"
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ceilToNextHalfHour(date) {
  const d = new Date(date);
  const hadSeconds = d.getSeconds() > 0 || d.getMilliseconds() > 0;
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const add =
    (minutes === 0 || minutes === 30) && !hadSeconds ? 0 : minutes < 30 ? 30 - minutes : 60 - minutes;
  d.setMinutes(minutes + add);
  return d;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function formatAvailabilitySlot(start, end) {
  const day = start.toLocaleDateString("nl-NL", { weekday: "long", day: "2-digit", month: "2-digit" });
  const startTime = start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${startTime}-${endTime}`;
}

async function emailReplyCalendarAvailability(runId) {
  const from = new Date();
  const to = addDays(from, 14);
  const payload = await searchOutlookCalendarPayload({
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    limit: 50,
    includeBody: false,
    bodyMaxChars: 500,
  });
  if (!payload?.ok) {
    agentLog(runId, "email_reply_calendar_unavailable", { error: payload?.error || "unknown" });
    return {
      ok: false,
      error: payload?.error || "Agenda-beschikbaarheid kon niet worden opgehaald.",
      slots: [],
      instruction:
        "Agenda-beschikbaarheid kon niet worden opgehaald. Stel daarom geen concrete tijdstippen voor in deze reply.",
    };
  }
  const events = (Array.isArray(payload.results) ? payload.results : [])
    .map((event) => ({
      start: new Date(event?.start || ""),
      end: new Date(event?.end || ""),
      busyStatus: Number(event?.busyStatus ?? 2),
      subject: String(event?.subject || ""),
    }))
    .filter((event) => Number.isFinite(event.start.getTime()) && Number.isFinite(event.end.getTime()) && event.busyStatus !== 0);

  const slots = [];
  for (let dayOffset = 0; dayOffset <= 14 && slots.length < 10; dayOffset += 1) {
    const day = addDays(from, dayOffset);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    let cursor = new Date(day);
    cursor.setHours(9, 0, 0, 0);
    if (dayOffset === 0 && cursor < from) cursor = ceilToNextHalfHour(from);
    const dayEnd = new Date(day);
    dayEnd.setHours(17, 0, 0, 0);
    while (cursor < dayEnd && slots.length < 10) {
      const slotEnd = new Date(cursor.getTime() + 30 * 60 * 1000);
      if (slotEnd <= dayEnd && !events.some((event) => overlaps(cursor, slotEnd, event.start, event.end))) {
        slots.push({
          startIso: cursor.toISOString(),
          endIso: slotEnd.toISOString(),
          label: formatAvailabilitySlot(cursor, slotEnd),
        });
      }
      cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
    }
  }
  return {
    ok: true,
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    slotDurationMinutes: 30,
    slots,
    instruction: slots.length
      ? "Als je tijdstippen voorstelt, gebruik uitsluitend letterlijk een of meer labels uit availableSlots. Noem geen andere tijden."
      : "Er zijn geen vrije slots gevonden. Stel daarom geen concrete tijdstippen voor in deze reply.",
  };
}

async function generateEmailReplyDraftText({ notification, memoryMarkdown, calendarAvailability, runId, instruction = "" }) {
  const config = readAgentConfig();
  if (!config.endpoint || !config.model || !config.apiKey) {
    throw new Error("Agentconfig ontbreekt voor e-mailreply.");
  }
  const querySeed = [
    notification?.subject || "",
    notification?.from || "",
    notification?.summary || "",
    notification?.importanceReason || "",
    notification?.action || "",
    notification?.userContext || "",
    notification?.processedUserContext || "",
    memoryMarkdown || "",
  ].join("\n");
  const secondBrainContext = emailAgentSecondBrainContext(
    {
      subject: notification?.subject || "",
      senderEmail: notification?.from || "",
      to: notification?.to || "",
      bodySnippet: querySeed.slice(0, 3000),
    },
    notification?.folder || "inbox",
  );
  const llmResult = await fetchLlmTextWithRetry(
    `${config.endpoint.replace(/\/+$/, "")}/chat/completions`,
    {
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
            content:
              "Je schrijft een professioneel Nederlands antwoord op een bestaande Outlook e-mail namens Joost. " +
              "Gebruik de e-mailnotitie, corpuscontext en long-term memory om inhoudelijk passend te antwoorden. " +
              "Als userContext aanwezig is, behandel die als expliciete correctie/aanvulling van Joost en laat die zwaarder wegen dan de eerdere automatische inschatting. " +
              "Doe geen toezeggingen die niet uit de context volgen; formuleer onzekerheden als voorstel of vraag. " +
              "Wanneer je tijdstippen of beschikbaarheid noemt, gebruik dan uitsluitend de meegegeven vrije agenda-slots. " +
              "Noem nooit andere tijdstippen dan labels uit availableSlots. Als availableSlots leeg is of agenda ophalen faalde, stel geen concrete tijdstippen voor. " +
              "Schrijf compact, helder en menselijk. Gebruik Markdown voor eenvoudige opmaak (alinea's, bullets indien nuttig). " +
              "Geen onderwerpregel, geen markdown code fences, geen uitleg buiten de mailtekst. " +
              "Geef uitsluitend JSON terug met {\"bodyMarkdown\":\"...\"}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              notification,
              userContext: notification?.userContext || "",
              processedUserContext: notification?.processedUserContext || "",
              emailMemoryNote: memoryMarkdown,
              secondBrainContext,
              calendarAvailability,
              availableSlots: Array.isArray(calendarAvailability?.slots) ? calendarAvailability.slots.map((slot) => slot.label) : [],
              additionalInstruction: instruction,
            }),
          },
        ],
      }),
    },
    {
      runId,
      logPrefix: "email_reply_llm",
      logFields: { notificationId: notification?.id || "", subject: truncStr(notification?.subject || "", 160) },
    },
  );
  const data = JSON.parse(llmResult.body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  const parsed = parseAgentJsonResponse(content);
  const bodyMarkdown = typeof parsed?.bodyMarkdown === "string" ? parsed.bodyMarkdown.trim() : "";
  if (!bodyMarkdown) throw new Error("LLM gaf geen bodyMarkdown terug voor de reply.");
  return bodyMarkdown;
}

const emailAgent = createEmailAgent({
  memoryDir: MEMORY_DIR,
  classifyEmail: classifyEmailForEmailAgent,
  processEmailMemory: processEmailMemoryForEmailAgent,
  processKanbanSignal: processKanbanSignalForEmailAgent,
  onMemoryChanged: (reason) => {
    scheduleCorpusIndexRebuild(reason);
  },
  log: agentLog,
});

const corpusOrganizer = createCorpusOrganizer({
  markdownDir: MARKDOWN_DIR,
  reviewsDir: REVIEWS_DIR,
  classifyDocument: classifyDocumentForCorpusOrganizer,
  isProtected: isProtectedDocumentPath,
  readManifest: () => readManifest(MARKDOWN_DIR, { scope: "working" }),
  onIndexRebuild: (reason) => scheduleCorpusIndexRebuild(reason),
  log: agentLog,
});

const kanbanCommentsStore = createKanbanCommentsStore({ rootDir: path.join(KANBAN_DIR, "comments") });
let kanbanStore;
let kanbanProjectRegistryCache = null;

function readRawKanbanProjects() {
  const tasksPath = path.join(KANBAN_DIR, "tasks.json");
  try {
    if (!fs.existsSync(tasksPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
    return (Array.isArray(parsed.tasks) ? parsed.tasks : [])
      .map((task) => String(task?.project || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadKanbanProjectRegistry({ force = false } = {}) {
  if (!force && kanbanProjectRegistryCache) return kanbanProjectRegistryCache;
  kanbanProjectRegistryCache = getKanbanProjectRegistry({
    memoryDir: MEMORY_DIR,
    markdownDir: MARKDOWN_DIR,
    existingProjects: readRawKanbanProjects(),
  });
  return kanbanProjectRegistryCache;
}

function invalidateKanbanProjectRegistryCache() {
  kanbanProjectRegistryCache = null;
}

function resolveKanbanProjectForTask(raw, hints = {}) {
  return resolveKanbanProject(raw, loadKanbanProjectRegistry(), hints);
}

kanbanStore = createKanbanStore({
  rootDir: KANBAN_DIR,
  resolveProject: resolveKanbanProjectForTask,
  onStateSaved: () => invalidateKanbanProjectRegistryCache(),
  onTasksPurged: (tasks) => {
    for (const task of tasks) kanbanCommentsStore.deleteForTask(task.id);
  },
});

const NEXUS_HEURISTIC_PREFETCH_MAX_CHARS = Math.min(
  28000,
  Math.max(8000, Number(process.env.NEXUS_HEURISTIC_PREFETCH_MAX_CHARS || 16000) || 16000),
);
const NEXUS_OPEN_DOC_MAX_CHARS = Math.min(
  14000,
  Math.max(4000, Number(process.env.NEXUS_OPEN_DOC_MAX_CHARS || 9000) || 9000),
);

function mergeEmailMemoryPrefetchResults(primary = [], secondary = [], maxItems = 10) {
  const seen = new Set();
  const out = [];
  for (const item of [...primary, ...secondary]) {
    const key = item.messageKey || `${item.source}|${item.id}|${item.subject}|${item.mailDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

function compactEmailMemoryPrefetchMarkdown(message, opts = {}) {
  const maxItems = opts.maxItems ?? 8;
  const maxChars = opts.maxChars ?? 3800;
  const queried = searchEmailMemoryToolPayload({ query: message, limit: maxItems }).results || [];
  const recent = searchEmailMemoryToolPayload({ query: "", limit: Math.min(6, maxItems) }).results || [];
  const merged = mergeEmailMemoryPrefetchResults(queried, recent, maxItems);
  const boosted = boostCriticalThreadResults(merged, CRITICAL_THREADS_PATH, message);
  if (!boosted.length) return "(geen e-mailmemory-resultaten)";
  const lines = boosted.map((item) => {
    const bits = [
      item.mailDate ? `**${String(item.mailDate).slice(0, 10)}**` : "",
      item.status ? `[${item.status}]` : "",
      item.priority || "",
      `**${item.subject || "(geen onderwerp)"}**`,
      item.summary ? truncStr(item.summary, 220) : "",
      item.action ? `actie: ${truncStr(item.action, 140)}` : "",
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  });
  let body = lines.join("\n");
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}…\n\n*[E-mailmemory ingekort; gebruik search_email_memory voor verdieping.]*`;
  }
  return body;
}

function compactKanbanPrefetchMarkdown(message, opts = {}) {
  const maxItems = opts.maxItems ?? 14;
  const maxEvents = opts.maxEvents ?? 6;
  const maxChars = opts.maxChars ?? 3800;
  const payload = kanbanStore.listTasks({
    query: message,
    limit: Math.min(40, maxItems * 2),
    since: opts.since || "14d",
  });
  const taskLines = (payload.tasks || []).slice(0, maxItems).map((task) => {
    const bits = [
      `[${task.status}]`,
      `**${task.title}**`,
      task.priority || "",
      task.project ? `project: ${task.project}` : "",
      task.dueDate ? `deadline: ${task.dueDate}` : "",
      task.nextAction ? `next: ${truncStr(task.nextAction, 120)}` : "",
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  });
  const eventLines = (payload.recentEvents || []).slice(0, maxEvents).map((ev) =>
    `- ${ev.ts || ev.timestamp || ""} · ${ev.event || ev.type || "event"} · ${truncStr(ev.note || ev.title || "", 120)}`,
  );
  let body = "";
  if (taskLines.length) body += `**Taken (${payload.total ?? taskLines.length})**\n${taskLines.join("\n")}`;
  else body += "(geen Kanban-taken in baseline)";
  if (eventLines.length) body += `\n\n**Recente events**\n${eventLines.join("\n")}`;
  if (payload.searchHint) body += `\n\n*${payload.searchHint}*`;
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}…\n\n*[Kanban-baseline ingekort; gebruik search_kanban_tasks voor verdieping.]*`;
  }
  return body;
}

function compactOpenDocumentContext(name, markdown, question, opts = {}) {
  const maxChars = opts.maxChars ?? NEXUS_OPEN_DOC_MAX_CHARS;
  const pathLabel = String(name || "").trim();
  const md = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!md) {
    if (pathLabel) {
      return (
        `Pad: ${pathLabel}\n\n*(Document open in viewer maar inhoud is leeg of nog niet meegestuurd; gebruik read_corpus_markdown indien nodig.)*`
      );
    }
    return "(geen geopend document of lege inhoud)";
  }
  const budget = retrievalBudgetForQuestion(question);
  const sections = extractMarkdownSections(md);
  const lines = md.split("\n");
  if (!sections.length) {
    return (
      `Pad: ${name || "(geen pad)"}\n\n${truncStr(md, maxChars)}\n\n` +
      "*[Geen koppen gevonden; fragment van volledige documenttekst. Gebruik read_corpus_markdown voor verdieping indien nodig.]*"
    );
  }
  const ranked = scoreMarkdownSectionsForQuestion(question, sections, {
    limit: Math.min(5, budget.sectionLimit),
  });
  const picks = ranked.sections.length ? ranked.sections : sections.slice(0, 4);
  const sectionBlocks = picks.map((section, idx) => {
    const start = Math.max(0, (section.startLine || 1) - 1);
    const end = Math.min(lines.length, section.endLine || lines.length);
    let body = lines.slice(start, end).join("\n").trim();
    const perSectionMax = Math.max(600, Math.floor(maxChars / Math.max(1, picks.length)));
    if (body.length > perSectionMax) {
      body = `${body.slice(0, perSectionMax)}…\n\n*[Sectie ingekort. Gebruik read_corpus_section voor volledige sectie.]*`;
    }
    const heading = section.headingPath?.length ? section.headingPath.join(" > ") : section.heading || `Sectie ${idx + 1}`;
    return `#### ${idx + 1}. ${heading}\n\n${body || section.preview || "(leeg)"}`;
  });
  let out =
    `Pad: ${name || "(geen pad)"}\n\n` +
    `Heuristisch geselecteerde secties (niet het volledige document; gebruik tools voor andere secties):\n\n` +
    sectionBlocks.join("\n\n---\n\n");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}…\n\n*[Geopend document ingekort. Gebruik read_corpus_section/read_corpus_markdown indien nodig.]*`;
  }
  return out;
}

function nexusOptionalSourceHints(message) {
  const text = String(message || "").toLowerCase();
  const hints = [];
  if (/\b(confluence|atlassian|domeinpagina|service management|probleembeheer)\b/.test(text)) {
    hints.push("search_confluence + read_confluence_page");
  }
  if (/\b(actueel|recent nieuws|internet|web\b|online|tavily|google|markt|koers)\b/.test(text)) {
    hints.push("web_search");
  }
  if (/\b(outlook|mailbox|inbox|verzonden items|live mail|originele mail|agenda|afspraak|planning|beschikbaar)\b/.test(text)) {
    hints.push("Outlook-tools (search_outlook_mail / search_outlook_calendar / search_2ndbrain_calendar)");
  }
  return hints;
}

async function buildNexusHeuristicSnapshot({
  message,
  name = "",
  markdown = "",
  workingManifest = null,
  memoryManifest = null,
  intent = null,
  mode = "agent",
  activeView = "documents",
  documentLabel = "",
}) {
  const question = String(message || "").trim();
  const nexusIntent =
    intent ||
    classifyNexusIntent(question, {
      hasDocument: !!name,
      documentPath: name,
      mode,
      activeView,
    });
  const excludePatterns = nexusIntent.excludeExperimentPaths ? defaultExperimentPathPatterns() : [];
  const retrievalBudget = { profile: nexusIntent.retrievalProfile };
  const corpusContextOpts = {
    includeFragments: false,
    excludePathPatterns: excludePatterns,
    retrievalBudget,
  };
  const workingBootstrap = workingManifest?.entries?.length
    ? buildCorpusAskContext(MARKDOWN_DIR, workingManifest, question, corpusContextOpts)
    : { markdownBlob: "(werkdocument-index niet beschikbaar)", pickedPaths: [], retrievalMeta: null };
  const memoryBootstrap = memoryManifest?.entries?.length
    ? buildCorpusAskContext(MARKDOWN_DIR, memoryManifest, question, {
        ...corpusContextOpts,
        sourceRootDir: MEMORY_DIR,
        indexDir: MEMORY_INDEX_DIR,
      })
    : { markdownBlob: "(memory-index niet beschikbaar)", pickedPaths: [], retrievalMeta: null };
  const emailBlock = compactEmailMemoryPrefetchMarkdown(question);
  const kanbanBlock = compactKanbanPrefetchMarkdown(question);
  const openDocBlock = compactOpenDocumentContext(name, markdown, question);
  const viewerBlock = formatNexusViewerContextBlock({
    activeView,
    documentPath: name,
    documentLabel,
    markdown,
    question,
  });
  const optionalHints = nexusOptionalSourceHints(question);
  const kanbanDisambiguation = formatInternalKanbanDisambiguationBlock(question, { activeView });
  const bodyParts = [
    `Intent-profiel: **${nexusIntent.profile}** (${nexusIntent.retrievalProfile} retrieval).`,
    "De server heeft corpus, memory, e-mailmemory, het interne Actie-Kanban en het geopende document al tokenzuinig doorzocht. Gebruik dit als verplichte startcontext; verdiep met tools waar de baseline onvolledig lijkt.",
    ...(kanbanDisambiguation ? ["", kanbanDisambiguation.trim()] : []),
    "",
    "### Werkdocumenten (BM25-routekaart)",
    workingBootstrap.markdownBlob,
    "",
    "### Long-term memory (BM25-routekaart)",
    memoryBootstrap.markdownBlob,
    "",
    "### E-mailmemory (heuristisch)",
    emailBlock,
    "",
    "### Actie-Kanban (heuristisch, laatste 14 dagen — intern iOMS, niet externe tooling)",
    kanbanBlock,
    "",
    "### Geopend document (heuristische secties)",
    openDocBlock,
  ];
  if (nexusIntent.profile === "planning") {
    const overview = buildActivityOverview({ message: question }, {
      listKanbanTasks: (args) => kanbanStore.listTasks(args),
      searchEmailMemory: (args) => searchEmailMemoryToolPayload(args),
      readActivityLogs: (args) => readActivityLogsToolPayload(args),
    });
    bodyParts.push("", formatActivityOverviewMarkdown(overview));
    if (looksLikeActivityLogRequest(question)) {
      try {
        const draft = await buildTimesheetDraftPayload({}, timesheetBuilderDeps());
        bodyParts.push("", draft.markdown || formatTimesheetDraftMarkdown(draft));
      } catch {
        /* optional prefetch */
      }
    }
  }
  if (optionalHints.length) {
    bodyParts.push("", "### Waarschijnlijk ook nodig", optionalHints.map((hint) => `- ${hint}`).join("\n"));
  }
  if (excludePatterns.length) {
    bodyParts.push("", "### Omgevingsscheiding", `- Experiment/test-paden uitgesloten: ${excludePatterns.join(", ")}`);
  }
  const pinnedPrefix = ["## Heuristische baseline (automatisch, vóór LLM)", viewerBlock].join("\n\n");
  let markdownBlob = truncateNexusHeuristicBlob(pinnedPrefix, bodyParts.join("\n\n"), NEXUS_HEURISTIC_PREFETCH_MAX_CHARS);
  return {
    markdownBlob,
    pickedPaths: [
      ...(workingBootstrap.pickedPaths || []).map((p) => `working:${p}`),
      ...(memoryBootstrap.pickedPaths || []).map((p) => `memory:${p}`),
    ],
    retrievalMeta: {
      working: workingBootstrap.retrievalMeta || null,
      memory: memoryBootstrap.retrievalMeta || null,
      prefetchChars: markdownBlob.length,
      optionalSourceHints: optionalHints,
      intent: nexusIntent,
    },
    intent: nexusIntent,
  };
}

function publicAgentConfig(config = readAgentConfig()) {
  return {
    endpoint: config.endpoint,
    model: config.model,
    hasApiKey: !!config.apiKey.trim(),
    ...publicRouterPayload(config),
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
  if (input?.modelRouter && typeof input.modelRouter === "object") {
    config.modelRouter = input.modelRouter;
  } else if (current.modelRouter) {
    config.modelRouter = current.modelRouter;
  }
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  return config;
}

function defaultPromptMacros() {
  return [
    {
      id: "meeting-report",
      name: "Gespreksverslag",
      description: "Maak een gespreksverslag op basis van een transcript en plaats dit in het document.",
      mode: "agent",
      prompt:
        "Maak op basis van onderstaand transcript een gespreksverslag en plaats dit in het huidige Markdown-document.\n\n" +
        "Vereisten:\n" +
        "- Begin met een korte samenvatting.\n" +
        "- Maak een kopje per besproken onderwerp.\n" +
        "- Leg duidelijke afspraken en acties vast, inclusief eigenaar/personen en data.\n" +
        "- Formuleer acties zo SMART mogelijk: Specifiek, Meetbaar, Aanwijsbaar, Realistisch en Tijdsgebonden.\n" +
        "- Gebruik Markdown die past bij de stijl van het huidige document.\n" +
        "- Herhaal het transcript niet letterlijk; verwerk alleen de relevante inhoud in het verslag.\n" +
        "- Voeg het verslag logisch in het document in. Vervang bestaande inhoud alleen als dat duidelijk de bedoeling is.",
      requiresContent: true,
      contentLabel: "Transcript",
      contentPlaceholder: "Plak hier het transcript van het gesprek...",
      contentPrefix: "Transcript:",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cleanup-markdown-page",
      name: "Markdown pagina opschonen",
      description: "Laat de Agent de geopende Markdown-pagina redactioneel en structureel opschonen.",
      mode: "agent",
      prompt:
        "Schoon de geopende Markdown-pagina op.\n\n" +
        "Verbeter structuur, koppen, formulering, consistentie, opsommingen en leesbaarheid. " +
        "Behoud de inhoudelijke betekenis. Verwijder dubbele of rommelige tekst, maar laat relevante details staan. " +
        "Gebruik Markdown die past bij de bestaande stijl van het document.",
      requiresContent: false,
      contentLabel: "Aanvullende instructie",
      contentPlaceholder: "Optioneel: voeg specifieke aandachtspunten toe...",
      contentPrefix: "Aanvullende instructie:",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "urenregistratie-week",
      name: "Urenregistratie (week)",
      description:
        "Volledige week-urenregistratie uit alle bronnen: Outlook inbox/sent/agenda, documenten, geheugen, Kanban, activity logs. 80% klant, 20% overig, 8 u/dag, per activiteit.",
      mode: "ask",
      prompt:
        "Ik wil een complete urenregistratie voor de gevraagde week/periode (maandag t/m vrijdag).\n\n" +
        "STAP 1 — Serverconcept (verplicht eerste toolcall)\n" +
        "Roep **build_timesheet_draft** aan met fromDate/toDate (ma–vr van de week), includeCalendar=true, includeOutlookMail=true.\n\n" +
        "STAP 2 — Alle bronnen doorzoeken (verplicht; niet overslaan)\n" +
        "Gebruik na het concept álle relevante tools en combineer signalen:\n" +
        "A. **Outlook live**\n" +
        "   - search_outlook_calendar (hoofdagenda, weekrange)\n" +
        "   - search_2ndbrain_calendar (2ndbrain-agenda, weekrange)\n" +
        "   - search_outlook_mail folder=inbox (weekrange)\n" +
        "   - search_outlook_mail folder=sent (weekrange)\n" +
        "B. **E-mailmemory**\n" +
        "   - search_email_memory (query='', brede inventarisatie + gerichte queries op klanten/dossiers)\n" +
        "C. **Kanban**\n" +
        "   - search_kanban_tasks: query='', since=weekrange, limit 150–200, eventLimit 100+\n" +
        "   - read_kanban_task voor belangrijke taken met context\n" +
        "D. **Activity logs**\n" +
        "   - read_activity_logs met fromDate/toDate van de week\n" +
        "E. **Documenten (corpus)**\n" +
        "   - read_corpus_outline + read_corpus_markdown/read_corpus_section voor weekplan (Plan week XX.md), recent bewerkt project-/managed-services-documenten onder 02-projecten/ en 01-managed-services/\n" +
        "F. **Long-term memory**\n" +
        "   - read_memory_outline + read_memory_section voor klant-/projectcontext (onderwerpen/, personen_iO/, projecten)\n\n" +
        "STAP 3 — Urenregistratie samenstellen\n" +
        "Combineer alle signalen tot één weekoverzicht met deze harde regels:\n" +
        "- Elke werkdag (ma–vr) **exact 8,0 uur** (480 minuten).\n" +
        "- **80% klant/project** en **20% overig/intern** per dag (streef ~6,4 u klant + ~1,6 u overig).\n" +
        "- **Per dag, per activiteit** één regel (geen bulk-blokken zonder activiteit).\n" +
        "- Klanturen = concrete dossiers (DHL/Sentinel, Ocean Cleanup, Provincie Zeeland, CGI/Venus/UVB, Superunie/Euroconsumers, Stanley Stella, enz.).\n" +
        "- Overig = Algemeen/intern, mail triage, planning, HR, administratie, interne meetings zonder klantdossier.\n" +
        "- Label [klant] of [overig] per regel.\n" +
        "- Label [hard] (agenda, activity log, Kanban-event, mail met datum) vs [schatting].\n\n" +
        "OUTPUT (exact dit format):\n" +
        "**A. Bronnen** — checklist welke bronnen je daadwerkelijk hebt geraadpleegd (met vinkje per bron).\n\n" +
        "**B. Per dag** — voor elke werkdag:\n" +
        "```\n" +
        "Maandag [datum] — totaal 8,0 u (klant X,X u · overig X,X u)\n" +
        "1. [x,x u] [klant/overig] [hard/schatting] — [Dossier/klant] — [concrete activiteit] [bron: agenda|inbox|sent|kanban|activity-log|document|memory]\n" +
        "2. …\n" +
        "(elke activiteit eigen regel; som = 8,0 u)\n" +
        "```\n\n" +
        "**C. Weektotaal per dossier** — bullets met uren + % klant vs overig voor de week.\n\n" +
        "**D. Schattingen & gaten** — wat je hebt ingevuld zonder harde tijdsbron.\n\n" +
        "Regels: geen webbronnen; Nederlands; zakelijk; geen emoji's.\n" +
        "Geen periode hieronder → huidige kalenderweek (ma–vr) volgens server-tijd.",
      requiresContent: false,
      contentLabel: "Week of periode",
      contentPlaceholder:
        "Optioneel: week 25 · 16-20 juni 2026 · maandag 16 juni t/m vrijdag 20 juni 2026. Laat leeg voor huidige week.",
      contentPrefix: "Periode:",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "weekplan-2ndbrain",
      name: "Outlook 2ndbrain: week vullen",
      description:
        "De agent vult je Outlook-agenda 2ndbrain met focusblokken voor de werkweek (ma–vr): echte afspraken aanmaken/bijwerken in Outlook, niet alleen een tekstplan. Bronnen: Kanban, deadlines, mail, documenten, geheugen. Ideaal vrijdag, zondag of maandagochtend.",
      mode: "ask",
      prompt:
        "**Opdracht: vul mijn Outlook-agenda 2ndbrain met afspraken voor de werkweek.**\n\n" +
        "Dit is geen adviesvraag en geen tekstplan alleen. Je moet daadwerkelijk **Outlook-afspraken aanmaken of bijwerken** in de agenda **2ndbrain** via de tools create_2ndbrain_calendar_event en update_2ndbrain_calendar_event. " +
        "Na deze macro moet ik in Outlook de 2ndbrain-agenda openen en daar de geplande blokken zien.\n\n" +
        "Gebruik alles wat Nexus weet: lopende Kanban-acties, deadlines, e-mailmemory, inbox/sent, documenten, geheugen en activity logs.\n\n" +
        "BELANGRIJK (Outlook):\n" +
        "- **Uitvoeren:** elke geplande activiteit wordt een echte Outlook-afspraak in **2ndbrain** (create of update).\n" +
        "- **Nooit** de hoofdagenda wijzigen — search_outlook_calendar alleen om conflicten te zien.\n" +
        "- **Geen** documentmutaties (create_work_document, update_work_document, update_corpus_markdown).\n" +
        "- Geen macro succesvol afgerond zonder minstens één create_2ndbrain_calendar_event of update_2ndbrain_calendar_event (tenzij je eerst om verduidelijking vraagt).\n" +
        "- Werkdagen ma–vr, **8,0 uur** focus per dag; blokken 30–120 min.\n" +
        "- Standaard werkdag 08:30–17:00 (uitwijken als hoofdagenda blokkeert).\n\n" +
        "WELKE WEEK?\n" +
        "- Geen periode hieronder + vandaag is **vrijdag/weekend** → **komende week** (ma–vr).\n" +
        "- Geen periode + **maandagochtend** (vóór 12:00) → **huidige week** als 2ndbrain leeg is, anders komende week.\n" +
        "- Anders: opgegeven week/periode (ma–vr).\n\n" +
        "STAP 1 — Context verzamelen (verplicht)\n" +
        "A. search_2ndbrain_calendar — wat staat al in 2ndbrain voor die week?\n" +
        "B. search_outlook_calendar — hoofdagenda (alleen lezen, conflicten).\n" +
        "C. search_kanban_tasks (+ read_kanban_task voor top-taken).\n" +
        "D. search_email_memory.\n" +
        "E. search_outlook_mail inbox + sent.\n" +
        "F. read_corpus_outline / weekplan-documenten.\n" +
        "G. read_memory_outline + read_memory_section.\n" +
        "H. read_activity_logs.\n\n" +
        "STAP 2 — Voorstel tonen (kort, vóór het schrijven naar Outlook)\n" +
        "Tabel: | Dag | Tijd | Duur | Onderwerp (Outlook-subject, kort) | Dossier | Bron | Verwachte output (1 regel) |\n" +
        "Daarna onmiddellijk STAP 3 uitvoeren — niet stoppen na alleen een plan.\n\n" +
        secondBrainEventBodyTemplateGuide() +
        "\n\nSTAP 3 — Outlook 2ndbrain vullen (VERPLICHT UITVOEREN)\n" +
        "Voor elk blok in het voorstel:\n" +
        "- Bestaand 2ndbrain-item → **update_2ndbrain_calendar_event** (entryId uit search_2ndbrain_calendar); werk body bij met volledig sjabloon.\n" +
        "- Nieuw blok → **create_2ndbrain_calendar_event** met subject (kort), start, end (ISO + Europe/Amsterdam), **body (volledig sjabloon hierboven)**, reminderSet waar nuttig.\n" +
        "- Lege of dunne body is niet acceptabel: minimaal DOEL, INSTRUCTIES, VERWACHTE OUTPUT en BRONNEN.\n" +
        "- display: false.\n" +
        "Bevestig in je antwoord expliciet: *Outlook 2ndbrain is bijgewerkt; open de agenda 2ndbrain in Outlook om de afspraken te zien.*\n\n" +
        "STAP 4 — Afronding\n" +
        "**A. Bronnen** (checklist)\n" +
        "**B. Weekoverzicht** (definitieve tabel)\n" +
        "**C. Outlook-acties** — per afspraak: aangemaakt/bijgewerkt, datum, tijd, subject; bevestig dat body DOEL/INSTRUCTIES/VERWACHTE OUTPUT bevat\n" +
        "**D. Niet ingepland** (bewust uitgesteld)\n" +
        "**E. Conflicten/opmerkingen**\n\n" +
        "Regels: Nederlands; zakelijk; geen emoji's; geen web_search.\n" +
        "Bij onduidelijke prioriteit: vraag één verduidelijking vóór je Outlook vult — maar maak daarna wél de afspraken.",
      requiresContent: false,
      contentLabel: "Week of periode",
      contentPlaceholder:
        "Optioneel: komende week · week 26 · maandag 23 juni t/m vrijdag 27 juni 2026. Laat leeg voor automatische weekkeuze (vrijdag/weekend → komende week).",
      contentPrefix: "Periode:",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

function mergeDefaultPromptMacros(macros) {
  const defaults = defaultPromptMacros();
  const merged = [...(macros || [])];
  const existingIds = new Set(merged.map((m) => m?.id).filter(Boolean));
  for (const def of defaults) {
    if (!existingIds.has(def.id)) {
      merged.push({ ...def });
    }
  }
  return merged;
}

function normalizePromptMacro(raw, fallback = {}) {
  if (!raw || typeof raw !== "object") return null;
  const now = new Date().toISOString();
  const idRaw = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!name || !prompt) return null;
  const id =
    idRaw && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(idRaw)
      ? idRaw
      : typeof fallback.id === "string" && fallback.id
        ? fallback.id
        : crypto.randomUUID();
  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.trim()
      ? raw.createdAt.trim()
      : typeof fallback.createdAt === "string" && fallback.createdAt
        ? fallback.createdAt
        : now;
  return {
    id,
    name,
    description: typeof raw.description === "string" ? raw.description.trim().slice(0, 1000) : "",
    mode: raw.mode === "ask" ? "ask" : "agent",
    prompt: prompt.slice(0, 20000),
    requiresContent: raw.requiresContent === true,
    contentLabel:
      typeof raw.contentLabel === "string" && raw.contentLabel.trim()
        ? raw.contentLabel.trim().slice(0, 120)
        : "Aanvullende inhoud",
    contentPlaceholder:
      typeof raw.contentPlaceholder === "string" ? raw.contentPlaceholder.trim().slice(0, 1000) : "",
    contentPrefix:
      typeof raw.contentPrefix === "string" && raw.contentPrefix.trim()
        ? raw.contentPrefix.trim().slice(0, 120)
        : "Aanvullende inhoud:",
    createdAt,
    updatedAt: now,
  };
}

function readPromptMacrosPayload() {
  if (!fs.existsSync(PROMPT_MACROS_PATH)) {
    const payload = { version: 1, macros: defaultPromptMacros() };
    ensureParentDir(PROMPT_MACROS_PATH);
    fs.writeFileSync(PROMPT_MACROS_PATH, JSON.stringify(payload, null, 2), "utf8");
    return payload;
  }
  try {
    const data = JSON.parse(fs.readFileSync(PROMPT_MACROS_PATH, "utf8"));
    const rawMacros = Array.isArray(data?.macros) ? data.macros : [];
    const macros = mergeDefaultPromptMacros(rawMacros.map((m) => normalizePromptMacro(m, m)).filter(Boolean));
    return { version: 1, macros };
  } catch {
    return { version: 1, macros: defaultPromptMacros() };
  }
}

function writePromptMacrosPayload(payload) {
  const macros = Array.isArray(payload?.macros)
    ? payload.macros.map((m) => normalizePromptMacro(m, m)).filter(Boolean)
    : [];
  const next = { version: 1, macros };
  ensureParentDir(PROMPT_MACROS_PATH);
  fs.writeFileSync(PROMPT_MACROS_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function createPromptMacro(input) {
  const payload = readPromptMacrosPayload();
  const macro = normalizePromptMacro({ ...input, id: crypto.randomUUID() });
  if (!macro) throw new Error("Macro heeft minimaal een naam en prompt nodig.");
  payload.macros.push(macro);
  return writePromptMacrosPayload(payload);
}

function updatePromptMacro(idRaw, input) {
  const id = String(idRaw || "").trim();
  const payload = readPromptMacrosPayload();
  const idx = payload.macros.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error("Macro niet gevonden.");
  const merged = { ...payload.macros[idx], ...input, id, createdAt: payload.macros[idx].createdAt };
  const macro = normalizePromptMacro(merged, payload.macros[idx]);
  if (!macro) throw new Error("Macro heeft minimaal een naam en prompt nodig.");
  payload.macros[idx] = macro;
  return writePromptMacrosPayload(payload);
}

function deletePromptMacro(idRaw) {
  const id = String(idRaw || "").trim();
  const payload = readPromptMacrosPayload();
  const next = payload.macros.filter((m) => m.id !== id);
  if (next.length === payload.macros.length) throw new Error("Macro niet gevonden.");
  return writePromptMacrosPayload({ ...payload, macros: next });
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

async function loadModelCatalogForConfig(config) {
  const ids = await fetchAvailableAgentModels({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
  });
  return buildModelCatalog(ids);
}

function emitModelSwitchActivity(llmCtx, resolved) {
  if (!isAutoModel(llmCtx.baseConfig?.model) || !llmCtx.pushActivity) return;
  llmCtx.pushActivity({
    phase: "model_switch",
    label: phaseLabelNl(resolved.modelRole),
    model: resolved.model,
    modelRole: resolved.modelRole,
    modelReason: resolved.modelReason,
  });
}

function addTokenUsageFromLlmData(performanceMetrics, data) {
  if (!performanceMetrics?.tokenUsage) return;
  const usage = normalizeTokenUsage(data?.usage);
  performanceMetrics.tokenUsage.promptTokens += usage.promptTokens || 0;
  performanceMetrics.tokenUsage.completionTokens += usage.completionTokens || 0;
  performanceMetrics.tokenUsage.totalTokens += usage.totalTokens || 0;
}

async function llmChatForPhase(llmCtx, options) {
  const {
    phase,
    messages,
    tools,
    tool_choice,
    temperature = 0.2,
    response_format,
    logPrefix = "llm",
    logFields = {},
    endpointUrl,
  } = options;
  const resolved = resolveLlmConfig(llmCtx.baseConfig, phase, llmCtx.routerContext, llmCtx.catalog);
  emitModelSwitchActivity(llmCtx, resolved);
  const url = endpointUrl || markdownChatCompletionsUrl(llmCtx.baseConfig.endpoint);
  const body = {
    model: resolved.model,
    temperature,
    messages,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = tool_choice ?? "auto";
  }
  if (response_format) body.response_format = response_format;

  let llmResult;
  try {
    llmResult = await fetchLlmTextWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${llmCtx.baseConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      {
        runId: llmCtx.runId,
        logPrefix,
        logFields: { ...logFields, phase, model: resolved.model },
      },
    );
  } catch (e) {
    if (isAutoModel(llmCtx.baseConfig?.model)) {
      recordModelRouterEvent({
        runId: llmCtx.runId,
        phase,
        model: resolved.model,
        intentProfile: llmCtx.intentProfile,
        experiment: resolved.experiment,
        outcome: "error",
      });
    }
    throw e;
  }

  const elapsedMs = llmResult.elapsedMs || 0;
  if (llmCtx.performanceMetrics) {
    llmCtx.performanceMetrics.llmCallCount += 1;
    llmCtx.performanceMetrics.llmMs += elapsedMs;
  }
  let data;
  try {
    data = JSON.parse(llmResult.body);
  } catch (e) {
    if (isAutoModel(llmCtx.baseConfig?.model)) {
      recordModelRouterEvent({
        runId: llmCtx.runId,
        phase,
        model: resolved.model,
        intentProfile: llmCtx.intentProfile,
        experiment: resolved.experiment,
        llmMs: elapsedMs,
        outcome: "error",
      });
    }
    throw e;
  }
  addTokenUsageFromLlmData(llmCtx.performanceMetrics, data);
  if (isAutoModel(llmCtx.baseConfig?.model)) {
    recordModelRouterEvent({
      runId: llmCtx.runId,
      phase,
      model: resolved.model,
      intentProfile: llmCtx.intentProfile,
      experiment: resolved.experiment,
      llmMs: elapsedMs,
      tokenUsage: normalizeTokenUsage(data?.usage),
      outcome: "success",
    });
  }
  llmCtx.modelTrace?.add(phase, resolved.model, elapsedMs, {
    experiment: resolved.experiment,
  });
  const message = data?.choices?.[0]?.message;
  return { resolved, llmResult, data, message, elapsedMs };
}

async function createLlmRouterContext(config, opts = {}) {
  if (!isAutoModel(config.model)) return null;
  const catalog = await loadModelCatalogForConfig(config);
  if (!catalog.length) {
    throw new Error("Auto-modus: geen modellen gevonden bij de provider.");
  }
  const intentProfile = opts.intentProfile || opts.intent?.profile || "research";
  return {
    baseConfig: config,
    catalog,
    runId: opts.runId || "—",
    intentProfile,
    routerContext: {
      intentProfile,
      intent: opts.intent,
      message: opts.userMessage || "",
      corpusWide: opts.corpusWide === true,
      contextChars: opts.contextChars || 0,
      optionalSourceHints: opts.optionalSourceHints,
    },
    pushActivity: opts.pushActivity || null,
    performanceMetrics: opts.performanceMetrics || null,
    modelTrace: opts.modelTrace || createModelTrace(),
  };
}

async function runStrategyPhaseIfNeeded(llmCtx, safeHistory, bootstrapUserMarkdown) {
  const routerConfig = readModelRouterConfig(llmCtx.baseConfig);
  if (!shouldRunStrategyPhase(llmCtx.routerContext, routerConfig)) return bootstrapUserMarkdown;
  const strategyPrompt =
    "Bepaal in maximaal 8 bullets een korte strategie: welke bronnen/tools je nodig hebt, welke volgorde, en waar risico's zitten. " +
    "Geen eindantwoord — alleen plan. Nederlands, platte tekst.";
  try {
    const result = await llmChatForPhase(llmCtx, {
      phase: "strategy",
      messages: [
        { role: "system", content: strategyPrompt },
        ...safeHistory,
        { role: "user", content: bootstrapUserMarkdown },
      ],
      temperature: 0.3,
      logPrefix: "corpus_strategy",
    });
    const plan = normalizeAssistantContentForParsing(result.message?.content).trim();
    if (!plan) return bootstrapUserMarkdown;
    return `${bootstrapUserMarkdown}\n\n---\n\n## Strategie (Auto-router)\n\n${plan}`;
  } catch (e) {
    agentLog(llmCtx.runId, "corpus_strategy_failed", { error: String(e?.message || e) });
    return bootstrapUserMarkdown;
  }
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

function chatCompactTranscript(messages) {
  const maxMessageChars = 3000;
  const maxTotalChars = 60000;
  const lines = [];
  let totalChars = 0;
  for (const m of normalizeAgentChatHistory(messages)) {
    const role = m.role === "assistant" ? "Nexus" : "Joost";
    const content = String(m.content || "").trim().slice(0, maxMessageChars);
    if (!content) continue;
    const block = `### ${role}${m.mode ? ` (${m.mode})` : ""}\n${content}\n`;
    if (totalChars + block.length > maxTotalChars) {
      lines.push("\n*[transcript ingekort voor samenvatting]*\n");
      break;
    }
    lines.push(block);
    totalChars += block.length;
  }
  return lines.join("\n---\n\n");
}

async function summarizeAgentChatMessages(config, session, messages, runId = "—") {
  const transcript = chatCompactTranscript(messages);
  if (!transcript.trim()) return "";
  const url = markdownChatCompletionsUrl(config.endpoint);
  let model = config.model;
  if (isAutoModel(config.model)) {
    try {
      const catalog = await loadModelCatalogForConfig(config);
      model = resolveLlmConfig(config, "utility", {}, catalog).model;
    } catch {
      /* val terug op config.model */
    }
  }
  const system =
    "Je maakt een compacte voortzettingssamenvatting van een Nexus-chat om contexttokens te besparen. " +
    "Bewaar alleen informatie die nodig is om het gesprek later goed voort te zetten: gebruikerdoelen, gemaakte keuzes, open acties, actieve bestanden/taken/e-mails, relevante bronnen, bugs/fixes en expliciete voorkeuren. " +
    "Neem geen lange citaten, volledige documenten, volledige mails, grote tabellen of uitgebreide toolresultaten over. " +
    "Schrijf in het Nederlands, compact en feitelijk. Geef uitsluitend JSON terug met {\"summary\":\"...\"}.";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system + currentTimePromptBlock() },
        {
          role: "user",
          content: JSON.stringify({
            chatTitle: session.title || "Nieuwe chat",
            chatId: session.id,
            previousSummary: session.summary || "",
            transcript,
          }),
        },
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Chat samenvatten mislukt (${response.status}): ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body);
  const content = normalizeAssistantContentForParsing(data?.choices?.[0]?.message?.content).trim();
  try {
    const parsed = parseAgentJsonResponse(content);
    if (typeof parsed?.summary === "string" && parsed.summary.trim()) return parsed.summary.trim();
  } catch {
    /* fallback hieronder */
  }
  return content.replace(/^```(?:json|markdown)?\s*/i, "").replace(/```$/i, "").trim();
}

async function summarizeAgentChatSession(id, runId = "—", options = {}) {
  const payload = readAgentChatsPayload();
  const idx = payload.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: "Chat not found" };
  const session = payload.sessions[idx];
  const messages = normalizeAgentChatHistory(session.messages);
  const keepRecentTurns = Math.min(12, Math.max(2, Number(options.keepRecentTurns || 8) || 8));
  if (messages.length <= keepRecentTurns + 2) {
    return { ok: false, error: "Chat is nog te kort om zinvol te compacten." };
  }
  const older = messages.slice(0, -keepRecentTurns);
  const recent = messages.slice(-keepRecentTurns);
  const config = readAgentConfig();
  if (!config?.apiKey?.trim() || !config?.endpoint?.trim() || !config?.model?.trim()) {
    return { ok: false, error: "Agentconfig ontbreekt; chat kan niet worden samengevat." };
  }
  const summary = await summarizeAgentChatMessages(config, session, older, runId);
  if (!summary.trim()) return { ok: false, error: "Samenvatting bleef leeg." };
  const now = new Date().toISOString();
  const summaryTurn = {
    role: "assistant",
    mode: "ask",
    content:
      `## Gecompacteerde eerdere chatcontext\n\n` +
      `${summary.trim()}\n\n` +
      `_Deze samenvatting vervangt ${older.length} eerdere chatberichten om contexttokens te besparen._`,
  };
  payload.sessions[idx] = {
    ...session,
    lifecycleStatus: "summarized",
    summary,
    messages: [summaryTurn, ...recent],
    updatedAt: now,
  };
  const saved = writeAgentChatsPayload(payload);
  agentLog(runId, "agent_chat_summarized", {
    chatId: id,
    beforeMessages: messages.length,
    afterMessages: payload.sessions[idx].messages.length,
    summaryChars: summary.length,
  });
  return {
    ok: true,
    activeChatId: saved.activeChatId,
    sessions: saved.sessions,
    summarizedMessages: older.length,
    keptMessages: recent.length,
    summaryChars: summary.length,
  };
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
    author: "Nexus",
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
  const { comments, agentChatHistory, agentChatUiHistory } = readReviewPayload(name);
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
  const uiHistory = [...agentChatUiHistory];
  uiHistory.push({ role: "user", content: shortUserLineForUi(newComment), mode: "agent" });
  uiHistory.push({ role: "assistant", content: replyText, mode: "agent" });
  const history = [...agentChatHistory];
  history.push({ role: "user", content: historyUserContent || userMessage, mode: "agent" });
  history.push({ role: "assistant", content: historyAssistantContent || replyText, mode: "agent" });
  writeReviewComments(
    name,
    comments,
    trimAgentChatHistory(history),
    trimAgentChatHistory(uiHistory),
  );
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
  const { chatCoerceRunId = null, patchLogRunId = null, documentPath = "" } = options;
  const logId = patchLogRunId || chatCoerceRunId;
  if (!Array.isArray(changesRaw)) throw new Error("changes moet een array zijn");

  const protectedCheck = assertPatchAllowed(documentPath, changesRaw);
  if (!protectedCheck.ok) throw new Error(protectedCheck.error);

  const doc = normalizeForPatchMatch(markdown);
  let changes = dedupePatchChanges(changesRaw.map(normalizePatchChange));
  if (chatCoerceRunId != null) {
    changes = coerceChatChangesReplaceAll(doc, changes, chatCoerceRunId);
  }

  if (isEffectivelyEmptyDocumentMarkdown(markdown)) {
    const emptyFindFill = resolveEmptyDocumentChanges(markdown, changes, { mode: "empty-find" });
    if (emptyFindFill) {
      if (logId) agentLog(logId, "empty_document_fill", { mode: "empty-find", chars: emptyFindFill.length });
      return emptyFindFill;
    }
  }

  const hasSectionScoped = changes.some((c) => c && typeof c === "object" && c.sectionId);
  const patchOptions = {
    normalizeForPatchMatch,
    coerceReplaceAll: chatCoerceRunId != null,
    onSkip: (idx, reason) => {
      if (logId) agentLog(logId, "patch_skip", { changeIndex: idx, reason });
    },
    onApplied: (idx) => {
      if (logId) agentLog(logId, "patch_applied", { changeIndex: idx });
    },
  };

  try {
    const nextDoc = hasSectionScoped
      ? applySectionScopedPatches(doc, changes, patchOptions)
      : applyExactPatchesResilient(doc, changes, patchOptions);

    return restoreLineEndingsAfterPatch(markdown, nextDoc);
  } catch (e) {
    if (isEffectivelyEmptyDocumentMarkdown(markdown)) {
      const fallback = resolveEmptyDocumentChanges(markdown, changes, { mode: "fallback" });
      if (fallback) {
        if (logId) {
          agentLog(logId, "empty_document_fill", {
            mode: "fallback",
            chars: fallback.length,
            error: String(e?.message || e),
          });
        }
        return fallback;
      }
    }
    throw e;
  }
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
    const n = countPatchFindOccurrences(markdown, find, normalizeForPatchMatch).count;
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

function normalizeParsedAgentJsonResponse(parsed) {
  let current = parsed;
  for (let i = 0; i < 2; i++) {
    if (typeof current !== "string") break;
    const trimmed = current.trim();
    if (!trimmed) break;
    try {
      current = parseAgentJsonResponse(trimmed);
    } catch {
      break;
    }
  }
  return current;
}

function replyStringFromParsedAgentResponse(parsed) {
  let reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
  for (let i = 0; i < 2; i++) {
    if (!reply.startsWith("{")) break;
    try {
      const nested = normalizeParsedAgentJsonResponse(parseAgentJsonResponse(reply));
      const nestedReply = typeof nested?.reply === "string" ? nested.reply.trim() : "";
      if (!nestedReply || nestedReply === reply) break;
      reply = nestedReply;
    } catch {
      break;
    }
  }
  return reply;
}

function decodeJsonLikeString(raw) {
  try {
    return JSON.parse(`"${String(raw).replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`);
  } catch {
    return String(raw)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
}

function extractJsonLikeStringField(text, fieldName) {
  const source = String(text || "");
  const re = new RegExp(`"${fieldName}"\\s*:\\s*"`, "g");
  const match = re.exec(source);
  if (!match) return "";
  let raw = "";
  for (let i = match.index + match[0].length; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      raw += ch;
      if (i + 1 < source.length) {
        raw += source[i + 1];
        i += 1;
      }
      continue;
    }
    if (ch === '"') return decodeJsonLikeString(raw).trim();
    raw += ch;
  }
  return "";
}

function stripJsonLikeEnvelopeFromText(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const idx = source.search(/\{\s*"(reply|changes|viewerActions|pendingMemoryActions)"/);
  if (idx > 0) return source.slice(0, idx).trim();
  return source;
}

function recoverUserFacingReplyFromMixedContent(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  try {
    return replyStringFromParsedAgentResponse(normalizeParsedAgentJsonResponse(parseAgentJsonResponse(source)));
  } catch {
    /* Mixed prose + malformed JSON-like content is handled below. */
  }
  const fieldReply = extractJsonLikeStringField(source, "reply");
  if (fieldReply) return fieldReply;
  return stripJsonLikeEnvelopeFromText(source);
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
  const reply = replyStringFromParsedAgentResponse(parsed);
  const base = reply || "(geen reply-tekst)";
  return changes.length ? `${base}\n[${changes.length} patch(es) toegepast]` : base;
}

/** @param {"review" | "chat"} agentKind */
function buildReviewAgentSystemPrompt(agentKind, replyMarkdown = true, documentPath = "") {
  const currentTime = currentTimePromptBlock();
  const instructions = agentInstructionsPromptBlock();
  const docPathHint = documentPath
    ? ` Het geopende document in de viewer heeft pad \`${documentPath}\`; noem dit pad wanneer Joost vraagt welk bestand open is. `
    : " Er is geen werkdocumentpad meegestuurd; zeg dat eerlijk bij meta-vragen over het open bestand. ";
  const replyFmt = replyMarkdown
    ? "Het veld `reply` verschijnt in een chatpaneel: daar mag je Markdown (GFM) gebruiken (koppen, lijsten, nadruk, codeblokken) als dat helpt. "
    : "Het veld `reply` verschijnt als platte tekst in een chatpaneel: gebruik géén Markdown-syntax (geen #-koppen, geen ** of __, geen backticks of fenced blocks, geen `-`/`1.` lijsten). Schrijf gewone zinnen; regeleinden zijn prima. ";

  const core =
    nexusVoicePromptBlock("review") +
    "Je bent een review-agent voor markdown. Geef uitsluitend JSON terug met {\"changes\":[{\"find\":\"...\",\"replace\":\"...\",\"replaceAll\":false}],\"reply\":\"...\"}. " +
    docPathHint +
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
    "LEEG DOCUMENT: als het zichtbare document leeg is (geen koppen/tekst; alleen eventueel verborgen metadata), gebruik precies één change met find \"\" (lege string) en replace = de volledige nieuwe Markdown-inhoud. Zet geen HTML-metadata-comments in replace. " +
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
  const documentPath = typeof logMeta.documentPath === "string" ? logMeta.documentPath.trim() : "";

  const promptPayload = {
    instruction: comment.body,
    selectedQuote: comment.quote || "",
    prefix: comment.prefix || "",
    suffix: comment.suffix || "",
    documentPath,
    fullMarkdownDocument: markdown,
    documentLength: markdown.length,
    visibleBodyEmpty: isEffectivelyEmptyDocumentMarkdown(markdown),
  };
  const userLead =
    kind === "chat"
      ? "Verwerk deze instructie uit het document-chatvenster (algemene agent) met het volledige markdowndocument als context. "
      : "Verwerk deze reviewopdracht met het volledige markdowndocument als context. ";
  const emptyDocHint = promptPayload.visibleBodyEmpty
    ? "Het zichtbare document is leeg: gebruik één patch met find \"\" en replace = volledige nieuwe inhoud (zonder metadata-comment).\n\n"
    : "";
  const userMessage =
    userLead +
    emptyDocHint +
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

  let llmResult;
  const llmCtx = logMeta.llmCtx || null;
  const reviewMessages = [
    {
      role: "system",
      content: buildReviewAgentSystemPrompt(kind, replyMarkdown, documentPath),
    },
    ...safeHistory,
    {
      role: "user",
      content: userMessage,
    },
  ];
  try {
    if (llmCtx) {
      const phaseResult = await llmChatForPhase(llmCtx, {
        phase: "review",
        messages: reviewMessages,
        temperature: 0,
        response_format: { type: "json_object" },
        endpointUrl: url,
        logPrefix: "llm",
        logFields: { step, commentId },
      });
      llmResult = phaseResult.llmResult;
    } else {
      llmResult = await fetchLlmTextWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: reviewMessages,
        }),
      }, {
        runId,
        logPrefix: "llm",
        logFields: { step, commentId },
      });
    }
  } catch (e) {
    agentLog(runId, "llm_fetch_failed", {
      step,
      commentId,
      elapsedMs: 0,
      error: String(e?.message || e),
    });
    throw e;
  }

  const elapsedMs = llmResult.elapsedMs;
  const body = llmResult.body;

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
    const parsedRaw = normalizeParsedAgentJsonResponse(parseAgentJsonResponse(contentStr));
    const parsed = normalizeReviewAgentLlmPayload(parsedRaw, contentStr, {
      parseAgentJsonResponse,
      normalizeParsedAgentJsonResponse,
    });
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
      return { changes: [], reply: recoverUserFacingReplyFromMixedContent(contentStr) };
    }
    agentLog(runId, "llm_parse_ok", {
      step,
      commentId,
      changesCount: changes.length,
      replyChars: replyStr.length,
      recoveredChangesFromReply: changes.length > 0 && (!Array.isArray(parsedRaw?.changes) || !parsedRaw.changes.length),
    });
    return { ...parsed, reply: replyStr };
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
      return { changes: [], reply: recoverUserFacingReplyFromMixedContent(contentStr) };
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
          query: {
            type: "string",
            description:
              "Optionele zoekvraag om de secties binnen dit document met BM25 te rangschikken. Gebruik meestal de kern van de gebruikersvraag.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_corpus_outline",
      description:
        "Lees tokenzuinig de meest relevante koppen/subkoppen en korte previews van één werkdocument uit Files/. Gebruik dit vóór read_corpus_section wanneer je gericht informatie zoekt.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand onder Files/.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
          query: {
            type: "string",
            description:
              "Optionele zoekvraag om de secties binnen dit memory-document met BM25 te rangschikken. Gebruik meestal de kern van de gebruikersvraag.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_corpus_section",
      description:
        "Lees alleen de inhoud van één gekozen sectie uit een werkdocument. Gebruik index, id, heading of headingPath uit read_corpus_outline.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand onder Files/.",
          },
          section: {
            type: "string",
            description: "Sectie-index, id, heading of headingPath zoals teruggegeven door read_corpus_outline.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["path", "section"],
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
      name: "read_memory_outline",
      description:
        "Lees tokenzuinig de meest relevante koppen/subkoppen en korte previews van één long-term-memory document uit Files/.memory/. Gebruik dit vóór read_memory_section wanneer je gericht informatie zoekt.",
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
      name: "read_memory_section",
      description:
        "Lees alleen de inhoud van één gekozen sectie uit een long-term-memory document. Gebruik index, id, heading of headingPath uit read_memory_outline.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad naar het .md-bestand onder Files/.memory/.",
          },
          section: {
            type: "string",
            description: "Sectie-index, id, heading of headingPath zoals teruggegeven door read_memory_outline.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["path", "section"],
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
        "Werk een bestaand long-term-memory Markdown-bestand onder Files/.memory/ bij via één exacte find/replace. NIET voor werkdocumenten: daarvoor create_work_document/update_work_document (inbox) of documentbewerking/changes op het actieve document. Lees memory-doelen eerst met read_memory_outline of read_memory_markdown. De server maakt een backup; de wijziging is interne agent-housekeeping en krijgt geen aparte gebruikersmelding.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relatief pad onder Files/.memory/ (bijv. onderwerpen/project.md). Geen werkdocument-pad uit read_corpus_outline.",
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
  {
    type: "function",
    function: {
      name: "create_work_document",
      description:
        "Maak een nieuw naamloos werkdocument in Files/00-inbox/ zonder titel. Gebruik dit wanneer de gebruiker een nieuw document wil (bijv. gespreksverslag, notitie, verslag) of wanneer je zelfstandig werkdocumenten moet aanmaken. Geef geen bestandsnaam op: Corpus Gardener classificeert en hernoemt na voldoende inhoud. Vul inhoud direct mee via content, of maak leeg aan en gebruik daarna update_work_document.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Optionele startinhoud (Markdown). Laat leeg voor een blanco document.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Corpuspaden of bronnen waarop dit document gebaseerd is.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_work_document",
      description:
        "Werk een werkdocument in Files/00-inbox/ bij (meestal een _draft-… bestand). Gebruik content voor volledige vervanging of find+replace voor een gerichte wijziging. Niet voor long-term memory (.memory/) of documenten buiten de inbox — daarvoor create_corpus_markdown/update_corpus_markdown of Agent-modus op het geopende document.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relatief pad onder Files/00-inbox/ (bijv. 00-inbox/_draft-….md).",
          },
          content: {
            type: "string",
            description: "Volledige nieuwe Markdown-inhoud (vervangt zichtbare body; metadata blijft behouden).",
          },
          find: {
            type: "string",
            description: "Letterlijke unieke substring voor gerichte vervanging (alternatief voor content).",
          },
          replace: {
            type: "string",
            description: "Nieuwe tekst bij find/replace.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description: "Bronnen die de update onderbouwen.",
          },
        },
        required: ["path"],
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

const CONFLUENCE_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_confluence",
      description:
        "Doorzoek Confluence via de gekoppelde browser-sessie (of PAT). Gebruik dit wanneer de gebruiker vraagt naar Confluence-inhoud zonder pageId/URL, wanneer je eerst een relevante Confluence-pagina moet vinden, of wanneer de opdracht duidelijk aanleiding geeft om Confluence als bron te raadplegen.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Concrete zoekterm voor Confluence, bijvoorbeeld een paginatitel, onderwerp, klantnaam of procesnaam.",
          },
          spaceKey: {
            type: "string",
            description: "Optionele Confluence space key om de zoekopdracht te beperken.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal resultaten (1-50). Gebruik meestal 5-10.",
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
  {
    type: "function",
    function: {
      name: "read_confluence_page",
      description:
        "Haal één Confluence-pagina op via de gekoppelde browser-sessie (of PAT). Gebruik dit wanneer de gebruiker een Confluence pageId, /pages/...-URL of /display/{spaceKey}/{title}-URL geeft, of expliciet vraagt om Confluence-inhoud te lezen.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "Numerieke Confluence pageId. Mag leeg blijven als url een pageId bevat.",
          },
          url: {
            type: "string",
            description: "Confluence-pagina-URL. Ondersteunt URLs met pageId en /display/{spaceKey}/{paginatitel}.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_confluence_page",
      description:
        "Schrijf een bestaande Confluence-pagina terug via de gekoppelde browser-sessie. Alleen gebruiken wanneer de gebruiker expliciet vraagt om een Confluence-pagina te wijzigen of op te slaan. Vereist pageId en de volledige nieuwe markdown; baseVersion komt uit read_confluence_page.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Numerieke Confluence pageId." },
          title: { type: "string", description: "Paginatitel. Leeg = huidige titel behouden." },
          baseVersion: { type: "number", description: "Huidige version.number uit read_confluence_page." },
          markdown: { type: "string", description: "Volledige nieuwe Markdown-inhoud." },
          reason: { type: "string", description: "Korte reden voor het activiteitenlog." },
        },
        required: ["pageId", "markdown"],
      },
    },
  },
];

const OUTLOOK_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_outlook_mail",
      description:
        "Doorzoek lokaal Outlook Desktop via het Windows-profiel. Read-only. Gebruik dit wanneer de gebruiker vraagt naar inkomende (inbox), verzonden (sent) of concept-e-mail (drafts/concepten). Zoekt standaard fuzzy/token-based op onderwerp, afzender, ontvangers en categorieën; body-search staat bewust uit voor stabiliteit en kan expliciet met includeBodyForSearch. fromDate/toDate mogen leeg blijven; standaard zoekt de backend in de laatste 90 dagen (voor concepten wordt op laatste wijzigingsdatum gesorteerd). Geef wel een expliciete range als de gebruiker een periode noemt.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Tekstfilter op onderwerp, afzender, e-mailadres of body. Mag leeg zijn binnen een duidelijke datumrange.",
          },
          fromDate: {
            type: "string",
            description: "Startdatum/tijd in YYYY-MM-DD of ISO-formaat. Optioneel; default is 90 dagen geleden.",
          },
          toDate: {
            type: "string",
            description: "Einddatum/tijd in YYYY-MM-DD of ISO-formaat. Optioneel; default is nu.",
          },
          folder: {
            type: "string",
            enum: ["inbox", "sent", "drafts"],
            description: "Welke map doorzocht wordt: inbox (ontvangen), sent (verzonden) of drafts (concepten/niet-verzonden). Standaard inbox.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal resultaten (1-25). Gebruik meestal 5-10.",
          },
          includeBody: {
            type: "boolean",
            description: "Alleen true zetten als de gebruiker expliciet inhoudelijke mailtekst nodig heeft; standaard false met snippet.",
          },
          includeBodyForSearch: {
            type: "boolean",
            description:
              "Alleen true als zoeken op onderwerp/afzender/ontvangers onvoldoende is en bodytekst echt nodig is. Dit is trager en kwetsbaarder voor Outlook COM-problemen.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_outlook_mail",
      description:
        "Lees één lokaal Outlook-mailitem op basis van entryId uit search_outlook_mail. Read-only. Gebruik dit pas nadat een zoekresultaat relevant lijkt of de gebruiker volledige mailinhoud vraagt.",
      parameters: {
        type: "object",
        properties: {
          entryId: {
            type: "string",
            description: "Outlook EntryID uit een eerder search_outlook_mail resultaat.",
          },
          storeId: {
            type: "string",
            description: "Optionele Outlook StoreID uit het zoekresultaat.",
          },
          bodyMaxChars: {
            type: "number",
            description: "Maximaal aantal body-tekens (500-20000).",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["entryId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_outlook_calendar",
      description:
        "Doorzoek de lokale Outlook-agenda via Outlook Desktop. Read-only. Gebruik dit voor vragen over agenda, afspraken, planning of dagindeling. Zoekt fuzzy/token-based op onderwerp, locatie, organisator, genodigden en body. Geef date voor een dagagenda of fromDate/toDate voor een range; zonder range zoekt de backend van 30 dagen terug tot 120 dagen vooruit.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Optionele dag in ISO-formaat YYYY-MM-DD voor een dagagenda. Gebruik nooit ambigu 08-06/06-08; zet Nederlandse datums altijd om naar YYYY-MM-DD.",
          },
          fromDate: {
            type: "string",
            description:
              "Startdatum/tijd in ISO-formaat, bij voorkeur YYYY-MM-DD of volledige ISO timestamp. Gebruik nooit ambigu 08-06/06-08.",
          },
          toDate: {
            type: "string",
            description:
              "Einddatum/tijd in ISO-formaat, bij voorkeur YYYY-MM-DD of volledige ISO timestamp. Gebruik nooit ambigu 08-06/06-08.",
          },
          query: {
            type: "string",
            description: "Optioneel tekstfilter op onderwerp, locatie, organisator, genodigden of body. Gebruik liever kernwoorden/namen dan een lange natuurlijke zin.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal afspraken (1-50).",
          },
          includeBody: {
            type: "boolean",
            description: "Alleen true zetten als notities/agenda-body expliciet nodig zijn; standaard false met snippet.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_2ndbrain_calendar",
      description:
        "Doorzoek uitsluitend de door iOMS beheerde Outlook-agenda met naam 2ndbrain. Gebruik dit om te controleren welke afspraken het systeem zelf beheert. Deze tool leest niet de hoofdagenda. Zoekt fuzzy/token-based; zonder range zoekt de backend van 30 dagen terug tot 120 dagen vooruit.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Optionele dag in ISO-formaat YYYY-MM-DD. Gebruik nooit ambigu 08-06/06-08.",
          },
          fromDate: {
            type: "string",
            description: "Startdatum/tijd in ISO-formaat wanneer date niet gebruikt wordt. Optioneel; default is 30 dagen geleden.",
          },
          toDate: {
            type: "string",
            description: "Einddatum/tijd in ISO-formaat wanneer date niet gebruikt wordt. Optioneel; default is 120 dagen vooruit.",
          },
          query: {
            type: "string",
            description: "Optioneel tekstfilter op onderwerp, locatie of body. Gebruik liever kernwoorden/namen dan een lange natuurlijke zin.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal afspraken (1-100).",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_2ndbrain_calendar_event",
      description:
        "Maak een afspraak aan in uitsluitend de door iOMS beheerde Outlook-agenda met naam 2ndbrain. Gebruik dit alleen als de gebruiker expliciet vraagt dat het systeem iets in zijn eigen 2ndbrain-agenda plant of beheert. Schrijf nooit in de hoofdagenda.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Kort onderwerp van de afspraak.",
          },
          start: {
            type: "string",
            description: "Startdatum/tijd als ISO timestamp, bij voorkeur met timezone, bijvoorbeeld 2026-06-08T10:00:00+02:00.",
          },
          end: {
            type: "string",
            description: "Einddatum/tijd als ISO timestamp, bij voorkeur met timezone. Moet na start liggen.",
          },
          location: {
            type: "string",
            description: "Optionele locatie.",
          },
          body: {
            type: "string",
            description: secondBrainEventBodyToolHint(),
          },
          reminderSet: {
            type: "boolean",
            description: "Of Outlook een reminder moet zetten. Standaard false.",
          },
          reminderMinutesBeforeStart: {
            type: "number",
            description: "Aantal minuten voor start voor reminder, als reminderSet true is.",
          },
          display: {
            type: "boolean",
            description: "Of het afspraakvenster in Outlook geopend wordt. Standaard false.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["subject", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_2ndbrain_calendar_event",
      description:
        "Verplaats of werk één bestaande afspraak bij in uitsluitend de door iOMS beheerde Outlook-agenda met naam 2ndbrain. Gebruik eerst search_2ndbrain_calendar om het juiste item en entryId te vinden. Deze tool mag nooit hoofdagenda-items aanpassen.",
      parameters: {
        type: "object",
        properties: {
          entryId: {
            type: "string",
            description: "Outlook EntryID uit search_2ndbrain_calendar van het te wijzigen 2ndbrain-item.",
          },
          storeId: {
            type: "string",
            description: "Optionele StoreID uit search_2ndbrain_calendar.",
          },
          subject: {
            type: "string",
            description: "Optioneel nieuw onderwerp. Laat weg om ongewijzigd te laten.",
          },
          start: {
            type: "string",
            description: "Optionele nieuwe startdatum/tijd als ISO timestamp, bij voorkeur met timezone.",
          },
          end: {
            type: "string",
            description: "Optionele nieuwe einddatum/tijd als ISO timestamp, bij voorkeur met timezone. Moet na start liggen.",
          },
          location: {
            type: "string",
            description: "Optionele nieuwe locatie. Lege string wist de locatie.",
          },
          body: {
            type: "string",
            description:
              "Optionele nieuwe notitie/body. Lege string wist de notitie. " + secondBrainEventBodyToolHint(),
          },
          reminderSet: {
            type: "boolean",
            description: "Optioneel: reminder aan/uit zetten.",
          },
          reminderMinutesBeforeStart: {
            type: "number",
            description: "Aantal minuten voor start voor reminder, als reminderSet true is.",
          },
          display: {
            type: "boolean",
            description: "Of het afspraakvenster in Outlook geopend wordt. Standaard false.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["entryId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_outlook_draft",
      description:
        "Maak een conceptmail aan in lokale klassieke Outlook Desktop. De mail wordt opgeslagen/geopend als concept en NOOIT verzonden. Gebruik dit alleen als de gebruiker expliciet vraagt om een conceptmail of maildraft te maken. Baseer de tekst waar nodig eerst op corpus/geheugen, Outlook, Confluence of web_search.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Ontvangers in Aan. Gebruik namen/e-mailadressen die de gebruiker expliciet gaf of die met voldoende zekerheid uit context blijken.",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "Optionele CC-ontvangers.",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "Optionele BCC-ontvangers. Alleen gebruiken als de gebruiker dit expliciet vraagt.",
          },
          subject: {
            type: "string",
            description: "Kort, duidelijk onderwerp van de conceptmail.",
          },
          body: {
            type: "string",
            description: "Volledige platte tekst van de conceptmail. Geen Markdown-fences; schrijf zoals de mail verzonden zou kunnen worden.",
          },
          display: {
            type: "boolean",
            description: "Of het conceptvenster in Outlook geopend wordt. Standaard true.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["to", "subject", "body"],
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

const TIMESHEET_TOOLS = [
  {
    type: "function",
    function: {
      name: "build_timesheet_draft",
      description:
        "Genereer een evidence-first urenregistratie-concept voor een week/periode. Combineert activity logs, Kanban, e-mailmemory, Outlook inbox/sent en agenda(s). Doelverdeling: 80% klant / 20% overig per dag, 8,0 u per werkdag, één regel per activiteit. Eerste stap bij urenregistratie.",
      parameters: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "Startdatum YYYY-MM-DD (default: maandag huidige week)." },
          toDate: { type: "string", description: "Einddatum YYYY-MM-DD (default: vrijdag huidige week)." },
          includeCalendar: {
            type: "boolean",
            description: "Outlook- en 2ndbrain-agenda meenemen (default true).",
          },
          includeOutlookMail: {
            type: "boolean",
            description: "Outlook inbox en sent items meenemen (default true).",
          },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
      },
    },
  },
];

const EMAIL_MEMORY_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_email_memory",
      description:
        "Doorzoek read-only e-mailmemory: afgeleide Outlook-samenvattingen, acties, deadlines en metadata uit de e-mailagent-state, compacte eventstore, digests en legacy e-mailnotities. Gebruik dit bij vragen over recente e-mailsignalen, acties, deadlines, HR/PDM/evaluatie, persoonlijke ontwikkeling, klanten/projecten of 'wat speelt er', ook als de gebruiker niet expliciet Outlook noemt. Bevat geen volledige e-mailbody.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Zoekvraag, bijvoorbeeld 'persoonlijke ontwikkeling PDM evaluatie', 'vandaag acties', 'SLA monitoring'.",
          },
          limit: {
            type: "number",
            description: "Maximaal aantal resultaten (1-50).",
          },
          includeArchived: {
            type: "boolean",
            description: "Ook gearchiveerde e-mailacties meenemen. Standaard false.",
          },
          requiresActionOnly: {
            type: "boolean",
            description: "Alleen e-mails tonen die als actie nodig zijn geclassificeerd.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_email_followup_context",
      description:
        "Verwerk Joosts aanvullende context of correctie voor één actieve e-mailagent-follow-up. Gebruik dit wanneer Joost in Nexus zegt dat een e-mail anders moet worden geïnterpreteerd, welke opvolging nodig is, of welke context belangrijk is. De tool herinterpreteert summary/importance/action/priority/tags en schrijft de context als afgeleid e-mailsignaal naar memory.",
      parameters: {
        type: "object",
        properties: {
          notificationId: {
            type: "string",
            description: "Id van de e-mailagent-notificatie uit de actieve e-mailcontext.",
          },
          userContext: {
            type: "string",
            description: "Joosts aanvullende context/correctie, compact maar volledig.",
          },
          reason: {
            type: "string",
            description: "Korte reden voor jezelf / voor het activiteitenlog.",
          },
        },
        required: ["notificationId", "userContext"],
      },
    },
  },
];

const NEXUS_DEBUG_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_nexus_debug_logs",
      description:
        "Lees de Nexus errorlog en fixlog. Gebruik dit wanneer je bugs, foutmeldingen, onvolkomenheden of verificatie-instructies moet bekijken.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["error", "fix", "both"],
            description: "Welke log je wilt lezen. Standaard both.",
          },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_nexus_error_log",
      description:
        "Schrijf een fout, testbevinding of onvolkomenheid naar de Nexus errorlog zodat Cursor dit later kan oplossen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          component: { type: "string" },
          tool: { type: "string" },
          command: { type: "string", description: "Wat probeerde Nexus te doen?" },
          error: { type: "string", description: "Concrete foutmelding of observatie." },
          context: { type: "string", description: "Korte context van de fout." },
          detail: { type: "object", description: "Aanvullende technische context." },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
        required: ["title", "error"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_nexus_fix_log",
      description:
        "Schrijf een fixnotitie of verificatie-instructie naar de Nexus fixlog. Als status geverifieerd/opgelost is en errorId is gezet, worden de bijbehorende errorlog- en fixlog-secties automatisch uit de actieve bugmeldingen opgeschoond.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          errorId: { type: "string" },
          status: { type: "string" },
          cause: { type: "string" },
          fix: { type: "string" },
          verification: { type: "string", description: "Concrete testinstructies die Nexus kan uitvoeren." },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
        required: ["title", "fix"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cleanup_nexus_debug_issue",
      description:
        "Verwijder een succesvol opgeloste bugmelding en de bijbehorende fix-/testinstructie uit de actieve Nexus errorlog en fixlog op basis van errorId. Gebruik dit pas nadat verificatie succesvol is.",
      parameters: {
        type: "object",
        properties: {
          errorId: { type: "string", description: "De id uit de errorlog/fixlog, bijvoorbeeld nexus-error-..." },
          reason: { type: "string", description: "Korte reden voor het activiteitenlog." },
        },
        required: ["errorId"],
      },
    },
  },
];

const KANBAN_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_kanban_tasks",
      description:
        INTERNAL_KANBAN_TOOL_PREFIX +
        "Doorzoek de centrale Actie-Kanban op project, persoon, status, tekst, bron of recente activiteit. Gebruik dit proactief bij vragen over «Kanban», «Kanban bord», «Kanban taken», werk, acties, planning, opvolging, open taken, urenrapportages en week-/dagoverzichten. Belangrijk: bij rapportages of onduidelijke context eerst breed zoeken met query='', geen statusfilter, limit 100-200 en eventueel since='7d' of since='14d'; pas daarna verfijnen.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Zoektekst zoals klant, onderwerp, next action of bronlabel. Laat leeg voor een brede inventarisatie." },
          project: { type: "string", description: "Optionele project-/klantfilter." },
          person: { type: "string", description: "Optionele persoonfilter." },
          status: { type: "string", enum: KANBAN_STATUSES, description: "Optionele Kanban-status." },
          since: { type: "string", description: "Optionele activiteit/updatedAt-filter, bijvoorbeeld '7d', '14d' of ISO-datum. Handig voor weekrapportages." },
          eventLimit: { type: "number", description: "Maximaal aantal recente Kanban-events om mee terug te geven (0-200)." },
          limit: { type: "number", description: "Maximaal aantal taken (1-500). Gebruik 100-200 voor rapportages." },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_kanban_task",
      description: INTERNAL_KANBAN_TOOL_PREFIX + "Lees één Actie-Kanban-taak met historie en bronnen.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kanban task id." },
          reason: { type: "string", description: "Korte reden voor jezelf / voor het activiteitenlog." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_kanban_task",
      description:
        INTERNAL_KANBAN_TOOL_PREFIX +
        "Maak een nieuwe taak in de centrale Actie-Kanban. Gebruik dit voor concrete acties die nog niet bij een bestaande taak passen. Voeg altijd een sourceRef toe.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Korte taaknaam." },
          status: { type: "string", enum: KANBAN_STATUSES, description: "Startstatus. Gebruik bij twijfel inbox." },
          priority: { type: "string", enum: KANBAN_PRIORITIES, description: "Prioriteit." },
          project: { type: "string", description: "Canonieke klant- of projectnaam; maak een nieuwe duidelijke naam aan als die nog niet in projectCatalog staat." },
          people: { type: "array", items: { type: "string" }, description: "Betrokken personen." },
          dueDate: { type: "string", description: "Optionele deadline in ISO-formaat of YYYY-MM-DD." },
          nextAction: { type: "string", description: "Eerstvolgende concrete actie." },
          summary: { type: "string", description: "Korte contextsamenvatting." },
          sourceRefs: { type: "array", items: { type: "object" }, description: "Bronnen die de taak verklaren." },
          rationale: { type: "string", description: "Waarom deze taak nodig is." },
        },
        required: ["title", "nextAction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_kanban_comment",
      description:
        INTERNAL_KANBAN_TOOL_PREFIX +
        "Voeg een commentaardraad toe aan een Actie-Kanban-taak. Gebruik dit wanneer Joost vraagt commentaar, analyse of notities op de taak te plaatsen — niet update_kanban_task.summary. De volledige inhoud hoort in body.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kanban task id." },
          body: { type: "string", description: "Volledige commentaar- of analysetekst (markdown toegestaan)." },
          rationale: { type: "string", description: "Korte toelichting op de actie." },
        },
        required: ["id", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_kanban_task",
      description:
        INTERNAL_KANBAN_TOOL_PREFIX +
        "Werk een bestaande Actie-Kanban-taak bij. Zoek of lees eerst als je niet zeker weet welke taak bedoeld is. Voeg bij nieuwe informatie een sourceRef toe. Gebruik add_kanban_comment voor lange commentaar/analyse; summary is alleen voor een korte taaksamenvatting.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kanban task id." },
          title: { type: "string" },
          priority: { type: "string", enum: KANBAN_PRIORITIES },
          project: { type: "string" },
          people: { type: "array", items: { type: "string" } },
          dueDate: { type: "string" },
          nextAction: { type: "string" },
          summary: { type: "string" },
          sourceRefs: { type: "array", items: { type: "object" } },
          rationale: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_kanban_task",
      description: INTERNAL_KANBAN_TOOL_PREFIX + "Verplaats een Actie-Kanban-taak naar een andere status.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kanban task id." },
          status: { type: "string", enum: KANBAN_STATUSES, description: "Nieuwe status." },
          rationale: { type: "string", description: "Waarom deze status klopt." },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "merge_kanban_tasks",
      description:
        INTERNAL_KANBAN_TOOL_PREFIX +
        "Fuseer twee bestaande Actie-Kanban-taken tot één overkoepelende taak. Lees beide taken eerst, bepaal zelf de beste titel, status, prioriteit, samenvatting en nextAction, en gebruik deze tool daarna. De primaire taak blijft bestaan als overkoepelende taak; de tweede taak wordt naar Genegeerd verplaatst met audit-historie.",
      parameters: {
        type: "object",
        properties: {
          primaryId: { type: "string", description: "Taak-id die blijft bestaan als overkoepelende taak." },
          secondaryId: { type: "string", description: "Taak-id die in de primaire taak wordt opgenomen." },
          title: { type: "string", description: "Nieuwe overkoepelende taaknaam." },
          status: { type: "string", enum: KANBAN_STATUSES, description: "Status voor de overkoepelende taak." },
          priority: { type: "string", enum: KANBAN_PRIORITIES, description: "Prioriteit voor de overkoepelende taak." },
          project: { type: "string", description: "Canonieke klant- of projectnaam; maak een nieuwe duidelijke naam aan als die nog niet in projectCatalog staat." },
          people: { type: "array", items: { type: "string" }, description: "Samengevoegde betrokken personen." },
          dueDate: { type: "string", description: "Deadline voor de overkoepelende taak, indien relevant." },
          nextAction: { type: "string", description: "Eerstvolgende concrete actie voor de overkoepelende taak." },
          summary: { type: "string", description: "Samenvatting die de context van beide taken dekt." },
          rationale: { type: "string", description: "Waarom deze twee taken samengevoegd zijn." },
        },
        required: ["primaryId", "secondaryId", "title", "nextAction", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_kanban_source",
      description: INTERNAL_KANBAN_TOOL_PREFIX + "Koppel een e-mail, chat, document of andere bron aan een bestaande Actie-Kanban-taak.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kanban task id." },
          sourceRef: { type: "object", description: "Bron met type, label, entryId, notificationId, path, timestamp of url." },
          rationale: { type: "string" },
        },
        required: ["id", "sourceRef"],
      },
    },
  },
];

const MEMORY_WRITE_TOOL_NAMES = new Set(["create_corpus_markdown", "update_corpus_markdown", "suggest_corpus_deletion"]);
const WORK_WRITE_TOOL_NAMES = new Set(["create_work_document", "update_work_document"]);

function askToolsForOptions(opts = {}) {
  const tools = [];
  if (opts.enableCorpusTools) {
    tools.push(
      ...CORPUS_MARKDOWN_TOOLS.filter((tool) => {
        const name = tool?.function?.name;
        if (MEMORY_WRITE_TOOL_NAMES.has(name)) return opts.enableMemoryWriteTools === true;
        if (WORK_WRITE_TOOL_NAMES.has(name)) {
          if (opts.enableWorkDocumentTools === false) return false;
          return opts.enableCorpusTools !== false;
        }
        return true;
      }),
    );
  }
  if (opts.enableEmailMemory) tools.push(...EMAIL_MEMORY_TOOLS);
  if (opts.enableKanban) tools.push(...KANBAN_TOOLS);
  tools.push(...NEXUS_DEBUG_TOOLS);
  if (opts.enableActivityLogs) tools.push(...ACTIVITY_LOG_TOOLS);
  if (opts.enableTimesheet) tools.push(...TIMESHEET_TOOLS);
  if (opts.enableWebSearch) tools.push(...WEB_SEARCH_TOOLS);
  if (opts.enableConfluence) tools.push(...CONFLUENCE_TOOLS);
  if (opts.enableOutlook) tools.push(...OUTLOOK_TOOLS);
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
  const runId = logMeta.runId ?? "—";
  const nexusRunContext = corpusOpts.nexusRunContext || createNexusRunContext(runId);
  const intentGroups = corpusOpts.intent?.enabledToolGroups;
  const fromIntent = intentGroups ? toolGroupsToCorpusOpts(intentGroups) : {};
  const replyMarkdown = corpusOpts.replyMarkdown !== false;
  const enableCorpusTools =
    corpusOpts.enableCorpusTools !== false && (fromIntent.enableCorpusTools !== false || !intentGroups);
  const enableEmailMemory =
    corpusOpts.enableEmailMemory !== false && (fromIntent.enableEmailMemory !== false || !intentGroups);
  const enableKanban = corpusOpts.enableKanban !== false && (fromIntent.enableKanban !== false || !intentGroups);
  const enableWebSearch =
    corpusOpts.enableWebSearch === true || (corpusOpts.enableWebSearch !== false && fromIntent.enableWebSearch === true);
  const enableActivityLogs =
    corpusOpts.enableActivityLogs === true ||
    (corpusOpts.enableActivityLogs !== false && fromIntent.enableActivityLogs === true);
  const enableTimesheet =
    corpusOpts.enableTimesheet === true ||
    (corpusOpts.enableTimesheet !== false && fromIntent.enableTimesheet === true) ||
    enableActivityLogs;
  const enableConfluence =
    corpusOpts.enableConfluence !== false && (fromIntent.enableConfluence !== false || !intentGroups);
  const enableOutlook =
    (corpusOpts.enableOutlook === true || (corpusOpts.enableOutlook !== false && fromIntent.enableOutlook === true)) &&
    OUTLOOK_TOOLS_ENABLED;
  const enableMemoryWriteTools =
    corpusOpts.enableMemoryWriteTools === true ||
    (corpusOpts.enableMemoryWriteTools !== false && fromIntent.enableMemoryWriteTools === true);
  const enableWorkDocumentTools =
    corpusOpts.enableWorkDocumentTools !== false &&
    (fromIntent.enableWorkDocumentTools !== false || !intentGroups);
  const structuredToolContext =
    corpusOpts.structuredToolContext === true ||
    (corpusOpts.structuredToolContext !== false && nexusStructuredEvidenceEnabled(corpusOpts.agentMode || "ask"));
  const tools = askToolsForOptions({
    enableCorpusTools,
    enableEmailMemory,
    enableKanban,
    enableWebSearch,
    enableActivityLogs,
    enableTimesheet,
    enableConfluence,
    enableOutlook,
    enableMemoryWriteTools,
    enableWorkDocumentTools,
  });
  const activities = [];
  const corpusCreatedPaths = [];
  const executedMemoryActions = [];
  const pendingMemoryActions = [];
  let structuredToolContextResult = null;
  const performanceMetrics = {
    startedAt: Date.now(),
    contextChars: String(bootstrapUserMarkdown || "").length,
    retrievalMeta: corpusOpts.retrievalMeta || null,
    llmCallCount: 0,
    llmMs: 0,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    toolCallCount: 0,
    retrievedChars: 0,
    replyChars: 0,
  };

  const intentProfile = corpusOpts.intent?.profile || "research";
  const routerContext = {
    intentProfile,
    intent: corpusOpts.intent,
    message: corpusOpts.userMessage || "",
    corpusWide: corpusOpts.corpusWide === true,
    contextChars: String(bootstrapUserMarkdown || "").length,
    optionalSourceHints: corpusOpts.optionalSourceHints,
  };

  let modelCatalog = [];
  let modelTrace = null;
  if (isAutoModel(config.model)) {
    modelTrace = createModelTrace();
    try {
      modelCatalog = await loadModelCatalogForConfig(config);
    } catch (e) {
      agentLog(runId, "model_catalog_load_failed", { error: String(e?.message || e) });
      throw new Error(
        `Auto-modus: modelcatalogus laden mislukt. Laad modellen in Instellingen of kies een vast model. (${String(e?.message || e)})`,
      );
    }
    if (!modelCatalog.length) {
      throw new Error("Auto-modus: geen modellen gevonden bij de provider.");
    }
  }

  const pushActivity = (row) => {
    const payload = { type: "activity", ts: Date.now(), ...row };
    activities.push(payload);
    try {
      streamActivity?.(payload);
    } catch {
      /* streaming-client verbinding kan gesloten zijn */
    }
  };

  const llmCtx = {
    baseConfig: config,
    catalog: modelCatalog,
    runId,
    intentProfile,
    routerContext,
    pushActivity,
    performanceMetrics,
    modelTrace,
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
    nexusVoicePromptBlock("tool") +
    "Je werkt in een persoonlijke Markdown-werkomgeving met drie lagen: werkdocumenten, actieve chat als short-term memory, en Files/.memory/ als long-term memory. Beantwoord uiteindelijk in het Nederlands, helder en waarheidsgetrouw. " +
    (enableCorpusTools
      ? "Je hebt read-only retrieval tools voor werkdocumenten en long-term memory: read_corpus_outline, read_corpus_section, read_corpus_markdown, read_memory_outline, read_memory_section en read_memory_markdown. " +
        (enableMemoryWriteTools
          ? "Je hebt daarnaast memory-write tools create_corpus_markdown, update_corpus_markdown en suggest_corpus_deletion. "
          : "Je hebt in deze call geen memory-write tools; beantwoord de vraag zonder geheugenmutaties. ") +
        "Je hebt werkdocument-tools create_work_document en update_work_document om naamloze nieuwe documenten in 00-inbox/ aan te maken en te vullen; Corpus Gardener classificeert en hernoemt ze daarna automatisch. Gebruik create_work_document voor nieuwe gespreksverslagen, notities en vergelijkbare werkdocumenten; gebruik update_work_document om een inbox-draft te vullen. Als het geopende document al een inbox-draft is, mag je ook Agent-modus/changes gebruiken. " +
        "Corpus Ask betekent dat je werkdocumenten en long-term memory als twee gescheiden zoekruimtes gebruikt: start bij de compacte BM25-routekaarten in het user-bericht en schaal alleen op met tools als je meer bewijs nodig hebt. " +
        "Gebruik bij gerichte vragen eerst read_corpus_outline/read_memory_outline met een korte query op basis van de gebruikersvraag; de server rangschikt secties dan met BM25. Lees daarna met read_corpus_section/read_memory_section alleen de gekozen kop of subkop. " +
        "Gebruik read_corpus_markdown/read_memory_markdown vooral bij kleine of ongestructureerde documenten, of wanneer je echt het volledige bestand nodig hebt. " +
        "Bij brede vragen (overzicht, inventarisatie, vergelijking, alles/hele corpus) lees je meerdere relevante bestanden in rondes totdat de context voldoende is afgedekt. " +
        "De heuristische baseline in het user-bericht bevat bovenaan **Viewercontext** met het pad van het geopende document; respecteer dat als waarheid over wat Joost open heeft. Gebruik tools actief om gaten te dichten in plaats van alleen uit het geopende document te antwoorden. " +
        (enableMemoryWriteTools
          ? "Ga autonoom met long-term memory om: werk bestaande memory-documenten bij wanneer nieuwe duurzame context daar logisch thuishoort, of maak zelfstandig nieuwe memory-documenten aan als er structureel over onderwerpen/personen/klanten/voorkeuren/werkwijzen wordt gesproken en er geen passend memory-document bestaat. Vraag de gebruiker niet of een onderwerp een eigen document nodig heeft; beslis dat zelf. Belangrijk: geheugenacties die je via create_corpus_markdown of update_corpus_markdown aanvraagt worden direct door de server uitgevoerd als interne agent-housekeeping. Zeg nooit dat je geen schrijfrechten op Files/.memory/ hebt wanneer deze memory-write tools beschikbaar zijn; gebruik dan de tool of pendingMemoryActions. Geef geen aparte melding dat memory is bijgewerkt en vraag geen akkoord. Noem in je reply geen storage-beslissingen, bestandsnamen, memory-paden of housekeeping-acties zoals aanmaken, bijwerken, opslaan of vastleggen, tenzij de gebruiker expliciet vraagt waar iets staat of om een audit/inspectie van memory. Voer waar nodig meerdere memory-mutaties uit binnen één promptverwerking. Gebruik create_corpus_markdown alleen als er geen geschikt bestaand memory-document is; gebruik update_corpus_markdown alleen na lezen van het memory-doelbestand en met exacte find/replace. Documenten verwijderen is verboden: gebruik alleen suggest_corpus_deletion. "
          : "")
      : "De user-context bevat het huidige document als referentie; je hebt geen tool om lokale bestanden te lezen. ") +
    ASK_CURIOSITY_RULE +
    NEXUS_RESEARCH_BASELINE_RULE +
    (enableEmailMemory
      ? "Je hebt ook e-mailagent-tools: **search_email_memory** voor read-only e-mailmemory en **update_email_followup_context** om Joosts aanvullende context/correctie voor een actieve e-mailfollow-up te verwerken. Een compacte e-mailmemory-baseline staat al in het user-bericht; gebruik search_email_memory opnieuw wanneer je recentere signalen, andere filters of meer detail nodig hebt. Gebruik search_email_memory ook proactief wanneer een vraag kan raken aan recente e-mailsignalen, open acties, deadlines, HR/PDM/evaluatie, persoonlijke ontwikkeling, klant-/projectsignalen of 'wat speelt er', ook als de gebruiker niet letterlijk Outlook of e-mail noemt. Als de user-context een actieve e-mailfollow-up bevat en Joost geeft context/correctie/opvolginstructie voor die e-mail, gebruik dan update_email_followup_context met het notificationId uit de context. Deze tools bevatten geen volledige mailbody; als daarna volledige actuele mailinhoud nodig is en Outlook-tools beschikbaar zijn, kun je gericht search_outlook_mail/read_outlook_mail gebruiken. "
      : "") +
    (enableKanban
      ? `Je hebt ook Actie-Kanban tools: search_kanban_tasks, read_kanban_task, create_kanban_task, update_kanban_task, add_kanban_comment, move_kanban_task, merge_kanban_tasks en link_kanban_source. ${INTERNAL_KANBAN_DISAMBIGUATION_RULE} ${getKanbanProjectCatalogPrompt(loadKanbanProjectRegistry(), { limit: 30 })} Een compacte Kanban-baseline staat al in het user-bericht; gebruik search_kanban_tasks opnieuw wanneer je andere filters, meer taken of recentEvents nodig hebt. Gebruik Kanban proactief bij vragen over «Kanban», «Kanban bord», «Nexus Kanban», «Kanban taken», werk, acties, planning, opvolging, deadlines, e-mails die actie vragen, urenrapportages, week-/dagoverzichten of 'wat moet ik doen'. Voor rapportages en brede vragen: begin altijd met een brede search_kanban_tasks-call met query='', geen statusfilter, limit 100-200 en een passende since zoals '7d' of '14d'; gebruik taken én recentEvents uit de response. Concludeer niet dat er geen Kanban-activiteit was op basis van één smalle query of statusfilter. Zoek altijd eerst naar bestaande taken voordat je een nieuwe taak maakt. Als Joost vraagt commentaar of analyse op een taak te plaatsen: gebruik add_kanban_comment met de volledige tekst; zet lange inhoud niet alleen in summary. Als Joost vraagt twee taken te fuseren: lees beide taken, ontwerp één overkoepelende taak met concrete nextAction, gecombineerde context en bronnen, en roep daarna merge_kanban_tasks aan. Elke nieuwe, bijgewerkte of gefuseerde taak moet een concrete nextAction en waar mogelijk sourceRefs hebben. `
      : "") +
    "Je hebt altijd Nexus debugbridge-tools: read_nexus_debug_logs, append_nexus_error_log, append_nexus_fix_log en cleanup_nexus_debug_issue. Gebruik append_nexus_error_log automatisch wanneer een tool faalt, wanneer de gebruiker aangeeft ontevreden te zijn met een resultaat, of wanneer je tijdens verificatie een onvolkomenheid vindt. Gebruik read_nexus_debug_logs wanneer de gebruiker vraagt om fixes te verifieren of om bestaande fout-/fixcontext te bekijken. Schrijf testbevindingen compact en concreet terug naar de errorlog zolang een probleem nog niet opgelost is. Zodra een fix succesvol is geverifieerd, gebruik cleanup_nexus_debug_issue of append_nexus_fix_log met status geverifieerd/opgelost en hetzelfde errorId, zodat de opgeloste bugmelding en testinstructie uit de actieve logs verdwijnen. " +
    (enableWebSearch
      ? "Je hebt ook tool **web_search** voor actuele externe informatie via Tavily. Gebruik web_search wanneer de vraag actuele of externe feiten vereist, en noem in je antwoord de geraadpleegde URL's. Houd duidelijk onderscheid tussen informatie uit de kennisbank en informatie van internet. "
      : "Je hebt geen internettool; beweer geen actuele externe feiten zonder bron. ") +
    (enableActivityLogs
      ? "Je hebt ook tool **read_activity_logs** om persistente Ask/Agent activity logs te lezen. Gebruik deze tool wanneer de gebruiker vraagt naar activiteiten, urenregistratie, timesheets, werkzaamheden of wat er op een dag/week is gedaan. Activity logs zijn read-only en geen Markdown-documenten. "
      : "") +
    (enableTimesheet
      ? "Je hebt ook tool **build_timesheet_draft** om een evidence-first urenconcept te genereren (80% klant / 20% overig, 8,0 u per werkdag, per activiteit). Gebruik dit als eerste stap bij urenregistratie; combineer daarna met alle macro-bronnen (Outlook inbox/sent/agenda, Kanban, activity logs, corpus, memory). "
      : "") +
    (enableConfluence
      ? "Je hebt ook Confluence-tools via de gekoppelde browser-sessie: **search_confluence** om pagina's te vinden, **read_confluence_page** om een pagina op te halen en **write_confluence_page** om een bestaande pagina terug te schrijven. Gebruik search_confluence wanneer de gebruiker vraagt naar Confluence-inhoud zonder pageId/URL. Lees daarna met read_confluence_page voordat je conclusies trekt. Gebruik write_confluence_page alleen als de gebruiker expliciet vraagt om een Confluence-pagina te wijzigen; lees eerst de actuele versie. Noem de Confluence-pagina-URL als bron. "
      : "") +
    (enableOutlook
      ? "Je hebt ook lokale Outlook-tools via klassieke Outlook Desktop: **search_outlook_calendar** voor agenda/afspraken uit de hoofdagenda, **search_2ndbrain_calendar** voor de door iOMS beheerde agenda, **create_2ndbrain_calendar_event** om uitsluitend in de 2ndbrain-agenda te schrijven, **update_2ndbrain_calendar_event** om bestaande 2ndbrain-afspraken te verplaatsen of bij te werken, **search_outlook_mail** voor inbox/verzonden/concept-mail (folder=inbox, sent of drafts), **read_outlook_mail** voor één gevonden mail en **create_outlook_draft** om een conceptmail aan te maken. Gebruik kalender-tools wanneer de gebruiker vraagt naar agenda, afspraken, planning of beschikbaarheid. Gebruik live mail-tools wanneer de gebruiker expliciet naar actuele e-mailinhoud vraagt, wanneer search_email_memory onvoldoende bewijs geeft, of wanneer je een concept/reply moet maken op een specifieke mail. Zoek met korte kernwoorden/namen; de tools scoren fuzzy/token-based. Als een datumrange uit de vraag volgt, zet relatieve en Nederlandse datums expliciet om naar ISO YYYY-MM-DD of volledige ISO timestamps; gebruik nooit ambigu 08-06/06-08. Als een datumrange ontbreekt, zoek eerst met de backend-defaults (mail: laatste 90 dagen; agenda: 30 dagen terug tot 120 dagen vooruit) en vraag pas om verduidelijking als dat leeg of te breed blijft. Belangrijk: schrijf, verplaats of wijzig nooit items in de hoofdagenda; alle agenda-schrijf- en update-acties gaan uitsluitend via create_2ndbrain_calendar_event of update_2ndbrain_calendar_event naar de 2ndbrain-agenda. Voor verplaatsen of wijzigen: zoek eerst met search_2ndbrain_calendar, kies exact één item, en gebruik de entryId uit dat zoekresultaat. Lees volledige mailbody alleen als dat nodig is voor de vraag; begin anders met zoekresultaten/snippets of search_email_memory. Gebruik create_outlook_draft alleen wanneer de gebruiker expliciet vraagt om een conceptmail/maildraft te maken; deze tool verzendt nooit. Bij het schrijven van een mail of plannen van een 2ndbrain-afspraak gebruik je eerst de relevante kennisbronnen: huidige document, corpus/geheugen en waar nodig Outlook, Confluence of web_search. Als ontvanger, tijdslot of kernboodschap onzeker is, vraag eerst om verduidelijking. Noem Outlook-resultaten als lokale Outlook-bron, niet als serverbron. "
      : "") +
    (enableCorpusTools
      ? "Het eerste user-bericht bevat gescheiden index-/overzichtsblokken voor werkdocumenten en long-term memory zonder volledige documentteksten. "
      : "Het eerste user-bericht bevat de gebruikersvraag en eventueel het huidige Markdown-document. ") +
    (enableMemoryWriteTools
      ? "Als de gebruiker vraagt iets vast te leggen, bij te werken, aan te maken of in het geheugen/corpus te verwerken, of als je antwoord duurzame stappen/kennis bevat die later terugvindbaar moeten zijn, MOET je zelf kiezen tussen één of meerdere create_corpus_markdown- en update_corpus_markdown-acties voor Files/.memory/. Vraag niet of de gebruiker dat wil; voer de passende geheugenacties uit. Als je geen toolcall gebruikt, neem dan top-level \"pendingMemoryActions\" op in je finale JSON met één of meerdere acties met dezelfde velden (kind, path, reason, content of find/replace, sources), waarbij path relatief is aan Files/.memory/. Zeg niet dat je geen schrijfrechten hebt: de server verwerkt deze memory-actions namens jou. De reply blijft inhoudelijk: geen melding over uitgevoerde of gekozen memory-acties, geen paden en geen 'ik heb dit aangemaakt/bijgewerkt'. "
      : "") +
    "Antwoordstijl: schrijf compact, zakelijk en rustig. Gebruik geen emoji's, geen overmatige horizontale lijnen, geen tabellen tenzij de gebruiker daarom vraagt, en maximaal één inhoudelijke vervolgvraag als die echt waarde toevoegt. " +
    "Datumregels: gebruik bij relatieve datums altijd de server lokale tijd uit het blok Huidige tijd. Als een weekplan, document of eerdere chat iets suggereert over 'vandaag' of 'morgen', behandel dat niet als feit tenzij de bron expliciet aan een kalenderdatum is gekoppeld. Benoem bij planning altijd de concrete datum/dag die je bedoelt, of vraag om verduidelijking bij ambiguïteit. " +
    "Na het lezen van alle relevante bestanden: geef het uiteindelijke antwoord als **uitsluitend** één JSON-object met sleutel \"reply\" (string, verplicht). " +
    (structuredToolContext
      ? "Voeg ook \"evidence\" toe (array: path, sourceType, excerpt, optioneel sectionId) en \"assumptions\" (array: claim, derivedFrom). Koppel feiten aan evidence; label afleidingen als assumptions. "
      : "") +
    (corpusOpts.intent?.profile === "planning"
      ? "Optioneel \"nextActions\" (max 3 objecten met title, project, dueDate, owner). "
      : "") +
    "Optioneel mag je ook \"viewerActions\" opnemen: een array (max 10) met hints voor de viewer — alleen als het de gebruiker helpt je antwoord te volgen: " +
    "{\"openMarkdown\":\"pad/onder/map.md\"} opent dat bestand links; {\"highlight\":{\"path\":\"pad/map.md\",\"snippet\":\"exact fragment zoals in het bronbestand\"}} markeert dat fragment na openen (snippet moet letterlijk voorkomen). " +
    "Toegestane top-level sleutels: reply, viewerActions en pendingMemoryActions. Gebruik pendingMemoryActions alleen als de toolroute onmogelijk is; de server voert zulke acties daarna alsnog direct uit of toont ze als fallback. " +
    replyTail +
    currentTime +
    instructions;

  let bootstrapContent = bootstrapUserMarkdown;
  if (isAutoModel(config.model)) {
    bootstrapContent = await runStrategyPhaseIfNeeded(llmCtx, safeHistory, bootstrapUserMarkdown);
  }

  const messages = [
    { role: "system", content: systemContent },
    ...safeHistory,
    { role: "user", content: bootstrapContent },
  ];

  const url = markdownChatCompletionsUrl(config.endpoint);
  let lastRetrievalModel = config.model;

  for (let iter = 0; iter < CORPUS_ASK_MAX_ROUNDS; iter++) {
    const thinkingResolved = isAutoModel(config.model)
      ? resolveLlmConfig(config, "retrieval", routerContext, modelCatalog)
      : null;
    pushActivity({
      phase: "thinking",
      label: iter === 0 ? "Model denkt na over je vraag…" : `Verdieping — stap ${iter + 1}`,
      ...(thinkingResolved
        ? { model: thinkingResolved.model, modelRole: "retrieval", modelReason: thinkingResolved.modelReason }
        : {}),
    });

    agentLog(runId, "corpus_tool_round_start", { iter });

    let llmResult;
    let data;
    let msg;
    try {
      const phaseResult = await llmChatForPhase(llmCtx, {
        phase: "retrieval",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
        endpointUrl: url,
        logPrefix: "corpus_tool",
        logFields: { iter },
      });
      llmResult = phaseResult.llmResult;
      data = phaseResult.data;
      msg = phaseResult.message;
      lastRetrievalModel = phaseResult.resolved.model;
    } catch (e) {
      agentLog(runId, "corpus_tool_fetch_failed", { iter, error: String(e?.message || e) });
      throw e;
    }

    const bodyText = llmResult.body;
    const choice = data?.choices?.[0];
    if (!msg || typeof msg !== "object") {
      throw new Error("LLM-response zonder message");
    }

    attachOpenAiChoiceDebug(llmDebugOut, data, choice);

    messages.push(msg);

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    performanceMetrics.toolCallCount += toolCalls.length;

    if (toolCalls.length > 0) {
      const fnNames = toolCalls
        .map((tc) => (tc?.function?.name ? String(tc.function.name) : ""))
        .filter(Boolean);
      const hasRead = fnNames.includes("read_corpus_markdown");
      const hasReadMemory = fnNames.includes("read_memory_markdown");
      const hasReadOutline = fnNames.includes("read_corpus_outline") || fnNames.includes("read_memory_outline");
      const hasReadSection = fnNames.includes("read_corpus_section") || fnNames.includes("read_memory_section");
      const hasCreate = fnNames.includes("create_corpus_markdown") || fnNames.includes("create_work_document");
      const hasUpdate = fnNames.includes("update_corpus_markdown") || fnNames.includes("update_work_document");
      const hasSuggestDelete = fnNames.includes("suggest_corpus_deletion");
      const hasWebSearch = fnNames.includes("web_search");
      const hasEmailMemory = fnNames.includes("search_email_memory") || fnNames.includes("update_email_followup_context");
      const hasEmailContextUpdate = fnNames.includes("update_email_followup_context");
      const hasKanban = fnNames.some((name) => name.includes("_kanban_") || name === "search_kanban_tasks" || name === "read_kanban_task");
      const hasKanbanMerge = fnNames.includes("merge_kanban_tasks");
      const hasActivityLogs = fnNames.includes("read_activity_logs");
      const hasConfluenceSearch = fnNames.includes("search_confluence");
      const hasConfluence = fnNames.includes("read_confluence_page") || hasConfluenceSearch;
      const hasOutlookDraft = fnNames.includes("create_outlook_draft");
      const hasManagedCalendarWrite = fnNames.includes("create_2ndbrain_calendar_event");
      const hasManagedCalendarUpdate = fnNames.includes("update_2ndbrain_calendar_event");
      const hasManagedCalendarRead = fnNames.includes("search_2ndbrain_calendar");
      const hasOutlookMail = fnNames.includes("search_outlook_mail") || fnNames.includes("read_outlook_mail") || hasOutlookDraft;
      const hasOutlookCalendar =
        fnNames.includes("search_outlook_calendar") || hasManagedCalendarRead || hasManagedCalendarWrite || hasManagedCalendarUpdate;
      const hasOutlook = hasOutlookMail || hasOutlookCalendar;
      let fetchLabel = `${toolCalls.length} corpus-actie(s)…`;
      if (hasManagedCalendarUpdate) fetchLabel = `${toolCalls.length} 2ndbrain-agenda update-actie(s)…`;
      else if (hasManagedCalendarWrite) fetchLabel = `${toolCalls.length} 2ndbrain-agenda schrijf-actie(s)…`;
      else if (hasOutlookDraft) fetchLabel = `${toolCalls.length} Outlook-conceptactie(s)…`;
      else if (hasManagedCalendarRead) fetchLabel = `${toolCalls.length} 2ndbrain-agenda zoekactie(s)…`;
      else if (hasOutlookMail && hasOutlookCalendar) fetchLabel = `${toolCalls.length} Outlook-mail-/agenda-actie(s)…`;
      else if (hasOutlookMail) fetchLabel = `${toolCalls.length} Outlook-mailactie(s)…`;
      else if (hasOutlookCalendar) fetchLabel = `${toolCalls.length} Outlook-agenda-actie(s)…`;
      else if (hasKanbanMerge) fetchLabel = `${toolCalls.length} Kanban-fusieactie(s)…`;
      else if (hasKanban) fetchLabel = `${toolCalls.length} Kanban-actie(s)…`;
      else if (hasEmailContextUpdate) fetchLabel = `${toolCalls.length} e-mailcontextactie(s)…`;
      else if (hasEmailMemory) fetchLabel = `${toolCalls.length} e-mailmemory zoekactie(s)…`;
      else if (hasConfluenceSearch && fnNames.includes("read_confluence_page")) {
        fetchLabel = `${toolCalls.length} Confluence-zoek-/leesactie(s)…`;
      } else if (hasConfluenceSearch) fetchLabel = `${toolCalls.length} Confluence-zoekopdracht(en)…`;
      else if (hasConfluence) fetchLabel = `${toolCalls.length} Confluence-pagina('s) ophalen…`;
      else if (hasActivityLogs) fetchLabel = `${toolCalls.length} activity-logactie(s)…`;
      else if (hasWebSearch && (hasRead || hasReadMemory || hasReadOutline || hasReadSection || hasCreate)) {
        fetchLabel = `${toolCalls.length} corpus-/webactie(s)…`;
      }
      else if (hasWebSearch) fetchLabel = `${toolCalls.length} webzoekopdracht(en)…`;
      else if (hasUpdate) fetchLabel = `${toolCalls.length} geheugenupdate(s) voorbereiden…`;
      else if (hasSuggestDelete) fetchLabel = `${toolCalls.length} geheugensuggestie(s) voorbereiden…`;
      else if (hasReadSection) fetchLabel = `${toolCalls.length} sectie(s) lezen…`;
      else if (hasReadOutline) fetchLabel = `${toolCalls.length} document-outline(s) lezen…`;
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

        if (tryNexusToolCache(nexusRunContext, fnName, args, tc, messages)) {
          continue;
        }

        if (fnName === "read_nexus_debug_logs") {
          pushActivity({
            phase: "nexus_debug",
            label: "Nexus debuglogs lezen",
            detail: reason || args.kind || undefined,
          });
          const kind = args.kind === "error" || args.kind === "fix" ? args.kind : "both";
          const payload =
            kind === "both"
              ? { ok: true, error: readNexusDebugLog("error"), fix: readNexusDebugLog("fix") }
              : readNexusDebugLog(kind);
          performanceMetrics.retrievedChars += JSON.stringify(payload).length;
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "append_nexus_error_log") {
          pushActivity({
            phase: "nexus_debug",
            label: "Fout naar Nexus errorlog schrijven",
            detail: reason || args.title || undefined,
          });
          const payload = appendNexusErrorLogEntry({
            runId,
            title: args.title,
            component: args.component,
            tool: args.tool,
            command: args.command || bootstrapUserMarkdown.slice(0, 1200),
            error: args.error,
            context: args.context,
            detail: args.detail || args,
          });
          agentLog(runId, "nexus_error_log_append", { ok: payload.ok, path: payload.path || "", title: truncStr(args.title || "", 160) });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "append_nexus_fix_log") {
          pushActivity({
            phase: "nexus_debug",
            label: "Fixnotitie naar Nexus fixlog schrijven",
            detail: reason || args.title || undefined,
          });
          const payload = appendNexusFixLogEntry(args);
          agentLog(runId, "nexus_fix_log_append", { ok: payload.ok, path: payload.path || "", title: truncStr(args.title || "", 160) });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "cleanup_nexus_debug_issue") {
          pushActivity({
            phase: "nexus_debug",
            label: "Opgeloste bugmelding opschonen",
            detail: reason || args.errorId || undefined,
          });
          const payload = cleanupNexusDebugIssue(args);
          agentLog(runId, "nexus_debug_issue_cleanup", {
            ok: payload.ok,
            errorId: args.errorId || "",
            removedError: payload?.removed?.error || 0,
            removedFix: payload?.removed?.fix || 0,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "search_kanban_tasks") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-taken zoeken",
            detail: reason || args.query || args.project || args.person || undefined,
          });
          const searchArgs = {
            ...args,
            project: args.project ? resolveKanbanProjectForTask(String(args.project)) : args.project,
          };
          const payload = {
            ...kanbanStore.listTasks(searchArgs),
            projectCatalog: getKanbanProjectCatalog(loadKanbanProjectRegistry()),
            projectCatalogHint: getKanbanProjectCatalogPrompt(loadKanbanProjectRegistry(), { limit: 25 }),
          };
          performanceMetrics.retrievedChars += JSON.stringify(payload.tasks || []).length;
          agentLog(runId, "kanban_tool_search", {
            query: truncStr(String(args.query || ""), 240),
            project: truncStr(String(args.project || ""), 120),
            status: args.status || "",
            count: payload.total,
          });
          pushNexusToolMessage(messages, tc, nexusRunContext, fnName, args, payload);
          continue;
        }

        if (fnName === "read_kanban_task") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-taak lezen",
            detail: reason || args.id || undefined,
          });
          const payload = kanbanStore.getTask(String(args.id || ""));
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.task || {}).length : 0;
          agentLog(runId, "kanban_tool_read", { ok: payload.ok, id: args.id || "", title: truncStr(payload?.task?.title || "", 200) });
          pushNexusToolMessage(messages, tc, nexusRunContext, fnName, args, payload);
          continue;
        }

        if (fnName === "create_kanban_task") {
          if (!hasPriorKanbanSearch(nexusRunContext)) {
            const guardPayload = {
              ok: false,
              error:
                "Voer eerst search_kanban_tasks uit in deze run voordat je create_kanban_task gebruikt, om duplicaten te voorkomen.",
              requiresSearchFirst: true,
            };
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(guardPayload) });
            continue;
          }
          const dup = suggestKanbanDuplicateTask(String(args.title || ""), kanbanStore);
          if (dup.duplicate && dup.task) {
            const dupPayload = {
              ok: false,
              error: `Vergelijkbare open taak gevonden (${Math.round(dup.score * 100)}% overlap). Werk taak ${dup.task.id} bij i.p.v. een nieuwe taak te maken.`,
              suggestUpdate: dup.task.id,
              existingTask: dup.task,
            };
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(dupPayload) });
            continue;
          }
          pushActivity({
            phase: "kanban",
            label: "Kanban-taak maken",
            detail: reason || args.title || undefined,
          });
          const payload = kanbanStore.createTask(args, { actor: "agent", note: args.rationale || reason || "Taak aangemaakt door agent." });
          agentLog(runId, "kanban_tool_create", {
            ok: payload.ok,
            id: payload?.task?.id || "",
            title: truncStr(payload?.task?.title || args.title || "", 200),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "update_kanban_task") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-taak bijwerken",
            detail: reason || args.title || args.id || undefined,
          });
          const payload = kanbanStore.updateTask(String(args.id || ""), args, {
            actor: "agent",
            note: args.rationale || reason || "Taak bijgewerkt door agent.",
          });
          agentLog(runId, "kanban_tool_update", {
            ok: payload.ok,
            id: args.id || "",
            title: truncStr(payload?.task?.title || args.title || "", 200),
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "add_kanban_comment") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-commentaar plaatsen",
            detail: reason || args.id || undefined,
          });
          const payload = kanbanCommentsStore.addThread(String(args.id || ""), {
            body: args.body,
            author: "Nexus",
          });
          agentLog(runId, "kanban_tool_comment", {
            ok: payload.ok,
            id: args.id || "",
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "move_kanban_task") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-taak verplaatsen",
            detail: reason || `${args.id || ""} -> ${args.status || ""}`.trim() || undefined,
          });
          const payload = kanbanStore.moveTask(String(args.id || ""), String(args.status || ""), {
            actor: "agent",
            note: args.rationale || reason || "Taak verplaatst door agent.",
          });
          agentLog(runId, "kanban_tool_move", {
            ok: payload.ok,
            id: args.id || "",
            status: args.status || "",
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "merge_kanban_tasks") {
          pushActivity({
            phase: "kanban",
            label: "Kanban-taken fuseren",
            detail: reason || args.title || `${args.primaryId || ""} + ${args.secondaryId || ""}`.trim() || undefined,
          });
          const payload = kanbanStore.mergeTasks(String(args.primaryId || ""), String(args.secondaryId || ""), args, {
            actor: "agent",
            note: args.rationale || reason || "Taken gefuseerd door Nexus.",
          });
          agentLog(runId, "kanban_tool_merge", {
            ok: payload.ok,
            primaryId: args.primaryId || "",
            secondaryId: args.secondaryId || "",
            title: truncStr(payload?.task?.title || args.title || "", 200),
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "link_kanban_source") {
          pushActivity({
            phase: "kanban",
            label: "Bron aan Kanban-taak koppelen",
            detail: reason || args.id || undefined,
          });
          const payload = kanbanStore.linkSource(String(args.id || ""), args.sourceRef || {}, {
            actor: "agent",
            note: args.rationale || reason || "Bron gekoppeld door agent.",
          });
          agentLog(runId, "kanban_tool_link_source", {
            ok: payload.ok,
            id: args.id || "",
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(payload) });
          continue;
        }

        if (fnName === "search_email_memory") {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          pushActivity({
            phase: "email_memory",
            label: "E-mailmemory doorzoeken",
            detail: reason || query || undefined,
          });
          const payload = searchEmailMemoryToolPayload(args);
          performanceMetrics.retrievedChars += JSON.stringify(payload.results || []).length;
          agentLog(runId, "email_memory_tool_search", {
            query: truncStr(query, 240),
            count: payload.count,
            totalCandidates: payload.totalCandidates,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik deze e-mailmemoryresultaten als afgeleide lokale Outlook-bron. Dit zijn samenvattingen/acties/metadata, geen volledige e-mailbody. Noem concrete mailonderwerpen of deadlines als broncontext wanneer relevant.",
            }),
          });
          continue;
        }

        if (fnName === "update_email_followup_context") {
          const notificationId = typeof args.notificationId === "string" ? args.notificationId.trim() : "";
          const userContext = typeof args.userContext === "string" ? args.userContext.trim() : "";
          pushActivity({
            phase: "email_memory",
            label: "E-mailcontext verwerken",
            detail: reason || notificationId || undefined,
          });
          const payload = await processEmailNotificationUserContext({ notificationId, userContext, runId });
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.notification || {}).length : 0;
          agentLog(runId, "email_context_tool_update", {
            ok: payload.ok,
            notificationId,
            contextChars: userContext.length,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik dit resultaat als bijgewerkte e-mailagent-context. De e-mailfollow-up is opnieuw geïnterpreteerd op basis van Joosts context.",
            }),
          });
          continue;
        }

        if (fnName === "search_outlook_mail") {
          pushActivity({
            phase: "outlook_mail",
            label: "Outlook-mail doorzoeken",
            detail: reason || args.query || undefined,
          });
          const payload = await searchOutlookMailPayload(args);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.results || []).length : 0;
          agentLog(runId, "outlook_tool_mail_search", {
            query: truncStr(String(args.query || ""), 240),
            folder: args.folder || "inbox",
            ok: payload.ok,
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          if (!payload.ok) {
            appendNexusErrorLogEntry({
              runId,
              title: "Outlook mailzoektool faalde",
              component: "outlook-tools",
              tool: "search_outlook_mail",
              command: bootstrapUserMarkdown.slice(0, 1200),
              error: String(payload.error || payload.userFacingInstruction || "Onbekende Outlook-mailfout"),
              context: reason || args.query || "Live mailbox zoekactie",
              detail: { args, payload },
            });
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik Outlook-mailresultaten als lokale, read-only bron. Lees volledige mailinhoud met read_outlook_mail alleen als een resultaat relevant is en de vraag dat vereist.",
            }),
          });
          continue;
        }

        if (fnName === "read_outlook_mail") {
          pushActivity({
            phase: "outlook_mail",
            label: "Outlook-mail lezen",
            detail: reason || args.entryId || undefined,
          });
          const payload = await readOutlookMailPayload(args);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.item || {}).length : 0;
          agentLog(runId, "outlook_tool_mail_read", {
            ok: payload.ok,
            subject: truncStr(String(payload?.item?.subject || ""), 240),
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "search_outlook_calendar") {
          pushActivity({
            phase: "outlook_calendar",
            label: "Outlook-agenda doorzoeken",
            detail: reason || args.query || args.date || undefined,
          });
          const payload = await searchOutlookCalendarPayload(args);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.results || []).length : 0;
          agentLog(runId, "outlook_tool_calendar_search", {
            query: truncStr(String(args.query || ""), 240),
            date: args.date || "",
            ok: payload.ok,
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          if (!payload.ok) {
            appendNexusErrorLogEntry({
              runId,
              title: "Outlook agendazoektool faalde",
              component: "outlook-tools",
              tool: "search_outlook_calendar",
              command: bootstrapUserMarkdown.slice(0, 1200),
              error: String(payload.error || payload.userFacingInstruction || "Onbekende Outlook-agendafout"),
              context: reason || args.query || args.date || "Live agenda zoekactie",
              detail: { args, payload },
            });
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik Outlook-agendaresultaten als lokale, read-only bron voor planning en afspraken.",
            }),
          });
          continue;
        }

        if (fnName === "search_2ndbrain_calendar") {
          pushActivity({
            phase: "outlook_2ndbrain_calendar",
            label: "2ndbrain-agenda doorzoeken",
            detail: reason || args.query || args.date || undefined,
          });
          const payload = await searchManagedOutlookCalendarPayload(args);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.results || []).length : 0;
          agentLog(runId, "outlook_tool_2ndbrain_calendar_search", {
            query: truncStr(String(args.query || ""), 240),
            date: args.date || "",
            ok: payload.ok,
            calendarName: payload.calendarName || "2ndbrain",
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          if (!payload.ok) {
            appendNexusErrorLogEntry({
              runId,
              title: "2ndbrain agendazoektool faalde",
              component: "outlook-tools",
              tool: "search_2ndbrain_calendar",
              command: bootstrapUserMarkdown.slice(0, 1200),
              error: String(payload.error || payload.userFacingInstruction || "Onbekende 2ndbrain-agendafout"),
              context: reason || args.query || args.date || "2ndbrain agenda zoekactie",
              detail: { args, payload },
            });
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik deze resultaten alleen als de door iOMS beheerde 2ndbrain-agenda, niet als hoofdagenda.",
            }),
          });
          continue;
        }

        if (fnName === "create_2ndbrain_calendar_event") {
          pushActivity({
            phase: "outlook_2ndbrain_calendar",
            label: "Afspraak in 2ndbrain-agenda maken",
            detail: reason || args.subject || undefined,
          });
          const payload = await createManagedOutlookCalendarEventPayload(args);
          agentLog(runId, "outlook_tool_2ndbrain_calendar_create", {
            ok: payload.ok,
            calendarName: payload.calendarName || "2ndbrain",
            subject: truncStr(String(payload?.event?.subject || args.subject || ""), 240),
            start: payload?.event?.start || args.start || "",
            end: payload?.event?.end || args.end || "",
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Meld dat de afspraak uitsluitend in de 2ndbrain-agenda is aangemaakt en dat de hoofdagenda niet is gewijzigd. " +
                "Als de body niet het volledige sjabloon (DOEL, INSTRUCTIES, ACHTERGROND, VERWACHTE OUTPUT, BRONNEN, KLAAR WANNEER) had, werk het item bij met update_2ndbrain_calendar_event.",
            }),
          });
          continue;
        }

        if (fnName === "update_2ndbrain_calendar_event") {
          pushActivity({
            phase: "outlook_2ndbrain_calendar",
            label: "Afspraak in 2ndbrain-agenda bijwerken",
            detail: reason || args.subject || args.entryId || undefined,
          });
          const payload = await updateManagedOutlookCalendarEventPayload(args);
          agentLog(runId, "outlook_tool_2ndbrain_calendar_update", {
            ok: payload.ok,
            calendarName: payload.calendarName || "2ndbrain",
            subject: truncStr(String(payload?.event?.subject || args.subject || ""), 240),
            start: payload?.event?.start || args.start || "",
            end: payload?.event?.end || args.end || "",
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Meld dat de afspraak uitsluitend in de 2ndbrain-agenda is bijgewerkt/verplaatst en dat de hoofdagenda niet is gewijzigd.",
            }),
          });
          continue;
        }

        if (fnName === "create_outlook_draft") {
          pushActivity({
            phase: "outlook_draft",
            label: "Outlook-conceptmail aanmaken",
            detail: reason || args.subject || undefined,
          });
          const payload = await createOutlookDraftPayload(args);
          agentLog(runId, "outlook_tool_draft_create", {
            ok: payload.ok,
            subject: truncStr(String(payload.subject || args.subject || ""), 240),
            toCount: Array.isArray(args.to) ? args.to.length : String(args.to || "").split(/[;,]/).filter(Boolean).length,
            displayed: payload.displayed === true,
            error: payload.ok ? "" : String(payload.error || ""),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Meld dat de conceptmail in Outlook is aangemaakt en niet is verzonden. Vraag de gebruiker de mail zelf te controleren en te verzenden.",
            }),
          });
          continue;
        }

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

        if (fnName === "build_timesheet_draft") {
          pushActivity({
            phase: "timesheet",
            label: "Urenregistratie-concept opbouwen",
            detail: reason || args.fromDate || args.toDate || undefined,
          });
          const payload = await buildTimesheetDraftToolPayload(args);
          agentLog(runId, "timesheet_draft_built", {
            from: payload.range?.from,
            to: payload.range?.to,
            signalCount: payload.signalCount,
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
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.results || []).length : 0;
          agentLog(runId, "web_search", {
            query: truncStr(query, 240),
            ok: payload.ok,
            error: payload.ok ? "" : String(payload.error || ""),
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik deze webzoekresultaten alleen als actuele externe broninformatie. Noem relevante URL's in de uiteindelijke reply wanneer je feiten uit deze resultaten gebruikt.",
            }),
          });
          continue;
        }

        if (fnName === "search_confluence") {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          const spaceKey = typeof args.spaceKey === "string" ? args.spaceKey.trim() : "";
          const limit = Number(args.limit || 10);
          pushActivity({
            phase: "confluence_search",
            label: "Confluence doorzoeken",
            detail: reason || query || undefined,
          });
          const payload = await searchConfluencePayload({ query, spaceKey, limit }, runId);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.results || []).length : 0;
          agentLog(runId, "confluence_tool_search", {
            query: truncStr(query, 240),
            spaceKey,
            ok: payload.ok,
            resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Gebruik de zoekresultaten om relevante pagina's te selecteren. Lees inhoudelijke pagina's daarna met read_confluence_page voordat je conclusies trekt.",
            }),
          });
          continue;
        }

        if (fnName === "read_confluence_page") {
          const pageId = typeof args.pageId === "string" ? args.pageId.trim() : "";
          const pageUrl = typeof args.url === "string" ? args.url.trim() : "";
          pushActivity({
            phase: "confluence",
            label: "Confluence-pagina ophalen",
            detail: reason || pageId || pageUrl || undefined,
          });
          const payload = await fetchConfluencePagePayload({ pageId, url: pageUrl }, runId);
          performanceMetrics.retrievedChars += payload.ok ? String(payload.text || payload.storageHtml || "").length : 0;
          agentLog(runId, "confluence_tool_read", {
            pageId: payload.id || pageId || confluencePageIdFromUrl(pageUrl),
            ok: payload.ok,
            chars: payload.ok ? String(payload.text || "").length : 0,
            truncated: !!payload.truncated,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "write_confluence_page") {
          const pageId = typeof args.pageId === "string" ? args.pageId.trim() : String(args.pageId || "").trim();
          const title = typeof args.title === "string" ? args.title.trim() : "";
          const markdown = typeof args.markdown === "string" ? args.markdown : "";
          const baseVersion = Number(args.baseVersion || 0);
          pushActivity({
            phase: "confluence_write",
            label: "Confluence-pagina opslaan",
            detail: reason || title || pageId || undefined,
          });
          const payload = await updateConfluencePageFromMarkdown({ pageId, title, baseVersion, markdown }, runId);
          agentLog(runId, "confluence_tool_write", {
            pageId,
            ok: payload.ok,
            version: payload.ok ? payload.version : undefined,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
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
          performanceMetrics.retrievedChars += payload.ok ? String(payload.content || "").length : 0;
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

        if (fnName === "read_corpus_outline") {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          pushActivity({
            phase: "read_outline",
            label: "Document-outline lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || query || undefined,
          });
          const payload = readMarkdownOutlineToolPayload("working", relPath, query);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.sections || []).length : 0;
          agentLog(runId, "corpus_tool_outline", {
            path: relPath,
            ok: payload.ok,
            sectionCount: payload.sectionCount || 0,
            query,
            retrievalMeta: payload.retrievalMeta || null,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "read_corpus_section") {
          pushActivity({
            phase: "read_section",
            label: "Documentsectie lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || args.section || undefined,
          });
          const payload = readMarkdownSectionToolPayload("working", relPath, args.section);
          performanceMetrics.retrievedChars += payload.ok ? String(payload.content || "").length : 0;
          agentLog(runId, "corpus_tool_section", {
            path: relPath,
            section: String(args.section || ""),
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

        if (fnName === "read_memory_markdown") {
          pushActivity({
            phase: "read_memory",
            label: "Memory-bestand lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || undefined,
          });

          const payload = readMemoryMarkdownToolPayload(relPath);
          performanceMetrics.retrievedChars += payload.ok ? String(payload.content || "").length : 0;
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

        if (fnName === "read_memory_outline") {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          pushActivity({
            phase: "read_memory_outline",
            label: "Memory-outline lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || query || undefined,
          });
          const payload = readMarkdownOutlineToolPayload("memory", relPath, query);
          performanceMetrics.retrievedChars += payload.ok ? JSON.stringify(payload.sections || []).length : 0;
          agentLog(runId, "memory_tool_outline", {
            path: relPath,
            ok: payload.ok,
            sectionCount: payload.sectionCount || 0,
            query,
            retrievalMeta: payload.retrievalMeta || null,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
          });
          continue;
        }

        if (fnName === "read_memory_section") {
          pushActivity({
            phase: "read_memory_section",
            label: "Memory-sectie lezen",
            path: relPath || "(pad ontbreekt)",
            detail: reason || args.section || undefined,
          });
          const payload = readMarkdownSectionToolPayload("memory", relPath, args.section);
          performanceMetrics.retrievedChars += payload.ok ? String(payload.content || "").length : 0;
          agentLog(runId, "memory_tool_section", {
            path: relPath,
            section: String(args.section || ""),
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

        if (fnName === "create_work_document") {
          pushActivity({
            phase: "work_document_create",
            label: "Nieuw werkdocument aanmaken",
            detail: reason || undefined,
          });
          const payload = await createWorkDocumentToolPayload(args.content);
          if (payload.ok && payload.path) {
            roundHadCreate = true;
            if (!corpusCreatedPaths.includes(payload.path)) corpusCreatedPaths.push(payload.path);
          }
          agentLog(runId, "work_tool_create", {
            ok: payload.ok,
            path: payload.path || "",
            chars: payload.charsWritten ?? 0,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ...payload,
              userFacingInstruction:
                "Noem in de reply kort dat het document klaar is of gevuld kan worden; het krijgt automatisch een naam en locatie zodra Corpus Gardener genoeg inhoud ziet. Gebruik viewerActions openMarkdown als de gebruiker het document direct moet zien.",
            }),
          });
          continue;
        }

        if (fnName === "update_work_document") {
          pushActivity({
            phase: "work_document_update",
            label: "Werkdocument bijwerken",
            path: relPath || "(pad ontbreekt)",
            detail: reason || undefined,
          });
          const payload = await updateWorkDocumentToolPayload(relPath, args, runId);
          agentLog(runId, "work_tool_update", {
            path: relPath,
            ok: payload.ok,
            executed: !!payload.executed,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(payload),
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

    let rawContent = msg.content;
    let contentStr = normalizeAssistantContentForParsing(rawContent).trim();

    if (isAutoModel(config.model)) {
      const synthResolved = resolveLlmConfig(config, "synthesis", routerContext, modelCatalog);
      if (synthResolved.model !== lastRetrievalModel) {
        pushActivity({ phase: "digest", label: "Antwoord samenstellen…" });
        try {
          const synthResult = await llmChatForPhase(llmCtx, {
            phase: "synthesis",
            messages,
            temperature: 0.2,
            endpointUrl: url,
            logPrefix: "corpus_synthesis",
            logFields: { iter },
          });
          const synthContent = synthResult.message?.content;
          if (synthContent) {
            rawContent = synthContent;
            contentStr = normalizeAssistantContentForParsing(synthContent).trim();
          }
        } catch (e) {
          agentLog(runId, "corpus_synthesis_failed", { error: String(e?.message || e) });
        }
      }
    }

    if (!contentStr) {
      agentLog(runId, "corpus_tool_empty_final", { iter });
      throw new Error("Het model gaf geen tekstantwoord na het verwerken van de corpus.");
    }

    let reply = "";
    let viewerActions = [];
    let evidenceFooter = "";
    try {
      const parsed = normalizeParsedAgentJsonResponse(parseAgentJsonResponse(contentStr));
      reply = replyStringFromParsedAgentResponse(parsed);
      viewerActions = normalizeViewerActions(parsed?.viewerActions);
      if (structuredToolContext) {
        structuredToolContextResult = extractStructuredToolContext(parsed);
        if (structuredToolContextResult?.reply && !reply) {
          reply = structuredToolContextResult.reply;
        }
        if (corpusOpts.includeEvidenceFooter !== false) {
          evidenceFooter = formatEvidenceFooter(structuredToolContextResult);
        }
      }
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
      reply = recoverUserFacingReplyFromMixedContent(contentStr);
    }

    if (!reply) {
      reply = recoverUserFacingReplyFromMixedContent(contentStr);
    }
    const uniquePendingMemoryActions = dedupeMemoryActions(pendingMemoryActions);
    pendingMemoryActions.splice(0, pendingMemoryActions.length, ...uniquePendingMemoryActions);
    reply = ensureMemoryActionQuestion(reply, pendingMemoryActions);
    reply = ensureMemoryAppliedNotice(reply, executedMemoryActions);
    reply = stripMemoryHousekeepingFromReply(reply, executedMemoryActions);
    reply = stripMemoryPermissionClaimsFromReply(reply);
    if (evidenceFooter && !reply.includes("Gebruikte bronnen")) {
      reply = `${reply}${evidenceFooter}`;
    }
    performanceMetrics.replyChars = reply.length;
    const finalPerformanceMetrics = finalizePerformanceMetrics(performanceMetrics, { replyChars: reply.length });

    agentLog(runId, "corpus_tool_done", {
      elapsedMs: finalPerformanceMetrics.durationMs,
      iterations: iter + 1,
      replyChars: reply.length,
      viewerActions: viewerActions.length,
      corpusCreatedCount: corpusCreatedPaths.length,
      executedMemoryActions: executedMemoryActions.length,
      pendingMemoryActions: pendingMemoryActions.length,
      performanceMetrics: finalPerformanceMetrics,
    });

    pushActivity({ phase: "done", label: "Antwoord gereed." });

    return {
      reply,
      activities,
      viewerActions,
      corpusCreatedPaths,
      executedMemoryActions,
      pendingMemoryActions,
      performanceMetrics: finalPerformanceMetrics,
      structuredToolContext: structuredToolContextResult,
      evidenceFooter: evidenceFooter || null,
      nexusRunContext,
      modelTrace: modelTrace?.entries?.length ? modelTrace.entries : undefined,
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
  const llmCtx = options.llmCtx || null;
  const askRequestBody = {
    model: config.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: corpusAsk
              ? nexusVoicePromptBlock("ask") +
                "Je werkt met een persoonlijke kennisbank (Markdown-bestanden). Beantwoord in het Nederlands, kort en helder. " +
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
              : nexusVoicePromptBlock("ask") +
                "Je helpt bij Markdown-documenten. Beantwoord in het Nederlands, kort en helder. " +
                "Het laatste user-bericht bevat de vraag en onderaan het volledige document als referentie. " +
                ASK_CURIOSITY_RULE +
                "Ask-modus mag long-term-memory-acties voorbereiden; de server voert uitvoerbare acties direct uit in Files/.memory/ als interne agent-housekeeping, zonder aparte gebruikersmelding. " +
                "Als het antwoord duurzame stappen of herbruikbare kennis bevat, bepaal dan zelf of dit in één of meerdere nieuwe memory-documenten hoort of in één of meerdere bestaande memory-documenten. Vraag niet of de gebruiker dit wil opslaan of of er een eigen document nodig is. " +
                "Noem in reply geen storage-beslissingen, bestandsnamen, memory-paden of housekeeping-acties zoals aanmaken, bijwerken, opslaan of vastleggen, tenzij de gebruiker expliciet vraagt waar iets staat of om een audit/inspectie van memory. Zeg ook niet dat je geen schrijfrechten op Files/.memory/ hebt en zeg niet dat de gebruiker iets kan plakken of zelf een bestand moet aanmaken als jij dit via memory-acties kunt doen. " +
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
  };
  let llmResult;
  try {
    if (llmCtx) {
      const phaseResult = await llmChatForPhase(llmCtx, {
        phase: "simple",
        messages: askRequestBody.messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
        endpointUrl: url,
        logPrefix: "ask_llm",
        logFields: { corpusAsk },
      });
      llmResult = phaseResult.llmResult;
    } else {
      llmResult = await fetchLlmTextWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(askRequestBody),
      }, {
        runId,
        logPrefix: "ask_llm",
      });
    }
  } catch (e) {
    agentLog(runId, "ask_llm_fetch_failed", {
      elapsedMs: 0,
      error: String(e?.message || e),
    });
    throw e;
  }

  const elapsedMs = llmResult.elapsedMs;
  const body = llmResult.body;

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
    parsed = normalizeParsedAgentJsonResponse(parseAgentJsonResponse(contentStr));
  } catch (e) {
    noteLlmProseFallback(llmDebugOut);
    agentLog(runId, "ask_llm_prose_fallback", {
      elapsedMs,
      proseChars: contentStr.length,
      parseError: String(e?.message || e),
    });
    return { reply: stripMemoryPermissionClaimsFromReply(recoverUserFacingReplyFromMixedContent(contentStr)), pendingMemoryActions: [] };
  }
  const pendingMemoryActions = normalizePendingMemoryActions(parsed?.pendingMemoryActions);
  const reply = stripMemoryPermissionClaimsFromReply(
    ensureMemoryActionQuestion(replyStringFromParsedAgentResponse(parsed), pendingMemoryActions),
  );
  if (!reply) {
    noteLlmProseFallback(llmDebugOut);
    agentLog(runId, "ask_llm_empty_reply_use_prose", { elapsedMs, proseChars: contentStr.length });
    return { reply: stripMemoryPermissionClaimsFromReply(recoverUserFacingReplyFromMixedContent(contentStr)), pendingMemoryActions };
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

  const llmResult = await fetchLlmTextWithRetry(url, {
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
  }, {
    runId,
    logPrefix: "memory_fallback",
    logFields: { targetPath },
  });

  const elapsedMs = llmResult.elapsedMs;
  const body = llmResult.body;

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
  const forced = options.force === true;
  const organicReflection = options.organicReflection === true;
  const memorySignal =
    looksLikeDurableMemorySignal(message) ||
    dreamMemoryRequest ||
    (organicReflection &&
      looksLikeOrganicMemoryContext(message, {
        reply: options.reply || "",
        documentPath: options.currentPath || "",
      }));
  if (!forced && !memorySignal) {
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
  const preferredTargetPath = typeof options.targetPath === "string" ? options.targetPath.trim() : "";
  const targetPath = preferredTargetPath || pickMemoryTargetPath(targetSeed, memoryManifest, inferDurableMemoryTargetPath(message));
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
  return {
    reply: stripMemoryPermissionClaimsFromReply(fallback.reply || ""),
    executedMemoryActions,
    pendingMemoryActions,
    corpusCreatedPaths,
    targetPath,
  };
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

function safeEqualString(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function parseBasicAuthorization(header) {
  const value = String(header || "");
  const match = /^Basic\s+(.+)$/i.exec(value);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return {
      user: decoded.slice(0, sep),
      password: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

function requireIomsBasicAuth(req, res, next) {
  if (!IOMS_AUTH_ENABLED) {
    next();
    return;
  }
  if (!IOMS_AUTH_PASSWORD) {
    res.status(503).send("iOMS auth is not configured. Set IOMS_AUTH_PASSWORD before starting the server.");
    return;
  }
  const credentials = parseBasicAuthorization(req.headers.authorization);
  if (
    credentials &&
    safeEqualString(credentials.user, IOMS_AUTH_USER) &&
    safeEqualString(credentials.password, IOMS_AUTH_PASSWORD)
  ) {
    next();
    return;
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="iOMS", charset="UTF-8"');
  res.status(401).send("Authentication required.");
}

/** Cross-origin als de UI op een andere poort/host draait dan deze API (Vite :5173 → API :8787). */
const enableLocalhostApiCors =
  apiOnly || !isDev || String(process.env.ENABLE_LOCALHOST_CORS || "").trim() === "1";
if (enableLocalhostApiCors) {
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "");
    if (localhostOrigin.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
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

app.use(requireIomsBasicAuth);

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

app.get("/api/confluence/config", (_req, res) => {
  res.json({ ok: true, ...confluenceConfigPayload() });
});

app.get("/api/confluence/test", async (req, res) => {
  try {
    if (req.query?.fresh === "1" || req.query?.reset === "1") {
      resetConfluenceGatewaySession();
      clearBrowserSyncedCookie();
    }
    const result = await diagnoseConfluenceAuth();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/confluence/browser-session", (_req, res) => {
  res.json({ ok: true, ...browserSessionStatus(), help: browserSessionHelpText() });
});

app.post("/api/confluence/sync-browser-session", async (_req, res) => {
  try {
    const result = await syncConfluenceBrowserSession();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/confluence/start-browser-session", async (_req, res) => {
  try {
    const result = await startConfluenceDebugEdge();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/outlook/config", (_req, res) => {
  res.json(outlookConfigPayload({ enabled: OUTLOOK_TOOLS_ENABLED }));
});

app.get("/api/kanban/tasks", (req, res) => {
  try {
    res.json(
      kanbanStore.board({
        status: req.query.status,
        project: req.query.project,
        person: req.query.person,
        query: req.query.query,
        limit: req.query.limit,
      }),
    );
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kanban/tasks/:id", (req, res) => {
  try {
    const payload = kanbanStore.getTask(req.params.id);
    res.status(payload.ok ? 200 : 404).json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/tasks", (req, res) => {
  try {
    const payload = kanbanStore.createTask(req.body || {}, {
      actor: req.body?.actor === "joost" ? "joost" : "agent",
      note: req.body?.rationale || "Taak aangemaakt via iOMS.",
    });
    res.status(201).json({ ...payload, board: kanbanStore.board() });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/api/kanban/tasks/:id", (req, res) => {
  try {
    const payload = kanbanStore.updateTask(req.params.id, req.body || {}, {
      actor: req.body?.actor === "joost" ? "joost" : "agent",
      note: req.body?.rationale || "Taak bijgewerkt via iOMS.",
    });
    res.status(payload.ok ? 200 : 404).json({ ...payload, board: kanbanStore.board() });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/tasks/:id/move", (req, res) => {
  try {
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!KANBAN_STATUSES.includes(status)) {
      res.status(400).json({ ok: false, error: `Ongeldige status. Gebruik: ${KANBAN_STATUSES.join(", ")}` });
      return;
    }
    const payload = kanbanStore.moveTask(req.params.id, status, {
      actor: req.body?.actor === "joost" ? "joost" : "agent",
      note: req.body?.rationale || "",
      targetIndex: req.body?.targetIndex,
    });
    res.status(payload.ok ? 200 : 404).json({ ...payload, board: kanbanStore.board() });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/tasks/:id/merge", (req, res) => {
  try {
    const secondaryId = typeof req.body?.secondaryId === "string" ? req.body.secondaryId : "";
    const payload = kanbanStore.mergeTasks(req.params.id, secondaryId, req.body || {}, {
      actor: req.body?.actor === "joost" ? "joost" : "agent",
      note: req.body?.rationale || "Taken gefuseerd via iOMS.",
    });
    if (payload.ok) {
      try {
        kanbanCommentsStore.mergeTasks(req.params.id, secondaryId);
      } catch {
        // Comment-merge is best-effort; taakfusie is leidend.
      }
    }
    res.status(payload.ok ? 200 : 400).json({ ...payload, board: kanbanStore.board() });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kanban/tasks/:id/comments", (req, res) => {
  try {
    const task = kanbanStore.getTask(req.params.id);
    if (!task.ok) {
      res.status(404).json(task);
      return;
    }
    const payload = kanbanCommentsStore.listThreads(req.params.id);
    res.status(payload.ok ? 200 : 400).json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/tasks/:id/comments", (req, res) => {
  try {
    const task = kanbanStore.getTask(req.params.id);
    if (!task.ok) {
      res.status(404).json(task);
      return;
    }
    const payload = kanbanCommentsStore.addThread(req.params.id, {
      body: req.body?.body,
      author: req.body?.author === "agent" || req.body?.author === "Nexus" ? "Nexus" : "joost",
    });
    res.status(payload.ok ? 201 : 400).json(payload);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/tasks/:id/comments/:commentId/replies", (req, res) => {
  try {
    const task = kanbanStore.getTask(req.params.id);
    if (!task.ok) {
      res.status(404).json(task);
      return;
    }
    const payload = kanbanCommentsStore.addReply(req.params.id, req.params.commentId, {
      body: req.body?.body,
      author: req.body?.author === "agent" || req.body?.author === "Nexus" ? "Nexus" : "joost",
    });
    res.status(payload.ok ? 201 : 400).json(payload);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kanban/ingest-signal", (req, res) => {
  try {
    const payload = kanbanStore.ingestSignal(req.body?.signal || req.body || {}, req.body?.decision || null, {
      actor: req.body?.actor === "joost" ? "joost" : "agent",
    });
    res.status(payload.ok ? 200 : 400).json({ ...payload, board: kanbanStore.board() });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kanban/meta", (_req, res) => {
  res.json({
    ok: true,
    statuses: KANBAN_STATUSES,
    priorities: KANBAN_PRIORITIES,
    directory: KANBAN_DIR,
    projects: getKanbanProjectCatalog(loadKanbanProjectRegistry(), { limit: 200 }),
  });
});

app.get("/api/email-agent/status", (_req, res) => {
  try {
    res.json(emailAgent.getStatus());
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/email-agent/config", (_req, res) => {
  try {
    res.json({ ok: true, config: emailAgent.getConfig() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.put("/api/email-agent/config", (req, res) => {
  try {
    const config = emailAgent.updateConfig(req.body || {});
    res.json({ ok: true, config, status: emailAgent.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/email-agent/scan", async (req, res) => {
  const runId = randomUUID();
  try {
    agentLog(runId, "email_agent_scan_requested", {
      fromDate: req.body?.fromDate || "",
      toDate: req.body?.toDate || "",
      forceReprocess: req.body?.forceReprocess === true,
      reactivateActions: req.body?.reactivateActions === true,
    });
    const payload = await emailAgent.runScan({
      runId,
      fromDate: req.body?.fromDate,
      toDate: req.body?.toDate,
      dryRun: req.body?.dryRun === true,
      forceReprocess: req.body?.forceReprocess === true,
      reactivateActions: req.body?.reactivateActions === true,
      configOverride: req.body?.configOverride,
    });
    res.status(payload.ok ? 200 : 207).json(payload);
  } catch (e) {
    agentLog(runId, "email_agent_scan_request_error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, runId, error: String(e?.message || e) });
  }
});

app.get("/api/email-agent/notifications", (req, res) => {
  try {
    res.json(
      emailAgent.listNotifications({
        status: req.query.status,
        limit: req.query.limit,
      }),
    );
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/api/email-agent/notifications/:id", async (req, res) => {
  const runId = randomUUID();
  try {
    const beforePayload = emailAgent.getNotification(req.params.id);
    const before = beforePayload?.notification || null;
    if (!before) {
      res.status(404).json({ ok: false, error: "Notificatie niet gevonden." });
      return;
    }
    const patch = { ...(req.body || {}) };
    const submittedUserContext = Object.prototype.hasOwnProperty.call(patch, "userContext")
      ? String(patch.userContext || "").trim()
      : "";
    const payload = submittedUserContext
      ? await processEmailNotificationUserContext({
          notificationId: req.params.id,
          userContext: submittedUserContext,
          runId,
        })
      : emailAgent.updateNotification(req.params.id, patch);
    if (!payload.ok) {
      res.status(404).json(payload);
      return;
    }
    const memoryResult = payload.memoryResult || { changed: false, digestPath: "" };
    const nextStatus = typeof patch.status === "string" ? patch.status : "";
    const linkedKanbanTaskId = payload.notification?.kanbanTaskId || before.kanbanTaskId || "";
    if (linkedKanbanTaskId && nextStatus === "action_completed") {
      const kanbanPayload = kanbanStore.moveTask(linkedKanbanTaskId, "done", {
        actor: "agent",
        note: "Gekoppelde e-mailnotificatie is afgehandeld.",
      });
      payload.kanban = kanbanPayload;
      agentLog(runId, "email_kanban_status_sync", {
        notificationId: before.id,
        taskId: linkedKanbanTaskId,
        targetStatus: "done",
        ok: kanbanPayload.ok,
      });
    }
    if (memoryResult.changed) {
      scheduleCorpusIndexRebuild("email_agent_user_context");
    }
    payload.memoryChanged = memoryResult.changed === true;
    payload.memoryPath = memoryResult.digestPath || "";
    payload.reinterpreted = !!submittedUserContext;
    payload.runId = runId;
    res.json(payload);
  } catch (e) {
    agentLog(runId, "email_context_reinterpret_error", { notificationId: req.params.id, error: String(e?.message || e) });
    res.status(500).json({ ok: false, runId, error: String(e?.message || e) });
  }
});

app.post("/api/email-agent/notifications/:id/reply-draft", async (req, res) => {
  const runId = randomUUID();
  try {
    const payload = emailAgent.getNotification(req.params.id);
    if (!payload?.notification) {
      res.status(404).json({ ok: false, runId, error: "E-mailnotificatie niet gevonden." });
      return;
    }
    const notification = payload.notification;
    if (!notification.entryId) {
      res.status(422).json({ ok: false, runId, error: "Originele Outlook entryId ontbreekt; reply-concept kan niet worden gemaakt." });
      return;
    }
    agentLog(runId, "email_reply_draft_requested", {
      notificationId: notification.id,
      subject: truncStr(notification.subject || notification.title || "", 200),
    });
    const calendarAvailability = await emailReplyCalendarAvailability(runId);
    agentLog(runId, "email_reply_calendar_context", {
      ok: calendarAvailability.ok,
      slots: Array.isArray(calendarAvailability.slots) ? calendarAvailability.slots.length : 0,
      error: calendarAvailability.error || "",
    });
    const bodyMarkdown = await generateEmailReplyDraftText({
      notification,
      memoryMarkdown: payload.memoryMarkdown,
      calendarAvailability,
      instruction: req.body?.instruction,
      runId,
    });
    const htmlBody = emailReplyHtmlFromMarkdown(bodyMarkdown);
    const draft = await createOutlookReplyDraftPayload({
      entryId: notification.entryId,
      storeId: notification.storeId,
      body: bodyMarkdown.replace(/\n{3,}/g, "\n\n"),
      htmlBody,
      display: req.body?.display !== false,
    });
    if (!draft.ok) {
      res.status(422).json({ ok: false, runId, error: draft.error || "Outlook reply-concept maken mislukt.", draft });
      return;
    }
    emailAgent.updateNotification(notification.id, { status: "read" });
    agentLog(runId, "email_reply_draft_done", {
      notificationId: notification.id,
      draftEntryId: draft.entryId || "",
      bodyChars: bodyMarkdown.length,
    });
    res.json({ ok: true, runId, bodyMarkdown, htmlBody, draft, calendarAvailability });
  } catch (e) {
    agentLog(runId, "email_reply_draft_error", { error: String(e?.message || e), notificationId: req.params.id });
    res.status(500).json({ ok: false, runId, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/mail/search", async (req, res) => {
  try {
    const payload = await searchOutlookMailPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/mail/read", async (req, res) => {
  try {
    const payload = await readOutlookMailPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/calendar/search", async (req, res) => {
  try {
    const payload = await searchOutlookCalendarPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/managed-calendar/search", async (req, res) => {
  try {
    const payload = await searchManagedOutlookCalendarPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/managed-calendar/event", async (req, res) => {
  try {
    const payload = await createManagedOutlookCalendarEventPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/outlook/mail/draft", async (req, res) => {
  try {
    const payload = await createOutlookDraftPayload(req.body || {});
    if (!payload.ok) {
      res.status(OUTLOOK_TOOLS_ENABLED ? 422 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/confluence/search", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const payload = await searchConfluencePayload(
      {
        query: req.body?.query,
        spaceKey: req.body?.spaceKey,
        limit: req.body?.limit,
      },
      runId,
    );
    if (!payload.ok) {
      res.status(/config ontbreekt|ontbreekt/i.test(payload.error || "") ? 400 : 502).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/confluence/page", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const payload = await fetchConfluencePagePayload(
      {
        pageId: req.body?.pageId,
        url: req.body?.url,
        expand: req.body?.expand,
      },
      runId,
    );
    if (!payload.ok) {
      res.status(/config ontbreekt|ontbreekt/i.test(payload.error || "") ? 400 : 502).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.put("/api/confluence/page", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const payload = await updateConfluencePageFromMarkdown(
      {
        pageId: req.body?.pageId,
        title: req.body?.title,
        baseVersion: req.body?.baseVersion,
        markdown: req.body?.markdown,
      },
      runId,
    );
    if (!payload.ok) {
      res.status(payload.conflict ? 409 : 400).json(payload);
      return;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
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

app.get("/api/agent/models/catalog", async (_req, res) => {
  try {
    const config = readAgentConfig();
    if (!config.apiKey.trim() || !config.endpoint.trim()) {
      res.status(400).json({ ok: false, error: "Agentconfig ontbreekt." });
      return;
    }
    const models = await loadModelCatalogForConfig(config);
    res.json({ ok: true, models, ...publicRouterPayload(config) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), models: [] });
  }
});

app.get("/api/agent/models/router-stats", (_req, res) => {
  try {
    const scores = readModelRouterScores();
    res.json({
      ok: true,
      scores,
      topByPhase: {
        strategy: topModelsByPhase("strategy"),
        retrieval: topModelsByPhase("retrieval"),
        synthesis: topModelsByPhase("synthesis"),
        review: topModelsByPhase("review"),
        simple: topModelsByPhase("simple"),
        utility: topModelsByPhase("utility"),
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/prompt-macros", (_req, res) => {
  try {
    res.json({ ok: true, ...readPromptMacrosPayload() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/prompt-macros", (req, res) => {
  try {
    res.json({ ok: true, ...createPromptMacro(req.body ?? {}) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.put("/api/prompt-macros/:id", (req, res) => {
  try {
    res.json({ ok: true, ...updatePromptMacro(req.params.id, req.body ?? {}) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/prompt-macros/:id", (req, res) => {
  try {
    res.json({ ok: true, ...deletePromptMacro(req.params.id) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
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

app.get("/api/nexus-debug/logs", (req, res) => {
  try {
    const kind = req.query.kind === "error" || req.query.kind === "fix" ? req.query.kind : "both";
    if (kind === "both") {
      res.json({ ok: true, error: readNexusDebugLog("error"), fix: readNexusDebugLog("fix") });
      return;
    }
    res.json(readNexusDebugLog(kind));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/nexus-debug/error-log", (req, res) => {
  try {
    res.json(
      appendNexusErrorLogEntry({
        title: req.body?.title,
        component: req.body?.component,
        tool: req.body?.tool,
        command: req.body?.command,
        error: req.body?.error,
        context: req.body?.context,
        detail: req.body?.detail,
      }),
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/nexus-debug/fix-log", (req, res) => {
  try {
    res.json(appendNexusFixLogEntry(req.body || {}));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/nexus-debug/cleanup", (req, res) => {
  try {
    res.json(cleanupNexusDebugIssue(req.body || {}));
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

app.get("/api/timesheet/draft", async (req, res) => {
  try {
    const fromDate = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toDate = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const includeCalendar = req.query.includeCalendar !== "false";
    const payload = await buildTimesheetDraftPayload({ fromDate, toDate, includeCalendar }, timesheetBuilderDeps());
    res.json(payload);
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

app.post("/api/agent/chats/:id/summarize", async (req, res) => {
  const runId = crypto.randomUUID();
  try {
    const id = safeAgentChatId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid chat id" });
      return;
    }
    const result = await summarizeAgentChatSession(id, runId, {
      keepRecentTurns: req.body?.keepRecentTurns,
    });
    if (!result.ok) {
      res.status(result.error === "Chat not found" ? 404 : 400).json({ error: result.error || "Samenvatten mislukt" });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
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
  if (!name) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  try {
    let readPath = name;
    let full = markdownFullPath(readPath);
    if (!full || !fs.existsSync(full)) {
      const manifest = readManifest(MARKDOWN_DIR, { scope: "working" });
      const canonical = resolveCanonicalDocumentPath(manifest, name);
      if (canonical && canonical !== name) {
        readPath = canonical;
        full = markdownFullPath(readPath);
      }
    }
    if (!full || !fs.existsSync(full)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const content = fs.readFileSync(full, "utf8");
    const redirectTo = resolveRedirectTarget(content);
    const aliasRedirect = readPath !== name ? readPath : null;
    res.json({
      name: readPath,
      content,
      redirectTo: redirectTo || aliasRedirect || undefined,
      requestedName: readPath !== name ? name : undefined,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/markdown-file", async (req, res) => {
  const { content } = req.body ?? {};
  if (typeof content !== "string") {
    res.status(400).json({ error: "content must be a string" });
    return;
  }
  try {
    const saved = await writeWorkMarkdownWithOrganize(req.body?.name, content, "markdown-save");
    res.json({
      ok: true,
      name: saved.name,
      movedFrom: saved.movedFrom || undefined,
      movedTo: saved.movedTo || undefined,
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/Invalid or missing markdown file name/i.test(msg)) {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

app.post("/api/markdown-file/new-draft", (req, res) => {
  try {
    const created = writeWorkDocumentDraft({ markdownDir: MARKDOWN_DIR, content: "" });
    if (!created.ok) {
      res.status(400).json({ error: created.error || "Draft aanmaken mislukt." });
      return;
    }
    scheduleCorpusRebuildAfterSave();
    res.json({ ok: true, name: created.path, content: created.content, docId: created.docId });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/markdown-file", (req, res) => {
  const name = safeMarkdownPath(req.query?.name);
  const full = name ? markdownFullPath(name) : null;
  if (!name || !full) {
    res.status(400).json({ error: "Invalid or missing markdown file name" });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "Bestand niet gevonden" });
      return;
    }
    if (!fs.statSync(full).isFile()) {
      res.status(400).json({ error: "Geen bestand" });
      return;
    }
    fs.unlinkSync(full);

    const review = reviewJsonPath(name);
    if (review && fs.existsSync(review)) fs.unlinkSync(review);

    const backup = markdownBackupPath(name);
    if (backup && fs.existsSync(backup)) fs.unlinkSync(backup);

    scheduleCorpusRebuildAfterSave();
    res.json({ ok: true, name });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/corpus-index/status", (_req, res) => {
  res.json(getCorpusIndexStatus());
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

app.get("/api/corpus-search", (req, res) => {
  try {
    const q = String(req.query?.q || req.query?.query || "").trim();
    if (!q) {
      res.status(400).json({ error: "Parameter q is verplicht." });
      return;
    }
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20) || 20));
    const scope = String(req.query?.scope || "both").toLowerCase();
    const manifests = [];
    if (scope === "working" || scope === "both") {
      const working = readManifest(MARKDOWN_DIR, { scope: "working" });
      if (working) manifests.push({ scope: "working", manifest: working });
    }
    if (scope === "memory" || scope === "both") {
      const memory = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
      if (memory) manifests.push({ scope: "memory", manifest: memory });
    }
    const payload = searchCorpusManifests(q, manifests, { limit });
    res.json({ ok: true, ...payload });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/corpus-organizer/status", (_req, res) => {
  try {
    res.json(corpusOrganizer.getStatus());
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/corpus-organizer/activity", (req, res) => {
  try {
    const days = Number(req.query?.days || 7) || 7;
    res.json({ ok: true, events: corpusOrganizer.listActivity({ days }) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/corpus-organizer/scan", async (_req, res) => {
  try {
    corpusOrganizer.ensureRoutingRules();
    const result = await corpusOrganizer.scanInbox("manual");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.patch("/api/corpus-organizer/config", (req, res) => {
  try {
    const config = corpusOrganizer.updateConfig(req.body || {});
    res.json({ ok: true, config, status: corpusOrganizer.getStatus() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/second-brain/context", (_req, res) => {
  try {
    const { workingManifest, memoryManifest } = readSecondBrainManifestsOrThrow();
    res.json({
      generatedAt: new Date().toISOString(),
      working: secondBrainSummaryFromManifest(workingManifest, "working"),
      memory: secondBrainSummaryFromManifest(memoryManifest, "memory"),
    });
  } catch (e) {
    res.status(e?.statusCode || 500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/second-brain/unlinked-mentions", (req, res) => {
  try {
    const limit = Math.min(1000, Math.max(1, Number(req.query?.limit || 500) || 500));
    res.json(secondBrainUnlinkedMentionPayload(limit));
  } catch (e) {
    res.status(e?.statusCode || 500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/second-brain/link-mentions", async (req, res) => {
  try {
    const { workingManifest, memoryManifest } = readSecondBrainManifestsOrThrow();
    const scope = String(req.body?.scope || "all").toLowerCase();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
    const maxPerFile = Math.min(100, Math.max(1, Number(req.body?.maxPerFile || 50) || 50));
    const results = [];
    if (scope === "all" || scope === "working") {
      results.push(applyUnlinkedMentionSuggestionsForScope("working", workingManifest, MARKDOWN_DIR, { ids, maxPerFile }));
    }
    if (scope === "all" || scope === "memory") {
      results.push(applyUnlinkedMentionSuggestionsForScope("memory", memoryManifest, MEMORY_DIR, { ids, maxPerFile }));
    }
    if (!["all", "working", "memory"].includes(scope)) {
      res.status(400).json({ error: "Scope moet 'all', 'working' of 'memory' zijn." });
      return;
    }
    const rebuilt = results.some((result) => result.appliedCount > 0)
      ? await runCorpusIndexRebuild("second_brain_link_mentions")
      : null;
    res.json({
      ok: true,
      scope,
      filesChanged: results.reduce((sum, result) => sum + result.filesChanged, 0),
      appliedCount: results.reduce((sum, result) => sum + result.appliedCount, 0),
      skippedCount: results.reduce((sum, result) => sum + result.skippedCount, 0),
      results,
      entryCount: rebuilt?.working?.entryCount,
      memoryEntryCount: rebuilt?.memory?.entryCount,
    });
  } catch (e) {
    res.status(e?.statusCode || 500).json({ error: String(e?.message || e) });
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
      try {
        const { templates, directory } = await fetchDocxTemplatesFromService();
        res.json({
          templates,
          directory,
          llm2docxRoot: LLM2DOCX_ROOT,
          mode: DOCX_USE_PORTAL ? "portal" : "docker",
          docxServiceUrl: DOCX_EXPORT_URL,
        });
        return;
      } catch (e) {
        if (!isDocxServiceConnectionError(e)) throw e;
        const names = listLocalDocxTemplates();
        res.json({
          templates: names,
          directory: DOCX_TEMPLATES_DIR,
          llm2docxRoot: LLM2DOCX_ROOT,
          mode: "local",
          docxServiceUrl: DOCX_EXPORT_URL,
          hint:
            names.length > 0
              ? `DOCX-service (${DOCX_EXPORT_URL}) is niet bereikbaar; lokale LLM2DOCX-templates worden gebruikt.`
              : `DOCX-service (${DOCX_EXPORT_URL}) is niet bereikbaar en er staan geen lokale .docx templates in ${DOCX_TEMPLATES_DIR}.`,
        });
        return;
      }
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
    const names = listLocalDocxTemplates();
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
        if (!isDocxServiceConnectionError(e)) {
          const b = String(/** @type {any} */ (e)?.message || e);
          throw new Error(`Word-export service niet bereikbaar (${url}). ${b}`);
        }
        const tplFull = path.join(DOCX_TEMPLATES_DIR, templateName);
        if (!fs.existsSync(tplFull)) {
          res.json({
            template_name: templateName,
            placeholders: [],
            hint: `DOCX-service is niet bereikbaar en lokaal template ontbreekt (${DOCX_TEMPLATES_DIR}).`,
          });
          return;
        }
        const placeholders = await collectJinjaPlaceholderNamesFromDocxPath(tplFull);
        res.json({
          template_name: templateName,
          placeholders,
          hint: `DOCX-service is niet bereikbaar; velden zijn lokaal uit ${DOCX_TEMPLATES_DIR} gelezen.`,
        });
        return;
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
      return;
    } catch (e) {
      const msg = String(e?.message || e);
      if (!isDocxServiceConnectionError(e)) {
        res.status(400).json({ error: msg });
        return;
      }
      console.warn(`[docx/export] DOCX-service niet bereikbaar; lokale bridge fallback. ${msg}`);
    }
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

function beginAgentChatNdjsonStream(res) {
  if (res.headersSent) {
    return (payload) => {
      try {
        res.write(`${JSON.stringify(payload)}\n`);
      } catch {
        /* client weg */
      }
    };
  }
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  return (payload) => {
    try {
      res.write(`${JSON.stringify(payload)}\n`);
    } catch {
      /* client weg */
    }
  };
}

function finishAgentChatNdjsonStream(res, writeLine, payload) {
  if (writeLine) {
    writeLine({ type: "done", ...payload });
    res.end();
    return;
  }
  res.json(payload);
}

function failAgentChatNdjsonStream(res, writeLine, error, runId, extra = {}) {
  const msg = String(error || "Onbekende fout");
  if (writeLine) {
    writeLine({ type: "error", error: msg, runId, ...extra });
    res.end();
    return;
  }
  res.status(extra.status || 500).json({ error: msg, runId, ...extra });
}

async function buildWeekPlan2ndbrainBootstrap({
  message,
  effectiveMessage,
  viewerOpenDoc,
  openDocumentLabel,
  activeView,
  name,
  runId,
}) {
  let workingManifest = readManifest(MARKDOWN_DIR, { scope: "working" });
  let memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
  if (!workingManifest?.entries?.length || !memoryManifest) {
    try {
      const rebuilt = await runCorpusIndexRebuild("weekplan_2ndbrain_bootstrap");
      if (!rebuilt) throw new Error("Rebuild gaf geen resultaat.");
      workingManifest = rebuilt.working;
      memoryManifest = rebuilt.memory;
    } catch (e) {
      agentLog(runId, "weekplan_2ndbrain_rebuild_failed", { error: String(e?.message || e) });
      throw e;
    }
  }
  const nexusIntent = classifyNexusIntent(message, {
    hasDocument: !!name,
    documentPath: name,
    mode: "ask",
    activeView,
  });
  const heuristic = await buildNexusHeuristicSnapshot({
    message,
    name: viewerOpenDoc.documentPath,
    markdown: viewerOpenDoc.markdown,
    workingManifest,
    memoryManifest,
    intent: nexusIntent,
    mode: "ask",
    activeView,
    documentLabel: openDocumentLabel || viewerOpenDoc.documentPath,
  });
  const weekPlanBlock =
    `\n\n---\n\n## Weekplan 2ndbrain (verplicht profiel)\n\n` +
    `Je vult de **Outlook-agenda 2ndbrain** met echte afspraken via create_2ndbrain_calendar_event en update_2ndbrain_calendar_event. ` +
    `Dit is **geen** documentbewerking: gebruik **niet** create_work_document, update_work_document, update_corpus_markdown of create_corpus_markdown. ` +
    `Lees corpus/memory alleen als bron; schrijf uitsluitend naar de 2ndbrain-agenda. ` +
    `Nooit de hoofdagenda wijzigen (search_outlook_calendar alleen voor conflicten). ` +
    `Na deze macro moet de gebruiker in Outlook de agenda 2ndbrain openen en daar de geplande blokken zien.\n\n` +
    secondBrainEventBodyTemplateGuide();
  return {
    markdownBlob:
      `## Gebruikersvraag\n\n${effectiveMessage}\n\n---\n\n` +
      heuristic.markdownBlob +
      weekPlanBlock +
      `\n\n---\n\n## Actieve chat short-term memory\n\n` +
      `Alleen de meegestuurde actieve chatgeschiedenis is short-term memory. Andere chats mogen niet als live context worden gebruikt.`,
    pickedPaths: heuristic.pickedPaths,
    retrievalMeta: heuristic.retrievalMeta,
    nexusIntent,
  };
}

function weekPlan2ndbrainCorpusOpts(bootstrap, message, replyMarkdown) {
  return {
    replyMarkdown,
    enableCorpusTools: true,
    enableWebSearch: false,
    enableActivityLogs: true,
    enableTimesheet: true,
    enableKanban: true,
    enableEmailMemory: true,
    enableConfluence: true,
    enableOutlook: true,
    enableMemoryWriteTools: false,
    enableWorkDocumentTools: false,
    retrievalMeta: bootstrap.retrievalMeta || null,
    intent: bootstrap.retrievalMeta?.intent || bootstrap.nexusIntent,
    structuredToolContext: nexusStructuredEvidenceEnabled("ask"),
    agentMode: "ask",
    userMessage: message,
    corpusWide: true,
  };
}

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
  const executeOnActiveObject = req.body?.executeOnActiveObject === true;
  const rawBodyName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const name = rawBodyName ? safeMarkdownPath(rawBodyName) : null;
  const effectiveMessage = executeOnActiveObject
    ? `${executeOnActiveObjectPromptBlock(name || rawBodyName || "")}${message}`
    : message;
  if (executeOnActiveObject) {
    agentLog(runId, "chat_execute_on_active", { name: name || rawBodyName || "", mode: req.body?.mode || "" });
  }
  const markdown = typeof req.body?.markdown === "string" ? req.body.markdown : "";
  const activeView = typeof req.body?.activeView === "string" ? req.body.activeView.trim() : "documents";
  const openDocumentPathRaw =
    typeof req.body?.openDocumentPath === "string" && req.body.openDocumentPath.trim()
      ? req.body.openDocumentPath.trim()
      : "";
  const openDocumentPath = openDocumentPathRaw ? safeMarkdownPath(openDocumentPathRaw) : null;
  const openDocumentLabel = typeof req.body?.openDocumentLabel === "string" ? req.body.openDocumentLabel.trim() : "";
  const openDocumentMarkdown =
    typeof req.body?.openDocumentMarkdown === "string" ? req.body.openDocumentMarkdown : "";
  const viewerOpenDoc = resolveViewerOpenDocument(
    name || "",
    markdown,
    openDocumentPath || "",
    openDocumentMarkdown,
  );
  const activityChatId = safeAgentChatId(req.body?.chatId) || "";
  const activityChatTitle = cleanAgentChatTitle(req.body?.chatTitle || "");
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const wantDebug =
    req.body?.debugLlm === true || String(process.env.AGENT_LLM_DEBUG || "").trim() === "1";
  const llmDebug = wantDebug ? {} : null;
  const corpusWide = req.body?.corpusWide === true;
  const webSearch = req.body?.webSearch === true;
  const memoryWriteRequest = mode === "ask" && looksLikeCorpusMemoryWriteRequest(message);
  const durableMemorySignal = looksLikeDurableMemorySignal(message);
  const organicMemorySignal = looksLikeOrganicMemoryContext(message, {
    documentPath: name || viewerOpenDoc.documentPath || "",
  });
  const memoryContextSignal = durableMemorySignal || organicMemorySignal;
  const dreamMemoryRequest = looksLikeDreamMemoryRequest(message);
  const activityLogRequest = looksLikeActivityLogRequest(message);
  const outlookToolRequest = looksLikeOutlookToolRequest(message);
  const promptMacroId = typeof req.body?.promptMacroId === "string" ? req.body.promptMacroId.trim() : "";
  const weekPlan2ndbrainRequest = isWeekPlan2ndbrainRequest(promptMacroId, message);
  const askMemoryTools = mode === "ask" && !weekPlan2ndbrainRequest;
  const useCorpusTools = mode === "ask" || corpusWide;
  const askToolMode = mode === "ask" || webSearch || activityLogRequest;
  const activityStream = (corpusWide || webSearch) && req.body?.activityStream !== false;
  const replyMarkdown = req.body?.replyMarkdown !== false;
  const activityBase = (extra = {}) => ({
    runId,
    chatId: activityChatId,
    chatTitle: activityChatTitle,
    mode,
    documentPath: name || viewerOpenDoc.documentPath || rawBodyName || "",
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

    if (weekPlan2ndbrainRequest) {
      agentLog(runId, "chat_weekplan_2ndbrain_start", {
        promptMacroId,
        mode,
        historyLen: history.length,
        activityStream,
      });
      let bootstrap;
      try {
        bootstrap = await buildWeekPlan2ndbrainBootstrap({
          message,
          effectiveMessage,
          viewerOpenDoc,
          openDocumentLabel,
          activeView,
          name: name || viewerOpenDoc.documentPath || "",
          runId,
        });
      } catch (e) {
        const msgErr = `Weekplan-bootstrap mislukt: ${String(e?.message || e)}`;
        appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
        res.status(500).json({ error: msgErr, runId });
        return;
      }
      const weekPlanOpts = weekPlan2ndbrainCorpusOpts(bootstrap, message, replyMarkdown);
      try {
        if (activityStream) {
          res.status(200);
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("X-Accel-Buffering", "no");
          let streamedReplyChars = 0;
          try {
            const result = await callCorpusAskAgentWithTools(
              config,
              bootstrap.markdownBlob,
              history,
              { runId },
              llmDebug,
              (payload) => {
                res.write(`${JSON.stringify(payload)}\n`);
              },
              weekPlanOpts,
            );
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
              performanceMetrics: result.performanceMetrics || null,
            }));
            res.write(
              `${JSON.stringify({
                type: "done",
                runId,
                reply: result.reply,
                changed: false,
                activities: result.activities,
                ...(result.performanceMetrics ? { performanceMetrics: result.performanceMetrics } : {}),
                ...(result.modelTrace?.length ? { modelTrace: result.modelTrace } : {}),
                ...(result.structuredToolContext ? { structuredToolContext: result.structuredToolContext } : {}),
                ...(result.evidenceFooter ? { evidenceFooter: result.evidenceFooter } : {}),
                ...(llmDebug ? { debugLlm: llmDebug } : {}),
              })}\n`,
            );
          } catch (e) {
            const msgErr = String(e?.message || e);
            agentLog(runId, "chat_weekplan_2ndbrain_stream_error", { error: msgErr });
            appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
            res.write(`${JSON.stringify({ type: "error", error: msgErr, runId })}\n`);
          }
          res.end();
          agentLog(runId, "chat_weekplan_2ndbrain_done", { replyChars: streamedReplyChars, streamed: true });
          return;
        }

        const result = await callCorpusAskAgentWithTools(
          config,
          bootstrap.markdownBlob,
          history,
          { runId },
          llmDebug,
          null,
          weekPlanOpts,
        );
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
          performanceMetrics: result.performanceMetrics || null,
        }));
        res.json({
          runId,
          reply: result.reply,
          changed: false,
          activities: result.activities,
          ...(result.performanceMetrics ? { performanceMetrics: result.performanceMetrics } : {}),
          ...(result.modelTrace?.length ? { modelTrace: result.modelTrace } : {}),
          ...(result.structuredToolContext ? { structuredToolContext: result.structuredToolContext } : {}),
          ...(result.evidenceFooter ? { evidenceFooter: result.evidenceFooter } : {}),
          ...(llmDebug ? { debugLlm: llmDebug } : {}),
        });
      } catch (e) {
        const msgErr = String(e?.message || e);
        agentLog(runId, "chat_weekplan_2ndbrain_error", { error: msgErr });
        appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
        res.status(500).json({ error: msgErr, runId });
      }
      return;
    }

    if (mode === "agent" && outlookToolRequest && req.body?.toolsEnabled === false) {
      agentLog(runId, "chat_agent_outlook_as_tools", { document: name || "", historyLen: history.length });
      const bootstrap = {
        markdownBlob:
          `## Gebruikersvraag\n\n${effectiveMessage}\n\n---\n\n` +
          `## Huidig geopend Markdown-document\n\n` +
          `Gebruik dit document als primaire bron voor de gevraagde Outlook-/2ndbrain-agenda-actie. ` +
          `Als de gebruiker vraagt planning uit dit document te verwerken, maak dan passende afspraken aan via create_2ndbrain_calendar_event. ` +
          `Schrijf nooit in de hoofdagenda en wijzig het Markdown-document niet tenzij de gebruiker dat expliciet vraagt.\n\n` +
          `Pad: ${name || "(geen pad meegestuurd)"}\n\n` +
          `${markdown || "(geen geopend document of lege inhoud)"}`,
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
          {
            replyMarkdown,
            enableCorpusTools: false,
            enableWebSearch: req.body?.webSearch === true,
            enableActivityLogs: false,
            enableConfluence: true,
            enableOutlook: true,
            enableMemoryWriteTools: false,
          },
        );
        appendAgentActivityLog(activityBase({
          status: "done",
          reply: truncStr(result.reply, 1000),
          changed: false,
          performanceMetrics: result.performanceMetrics || null,
        }));
        res.json({
          runId,
          reply: result.reply,
          changed: false,
          activities: result.activities,
          ...(Array.isArray(result.viewerActions) && result.viewerActions.length
            ? { viewerActions: result.viewerActions }
            : {}),
          ...(result.performanceMetrics ? { performanceMetrics: result.performanceMetrics } : {}),
          ...(llmDebug ? { debugLlm: llmDebug } : {}),
        });
      } catch (e) {
        const msgErr = String(e?.message || e);
        agentLog(runId, "chat_agent_outlook_tools_error", { error: msgErr });
        appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
        res.status(500).json({ error: msgErr, runId });
      }
      return;
    }

    if (mode === "agent" && activityLogRequest && req.body?.toolsEnabled === false) {
      agentLog(runId, "chat_agent_activity_logs_as_ask", { historyLen: history.length });
      let timesheetBlock = "";
      try {
        const draft = await buildTimesheetDraftPayload({}, timesheetBuilderDeps());
        timesheetBlock = `\n\n---\n\n${draft.markdown || formatTimesheetDraftMarkdown(draft)}`;
      } catch {
        /* optional */
      }
      const bootstrap = {
        markdownBlob:
          `## Gebruikersvraag\n\n${effectiveMessage}\n\n---\n\n` +
          `## Urenregistratie\n\nGebruik build_timesheet_draft als eerste stap, en verdiep met read_activity_logs, search_kanban_tasks, search_email_memory en Outlook-tools waar nodig.${timesheetBlock}`,
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
          {
            replyMarkdown,
            enableCorpusTools: false,
            enableWebSearch: false,
            enableActivityLogs: true,
            enableTimesheet: true,
            enableKanban: true,
            enableEmailMemory: true,
            enableOutlook: OUTLOOK_TOOLS_ENABLED,
          },
        );
        appendAgentActivityLog(activityBase({
          status: "done",
          reply: truncStr(result.reply, 1000),
          changed: false,
        }));
        res.json({
          runId,
          reply: result.reply,
          changed: false,
          activities: result.activities,
          ...(llmDebug ? { debugLlm: llmDebug } : {}),
        });
      } catch (e) {
        const msgErr = String(e?.message || e);
        appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
        res.status(500).json({ error: msgErr, runId });
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
            : memoryContextSignal
              ? pickMemoryTargetPath(message, memoryManifest, inferDurableMemoryTargetPath(message))
              : "";
          const nexusIntent = classifyNexusIntent(message, {
            hasDocument: !!name,
            documentPath: name,
            mode: "ask",
            activeView,
            organicMemoryContext: memoryContextSignal,
          });
          const heuristic = await buildNexusHeuristicSnapshot({
            message,
            name: viewerOpenDoc.documentPath,
            markdown: viewerOpenDoc.markdown,
            workingManifest,
            memoryManifest,
            intent: nexusIntent,
            mode: "ask",
            activeView,
            documentLabel: openDocumentLabel || viewerOpenDoc.documentPath,
          });
          bootstrap = {
            markdownBlob:
              `## Gebruikersvraag\n\n${effectiveMessage}\n\n---\n\n` +
              heuristic.markdownBlob +
              `\n\n---\n\n` +
              `## Actieve chat short-term memory\n\n` +
              `Alleen de meegestuurde actieve chatgeschiedenis is short-term memory. Andere chats mogen niet als live context worden gebruikt.`,
            pickedPaths: heuristic.pickedPaths,
            retrievalMeta: heuristic.retrievalMeta,
          };
          if (llmDebug && typeof llmDebug === "object") {
            llmDebug.retrievalMeta = bootstrap.retrievalMeta;
          }
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
          if (memoryContextSignal && !memoryWriteRequest) {
            bootstrap.markdownBlob +=
              `\n\n---\n\n## Duurzaam memory-signaal herkend\n\n` +
              `Dit bericht lijkt duurzame persoonlijke context, voorkeuren, werkwijze, project- of klantinformatie te bevatten. ` +
              `Bepaal autonoom of dit in long-term memory hoort. Als dat zo is, voer direct één of meerdere memory-acties uit onder Files/.memory/.\n\n` +
              `Richtlijnen:\n` +
              `- Voorkeuren, antwoordstijl en werkwijze horen meestal onder \`voorkeuren/\` of \`werkwijzen/\`.\n` +
              `- Persoonlijke context over Joost of relaties hoort meestal onder \`personen/\` of \`personen_iO/\`.\n` +
              `- Project- of klantcontext hoort meestal onder \`onderwerpen/\`.\n` +
              `- Als een passend memory-document al bestaat, lees het eerst met read_memory_markdown en werk het bij.\n` +
              `- Als er nog geen passend document bestaat, maak er zelfstandig een aan.\n` +
              `- Geef geen aparte gebruikersmelding over de memory-mutatie.`;
          } else if (!weekPlan2ndbrainRequest && askMemoryTools) {
            bootstrap.markdownBlob += `\n\n---\n\n${organicMemoryBootstrapHint()}`;
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
              `## Gebruikersvraag\n\n${effectiveMessage}\n\n---\n\n` +
              `## Huidig Markdown-document (alleen ter referentie)\n\n${markdown || "(geen geopend document of lege inhoud)"}`,
            pickedPaths: [],
          };
        }
        agentLog(runId, "chat_ask_tools_bootstrap", {
          markdownChars: bootstrap.markdownBlob.length,
          pickedPaths: bootstrap.pickedPaths.slice(0, 40),
          pickedCount: bootstrap.pickedPaths.length,
          retrievalMeta: bootstrap.retrievalMeta || null,
          prefetchChars: bootstrap.retrievalMeta?.prefetchChars || 0,
          optionalSourceHints: bootstrap.retrievalMeta?.optionalSourceHints || [],
          corpusWide,
          webSearch,
          memoryWriteRequest,
          durableMemorySignal,
          dreamMemoryRequest,
        });

        const ensureMemoryProposalFallback = async (result) => {
          const deferredMemoryWrite = hasMemoryWriteDeferral(result?.reply);
          const replyTargetPath = memoryPathFromText(result?.reply);
          if (
            (!memoryWriteRequest && !memoryContextSignal && !dreamMemoryRequest && !deferredMemoryWrite) ||
            (Array.isArray(result.executedMemoryActions) && result.executedMemoryActions.length) ||
            (Array.isArray(result.pendingMemoryActions) && result.pendingMemoryActions.length)
          ) {
            return result;
          }
          const pickedMemoryPath = (bootstrap.pickedPaths || [])
            .map((p) => String(p || ""))
            .find((p) => p.startsWith("memory:"))
            ?.replace(/^memory:/, "");
          const targetPath = memoryTargetPath || replyTargetPath || pickedMemoryPath || "";
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
            `${message}\n\nAssistant deferral/context:\n${result?.reply || ""}`,
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
                enableConfluence: true,
                enableOutlook: true,
                enableMemoryWriteTools: askMemoryTools,
                retrievalMeta: bootstrap.retrievalMeta || null,
                intent: bootstrap.retrievalMeta?.intent || nexusIntent,
                structuredToolContext: nexusStructuredEvidenceEnabled("ask"),
                agentMode: "ask",
                userMessage: message,
                corpusWide: useCorpusTools,
              },
            );
            result = await ensureMemoryProposalFallback(result);
            result.reply = stripMemoryPermissionClaimsFromReply(result.reply);
            streamedReplyChars = result.reply.length;
            const streamOrganicMeta = organicReflectionMeta({
              chatId: activityChatId,
              message,
              reply: result.reply,
              history,
              runId,
              mode: "ask",
              documentPath: name || viewerOpenDoc.documentPath || "",
              currentMarkdown: markdown,
              weekPlan2ndbrain: weekPlan2ndbrainRequest,
              executedMemoryCount: Array.isArray(result.executedMemoryActions) ? result.executedMemoryActions.length : 0,
              durableSignal: durableMemorySignal,
              organicSignal: organicMemorySignal,
            });
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
              performanceMetrics: result.performanceMetrics || null,
            }));
            res.write(
              `${JSON.stringify({
                type: "done",
                runId,
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
                ...(result.performanceMetrics ? { performanceMetrics: result.performanceMetrics } : {}),
                ...(result.modelTrace?.length ? { modelTrace: result.modelTrace } : {}),
                ...(result.structuredToolContext ? { structuredToolContext: result.structuredToolContext } : {}),
                ...(result.evidenceFooter ? { evidenceFooter: result.evidenceFooter } : {}),
                ...streamOrganicMeta,
                ...(llmDebug ? { debugLlm: llmDebug } : {}),
              })}\n`,
            );
          } catch (e) {
            const msgErr = String(e?.message || e);
            agentLog(runId, "chat_ask_corpus_stream_error", { error: msgErr });
            appendAgentActivityLog(activityBase({ status: "error", error: msgErr }));
            res.write(`${JSON.stringify({ type: "error", error: msgErr, runId })}\n`);
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
              enableConfluence: true,
              enableOutlook: true,
              enableMemoryWriteTools: askMemoryTools,
              retrievalMeta: bootstrap.retrievalMeta || null,
              intent: bootstrap.retrievalMeta?.intent || nexusIntent,
              structuredToolContext: nexusStructuredEvidenceEnabled("ask"),
              agentMode: "ask",
              userMessage: message,
              corpusWide: useCorpusTools,
            },
          );
          result = await ensureMemoryProposalFallback(result);
          result.reply = stripMemoryPermissionClaimsFromReply(result.reply);
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
            performanceMetrics: result.performanceMetrics || null,
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
            runId,
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
            ...(result.performanceMetrics ? { performanceMetrics: result.performanceMetrics } : {}),
            ...(result.modelTrace?.length ? { modelTrace: result.modelTrace } : {}),
            ...(result.structuredToolContext ? { structuredToolContext: result.structuredToolContext } : {}),
            ...(result.evidenceFooter ? { evidenceFooter: result.evidenceFooter } : {}),
            ...organicReflectionMeta({
              chatId: activityChatId,
              message,
              reply: result.reply,
              history,
              runId,
              mode: "ask",
              documentPath: name || viewerOpenDoc.documentPath || "",
              currentMarkdown: markdown,
              weekPlan2ndbrain: weekPlan2ndbrainRequest,
              executedMemoryCount: Array.isArray(result.executedMemoryActions) ? result.executedMemoryActions.length : 0,
              durableSignal: durableMemorySignal,
              organicSignal: organicMemorySignal,
            }),
            ...(llmDebug ? { debugLlm: llmDebug } : {}),
          });
        } catch (e) {
          agentLog(runId, "chat_ask_corpus_error", { error: String(e?.message || e) });
          appendAgentActivityLog(activityBase({ status: "error", error: String(e?.message || e) }));
          res.status(500).json({ error: String(e?.message || e), runId });
        }
        return;
      }

      agentLog(runId, "chat_ask_start", { markdownChars: markdown.length, historyLen: history.length });
      let askLlmCtx = null;
      if (isAutoModel(config.model)) {
        askLlmCtx = await createLlmRouterContext(config, {
          runId,
          intentProfile: "simple",
          userMessage: message,
          contextChars: markdown.length,
        });
      }
      const askResult = await callAskAgent(config, markdown, message, history, { runId }, llmDebug, {
        replyMarkdown,
        currentPath: name,
        llmCtx: askLlmCtx,
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
      const normalAskDeferredMemoryWrite = hasMemoryWriteDeferral(askResult.reply);
      if (
        normalAskDeferredMemoryWrite &&
        !normalAskExecutedMemoryActions.length &&
        !normalAskPendingMemoryActions.length
      ) {
        try {
          const forcedMemory = await executeDurableMemoryFallback(
            config,
            `${message}\n\nAssistant deferral/context:\n${askResult.reply || ""}`,
            history,
            runId,
            llmDebug,
            {
              replyMarkdown,
              force: true,
              targetPath: memoryPathFromText(askResult.reply),
              currentPath: name || "",
              currentMarkdown: markdown,
            },
          );
          normalAskExecutedMemoryActions.push(...(forcedMemory.executedMemoryActions || []));
          normalAskPendingMemoryActions.push(...(forcedMemory.pendingMemoryActions || []));
          normalAskCorpusCreatedPaths.push(...(forcedMemory.corpusCreatedPaths || []));
          reply = stripMemoryHousekeepingFromReply(
            forcedMemory.executedMemoryActions?.length || forcedMemory.pendingMemoryActions?.length
              ? forcedMemory.reply || reply
              : reply,
            normalAskExecutedMemoryActions,
          );
        } catch (e) {
          agentLog(runId, "chat_ask_forced_memory_fallback_error", { error: String(e?.message || e) });
        }
      }
      reply = stripMemoryPermissionClaimsFromReply(reply);
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
        runId,
        reply,
        changed: false,
        executedMemoryActions: normalAskExecutedMemoryActions,
        corpusCreatedPaths: normalAskCorpusCreatedPaths,
        pendingMemoryActions: normalAskPendingMemoryActions,
        ...organicReflectionMeta({
          chatId: activityChatId,
          message,
          reply,
          history,
          runId,
          mode: "ask",
          documentPath: name || viewerOpenDoc.documentPath || "",
          currentMarkdown: markdown,
          weekPlan2ndbrain: weekPlan2ndbrainRequest,
          executedMemoryCount: normalAskExecutedMemoryActions.length,
          durableSignal: durableMemorySignal,
          organicSignal: organicMemorySignal,
        }),
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

    if (!executeOnActiveObject && !promptMacroId) {
      agentLog(runId, "chat_agent_blocked_without_execute_toggle", { document: name });
      res.status(400).json({
        error:
          "Documentwijzigingen vereisen dat «Wijzig document» aan staat. Stel een vraag zonder die knop of zet hem aan voor een reviewvoorstel.",
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
      if (!pathFull) {
        agentLog(runId, "chat_not_found", { document: name, reason: "invalid_path" });
        res.status(404).json({ error: "Ongeldig documentpad." });
        return;
      }
      const exists = fs.existsSync(pathFull);
      const hasInlineMarkdown = String(markdown || "").trim().length > 0;
      if (!exists && !hasInlineMarkdown) {
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

    const agentStreamEnabled = req.body?.activityStream !== false;
    let writeAgentStream = null;
    let reviewHeartbeat = null;
    if (agentStreamEnabled) {
      writeAgentStream = beginAgentChatNdjsonStream(res);
      writeAgentStream({
        type: "activity",
        phase: "agent",
        label: "Nexus start documentopdracht…",
      });
    }

    let toolContextResult = null;
    let toolAugmentedMessage = effectiveMessage;
    const nexusIntent = classifyNexusIntent(message, {
      hasDocument: true,
      documentPath: name,
      mode: "agent",
      activeView,
      organicMemoryContext: memoryContextSignal,
    });
    const skipAgentToolContext = shouldSkipAgentToolContext({ promptMacroId, message, markdown });
    if (skipAgentToolContext) {
      agentLog(runId, "chat_agent_tool_context_skipped", {
        document: name,
        promptMacroId: promptMacroId || null,
        emptyDocument: isEffectivelyEmptyDocumentMarkdown(markdown),
      });
    }
    if (req.body?.toolsEnabled !== false && !skipAgentToolContext) {
      try {
        let workingManifest = readManifest(MARKDOWN_DIR, { scope: "working" });
        let memoryManifest = readManifest(MARKDOWN_DIR, { scope: "memory", indexDir: MEMORY_INDEX_DIR });
        if (!workingManifest?.entries?.length || !memoryManifest) {
          const rebuilt = await runCorpusIndexRebuild("agent_tool_context_missing_index");
          if (rebuilt) {
            workingManifest = rebuilt.working;
            memoryManifest = rebuilt.memory;
          }
        }
        const heuristic = await buildNexusHeuristicSnapshot({
          message,
          name: viewerOpenDoc.documentPath || name,
          markdown: viewerOpenDoc.markdown || markdown,
          workingManifest,
          memoryManifest,
          intent: nexusIntent,
          mode: "agent",
          activeView,
          documentLabel: openDocumentLabel || viewerOpenDoc.documentPath || name || "",
        });
        const templateChecklist = getTemplateChecklist(name, markdown);
        const toolBootstrapParts = [
          "## Nexus toolcontext voor document-review",
          "Gebruik alle relevante tools om broncontext te verzamelen of noodzakelijke niet-documentacties uit te voeren voordat de review-agent een documentvoorstel maakt.",
          "Maak in deze toolcontext-call zelf geen Markdown-patches voor het geopende document. Geef compact terug welke feiten, bronnen, acties of waarschuwingen de review-agent moet meenemen.",
          "",
          "## Gebruikersopdracht",
          effectiveMessage,
          "",
          "---",
          "",
          heuristic.markdownBlob,
        ];
        if (templateChecklist?.promptBlock) {
          toolBootstrapParts.push("", "---", "", templateChecklist.promptBlock);
        }
        const toolBootstrap = toolBootstrapParts.join("\n");
        const toolDebug = llmDebug ? {} : null;
        writeAgentStream?.({
          type: "activity",
          phase: "tools",
          label: "Broncontext verzamelen voor documentvoorstel…",
        });
        toolContextResult = await callCorpusAskAgentWithTools(
          config,
          toolBootstrap,
          history,
          { runId },
          toolDebug,
          writeAgentStream,
          {
            replyMarkdown,
            enableCorpusTools: true,
            enableWebSearch: webSearch,
            enableActivityLogs: true,
            enableConfluence: true,
            enableOutlook: true,
            enableMemoryWriteTools: true,
            retrievalMeta: heuristic.retrievalMeta,
            intent: nexusIntent,
            structuredToolContext: true,
            agentMode: "agent",
            includeEvidenceFooter: false,
            userMessage: effectiveMessage,
            corpusWide: true,
          },
        );
        if (llmDebug && toolDebug) llmDebug.toolContext = toolDebug;
        if (toolContextResult?.reply) {
          const evidenceBlock = toolContextResult.structuredToolContext
            ? formatEvidenceBlock(toolContextResult.structuredToolContext)
            : "";
          toolAugmentedMessage = [
            effectiveMessage,
            "",
            "---",
            "",
            "Nexus toolcontext voor dit documentvoorstel:",
            toolContextResult.reply,
            evidenceBlock ? `\n\n${evidenceBlock}` : "",
          ].join("\n");
        }
        if (templateChecklist?.promptBlock) {
          toolAugmentedMessage = `${toolAugmentedMessage}\n\n---\n\n${templateChecklist.promptBlock}`;
        }
        agentLog(runId, "chat_agent_tool_context_done", {
          document: name,
          replyChars: String(toolContextResult?.reply || "").length,
          toolCallCount: toolContextResult?.performanceMetrics?.toolCallCount || 0,
        });
      } catch (e) {
        const toolError = String(e?.message || e);
        toolAugmentedMessage = [
          effectiveMessage,
          "",
          "---",
          "",
          `Nexus toolcontext kon niet worden opgehaald: ${toolError}`,
          "Maak alleen een documentvoorstel als de opdracht met de beschikbare documentcontext verantwoord kan worden uitgevoerd.",
        ].join("\n");
        agentLog(runId, "chat_agent_tool_context_error", { document: name, error: toolError });
      }
    }

    agentLog(runId, "chat_agent_start", { document: name, markdownChars: markdown.length });
    writeAgentStream?.({
      type: "activity",
      phase: "review",
      label: "Reviewvoorstel opstellen…",
    });
    if (writeAgentStream) {
      reviewHeartbeat = setInterval(() => {
        writeAgentStream({
          type: "activity",
          phase: "heartbeat",
          label: "Nexus werkt nog aan het documentvoorstel…",
        });
      }, 12_000);
    }
    const synthetic = commentForAgentCall({
      id: "chat",
      body: toolAugmentedMessage,
      quote: selectionParts.quote,
      prefix: selectionParts.prefix,
      suffix: selectionParts.suffix,
      replies: [],
    });
    const priorChatForApi = wrapChatHistoryForReviewAgent(history);
    let reviewLlmCtx = null;
    if (isAutoModel(config.model)) {
      reviewLlmCtx = await createLlmRouterContext(config, {
        runId,
        pushActivity: (row) => writeAgentStream?.({ type: "activity", ts: Date.now(), ...row }),
        intent: nexusIntent,
        userMessage: message,
      });
    }
    let parsed;
    try {
      parsed = await callReviewAgent(
        config,
        markdown,
        synthetic,
        { runId, step: 1, commentId: "chat", documentPath: name || viewerOpenDoc.documentPath || "", llmCtx: reviewLlmCtx },
        priorChatForApi,
        "chat",
        llmDebug,
        replyMarkdown,
      );
    } finally {
      if (reviewHeartbeat) clearInterval(reviewHeartbeat);
    }
    const replyForCoerce = replyStringFromParsedAgentResponse(parsed);
    const changesRaw = coerceAgentChangesForEmptyDocument(
      markdown,
      Array.isArray(parsed?.changes) ? parsed.changes : [],
      replyForCoerce,
    );
    if (
      changesRaw.length &&
      isEffectivelyEmptyDocumentMarkdown(markdown) &&
      (!Array.isArray(parsed?.changes) || !parsed.changes.length)
    ) {
      agentLog(runId, "empty_document_changes_coerced", {
        document: name,
        fromReply: changesRaw.some((c) => c?.replace === replyForCoerce || extractMarkdownBodyFromAgentReply(replyForCoerce) === c?.replace),
        chars: String(changesRaw[0]?.replace || "").length,
      });
    }
    let nextMd = markdown;
    let changed = false;
    try {
      nextMd = applyPatchesToMarkdown(markdown, changesRaw, { chatCoerceRunId: runId, documentPath: name });
      changed = nextMd !== markdown;
    } catch (e) {
      agentLog(runId, "chat_agent_patch_error", { document: name, error: String(e?.message || e) });
      const patchErrPayload = {
        error: String(e?.message || e),
        reply: replyStringFromParsedAgentResponse(parsed),
        runId,
        ...(llmDebug ? { debugLlm: llmDebug } : {}),
      };
      if (writeAgentStream) {
        failAgentChatNdjsonStream(res, writeAgentStream, patchErrPayload.error, runId, {
          status: 422,
          reply: patchErrPayload.reply,
          ...(llmDebug ? { debugLlm: llmDebug } : {}),
        });
      } else {
        res.status(422).json(patchErrPayload);
      }
      return;
    }

    let wroteFile = false;
    let documentPath = name;
    let movedFrom = null;
    let movedTo = null;
    if (changed) {
      if (virtualSession) {
        const backupState = { backedUp: false };
        backupExternalMarkdownIfNeeded(name, markdown, backupState);
      } else {
        try {
          const saved = await writeWorkMarkdownWithOrganize(name, nextMd, runId);
          documentPath = saved.name;
          movedFrom = saved.movedFrom;
          movedTo = saved.movedTo;
          wroteFile = true;
        } catch (e) {
          agentLog(runId, "chat_agent_write_error", { document: name, error: String(e?.message || e) });
          throw e;
        }
      }
      try {
        const replyTextRaw = replyStringFromParsedAgentResponse(parsed);
        const replyTextForReview =
          replyTextRaw ||
          (changed ? `Toegepast: ${changesRaw.length} patch(es).` : "Geen wijzigingen doorgevoerd.");
        appendAgentChatReviewApprovalThread(
          documentPath,
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
    const replyTextRaw = replyStringFromParsedAgentResponse(parsed);
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
    const toolExecutedMemoryActions = Array.isArray(toolContextResult?.executedMemoryActions)
      ? toolContextResult.executedMemoryActions
      : [];
    const toolPendingMemoryActions = Array.isArray(toolContextResult?.pendingMemoryActions)
      ? toolContextResult.pendingMemoryActions
      : [];
    const toolCorpusCreatedPaths = Array.isArray(toolContextResult?.corpusCreatedPaths)
      ? toolContextResult.corpusCreatedPaths
      : [];
    appendAgentActivityLog(activityBase({
      status: "done",
      reply: truncStr(replyText, 1000),
      changed,
      wroteFile,
      memoryActionCount:
        toolExecutedMemoryActions.length +
        (Array.isArray(agentMemoryFallback.executedMemoryActions)
          ? agentMemoryFallback.executedMemoryActions.length
          : 0),
      corpusCreatedPaths: [
        ...toolCorpusCreatedPaths,
        ...(Array.isArray(agentMemoryFallback.corpusCreatedPaths)
          ? agentMemoryFallback.corpusCreatedPaths
          : []),
      ],
    }));
    const agentOrganicMeta = organicReflectionMeta({
      chatId: activityChatId,
      message,
      reply: replyText,
      history,
      runId,
      mode: "agent",
      documentPath: name || "",
      currentMarkdown: markdown,
      weekPlan2ndbrain: false,
      executedMemoryCount:
        toolExecutedMemoryActions.length +
        (Array.isArray(agentMemoryFallback.executedMemoryActions)
          ? agentMemoryFallback.executedMemoryActions.length
          : 0),
      durableSignal: durableMemorySignal,
      organicSignal: organicMemorySignal,
    });
    finishAgentChatNdjsonStream(res, writeAgentStream, {
      runId,
      reply: replyText,
      markdown: nextMd,
      changed,
      wroteFile,
      documentPath,
      movedFrom: movedFrom || undefined,
      movedTo: movedTo || undefined,
      ...(Array.isArray(toolContextResult?.activities) && toolContextResult.activities.length
        ? { activities: toolContextResult.activities }
        : {}),
      ...(toolContextResult?.performanceMetrics ? { performanceMetrics: toolContextResult.performanceMetrics } : {}),
      ...(toolCorpusCreatedPaths.length || (Array.isArray(agentMemoryFallback.corpusCreatedPaths) && agentMemoryFallback.corpusCreatedPaths.length)
        ? { corpusCreatedPaths: [...toolCorpusCreatedPaths, ...(agentMemoryFallback.corpusCreatedPaths || [])] }
        : {}),
      ...(toolExecutedMemoryActions.length || (Array.isArray(agentMemoryFallback.executedMemoryActions) && agentMemoryFallback.executedMemoryActions.length)
        ? { executedMemoryActions: [...toolExecutedMemoryActions, ...(agentMemoryFallback.executedMemoryActions || [])] }
        : {}),
      ...(toolPendingMemoryActions.length || (Array.isArray(agentMemoryFallback.pendingMemoryActions) && agentMemoryFallback.pendingMemoryActions.length)
        ? { pendingMemoryActions: [...toolPendingMemoryActions, ...(agentMemoryFallback.pendingMemoryActions || [])] }
        : {}),
      ...agentOrganicMeta,
      ...(llmDebug ? { debugLlm: llmDebug } : {}),
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const isLlmPayloadError =
      /LLM-response|geen geldige JSON|Lege LLM-response|Lege reply van de LLM/i.test(msg);
    agentLog(runId, "chat_fatal", { mode, error: msg, isLlmPayloadError });
    appendNexusErrorLogEntry({
      runId,
      title: "Nexus chat fatal error",
      component: "agent-chat",
      tool: "n.v.t.",
      command: String(req.body?.message || "").slice(0, 1200),
      error: msg,
      context: `mode=${mode || "unknown"}`,
      detail: {
        mode,
        isLlmPayloadError,
        name: req.body?.name || "",
        corpusWide: req.body?.corpusWide === true,
        webSearch: req.body?.webSearch === true,
      },
    });
    appendAgentActivityLog(activityBase({ status: "error", error: msg }));
    res.status(isLlmPayloadError ? 422 : 500).json({
      error: msg,
      runId,
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
    res.status(500).json({ error: String(e?.message || e), runId });
  }
});

async function main() {
  const server = http.createServer(app);
  server.requestTimeout = 0;
  server.headersTimeout = 310_000;
  server.keepAliveTimeout = 310_000;

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
      startOrganicMemorySchedulers();
      emailAgent.startScheduler();
      corpusOrganizer.ensureRoutingRules();
      corpusOrganizer.startScheduler();
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
    startOrganicMemorySchedulers();
    emailAgent.startScheduler();
    corpusOrganizer.ensureRoutingRules();
    corpusOrganizer.startScheduler();
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
