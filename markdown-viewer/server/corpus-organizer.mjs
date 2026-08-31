/**
 * Corpus Gardener — autonome classificatie en verplaatsing van werkdocumenten.
 * Inbox-first: nieuwe documenten in 00-inbox/ worden na save geclassificeerd en verplaatst.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ensureCorpusMetaComment,
  extractDocumentMetadata,
  scoreEntriesForQuestion,
  stripCorpusMetaFromMarkdown,
} from "./corpus-index.mjs";
import { safeMarkdownPath } from "./path-safety.mjs";

export const INBOX_PREFIX = "00-inbox/";
/** Tijdelijke inbox-bestanden zonder titel; Corpus Gardener verplaatst na voldoende inhoud. */
export const DRAFT_BASENAME_PREFIX = "_draft-";
export const ORGANIZER_DIRNAME = ".corpus-organizer";
export const DEFAULT_AUTO_MOVE_CONFIDENCE = 0.85;
export const DEFAULT_PRIVATE_CONFIDENCE = 0.9;
export const MAX_MOVES_PER_HOUR = 10;

const DEFAULT_ROUTING_RULES = {
  version: 1,
  thresholds: {
    autoMove: DEFAULT_AUTO_MOVE_CONFIDENCE,
    private: DEFAULT_PRIVATE_CONFIDENCE,
  },
  folders: [
    {
      prefix: "01-managed-services/",
      purpose: "Managed services: contracten, bijlagen, handouts, confluence, dienstbeschrijvingen",
      keywords: [
        "managed services",
        "sla",
        "contract",
        "bijlage",
        "handout",
        "confluence",
        "dienstbeschrijving",
        "dap",
        "incidentbeheer",
        "monitoring",
        "service desk",
      ],
      subfolders: {
        contract: ["contract", "juridisch", "beheerovereenkomst"],
        bijlagen: ["bijlage", "scope", "prijs", "facturatie"],
        handouts: ["handout"],
        "confluence-md": ["confluence", "domeinpagina"],
        dienstbeschrijvingen: ["dienstbeschrijving", "dienstverlening", "cloud dienst"],
        overig: ["documentstructuur", "template", "rca"],
      },
    },
    {
      prefix: "02-projecten/",
      purpose: "Klant- en projectdocumenten per projectmap",
      keywords: ["project", "klant", "sentinel", "pilot", "governance", "rca"],
      dynamicProjects: true,
    },
    {
      prefix: "03-persoonlijk-werk/",
      purpose: "Persoonlijk werk: gespreksverslagen, rol-teamlead",
      keywords: ["gespreksverslag", "bila", "teamlead", "evaluatie", "weekplan"],
      subfolders: {
        gespreksverslagen: ["gesprek", "meeting", "overleg", "bila"],
        "rol-teamlead": ["teamlead", "team lead", "leiding"],
      },
    },
    {
      prefix: "04-personen/",
      purpose: "Personenpagina's in werkcorpus",
      keywords: ["personen", "contactpersoon", "profiel"],
    },
    {
      prefix: "05-organisatie-en-functieprofielen/",
      purpose: "Organisatie en functieprofielen",
      keywords: ["organisatie", "functieprofiel", "ssd", "service manager"],
    },
    {
      prefix: "90-experiments-en-test/",
      purpose: "Experimenten en tests",
      keywords: ["experiment", "test", "prototype"],
    },
    {
      prefix: "99-prive/",
      purpose: "Privé-inhoud",
      keywords: ["privé", "prive", "recept", "volleybal", "gezin", "hobby"],
    },
    {
      prefix: "98-Archief/",
      purpose: "Gearchiveerde documenten",
      keywords: ["archief", "vervallen", "legacy", "superseded"],
    },
  ],
};

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, record) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function valuesAsStrings(value) {
  if (Array.isArray(value)) return value.flatMap(valuesAsStrings);
  if (value == null || value === "") return [];
  return [String(value)];
}

export function slugifyDocId(input) {
  const base = String(input || "")
    .replace(/\.md$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `doc-${randomUUID().slice(0, 8)}`;
}

export function isInboxPath(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/");
  return p.startsWith(INBOX_PREFIX) && p.length > INBOX_PREFIX.length;
}

/** Vaste inbox-bestanden die nooit automatisch verplaatst mogen worden. */
export function isOrganizerExemptPath(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/");
  if (p === `${INBOX_PREFIX}README.md`) return true;
  return false;
}

export function buildWorkDraftRelPath() {
  return `${INBOX_PREFIX}${DRAFT_BASENAME_PREFIX}${randomUUID()}.md`;
}

export function isWorkDraftPath(relPath) {
  const base = path.basename(String(relPath || "").replace(/\\/g, "/"));
  return base.startsWith(DRAFT_BASENAME_PREFIX) && base.toLowerCase().endsWith(".md");
}

/** Drafts blijven in inbox tot er genoeg inhoud is om te classificeren. */
export function isDraftContentReadyForOrganize(content) {
  const body = stripCorpusMetaFromMarkdown(content).trim();
  if (body.length < 24) return false;
  const words = body.split(/\s+/).filter(Boolean);
  return words.length >= 8;
}

export function createWorkDocumentDraftContent(initialBody = "") {
  const body = typeof initialBody === "string" ? initialBody.replace(/\r\n/g, "\n") : "";
  return ensureCorpusMetaComment(body, null, { status: "draft" });
}

export function writeWorkDocumentDraft({ markdownDir, content = "" }) {
  const relPath = buildWorkDraftRelPath();
  const safe = safeMarkdownPath(relPath);
  if (!safe) return { ok: false, error: "Kon geen draft-pad genereren." };
  const { content: prepared, docId } = createWorkDocumentDraftContent(content);
  const full = path.join(markdownDir, ...safe.split("/"));
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, prepared, "utf8");
  return { ok: true, path: safe, content: prepared, docId, charsWritten: prepared.length };
}

export function isRedirectDocument(content) {
  const { properties } = extractDocumentMetadata(content);
  return String(properties.type || "").toLowerCase() === "redirect";
}

export function resolveRedirectTarget(content) {
  const { properties } = extractDocumentMetadata(content);
  if (String(properties.type || "").toLowerCase() !== "redirect") return null;
  const target = String(properties.moved_to || properties.movedTo || "").replace(/\\/g, "/").trim();
  return safeMarkdownPath(target);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœ]+/)
    .filter((w) => w.length >= 3);
}

function loadRoutingRules(rulesPath) {
  const fromDisk = readJsonFile(rulesPath, null);
  if (fromDisk?.folders?.length) return fromDisk;
  return DEFAULT_ROUTING_RULES;
}

function listProjectFolders(manifest) {
  const projects = new Set();
  for (const entry of manifest?.entries || []) {
    const m = /^02-projecten\/([^/]+)\//.exec(String(entry.path || ""));
    if (m) projects.add(m[1]);
  }
  return [...projects].sort((a, b) => a.localeCompare(b));
}

function scoreFolderRule(rule, tokens, text) {
  let score = 0;
  for (const kw of rule.keywords || []) {
    const k = String(kw).toLowerCase();
    if (text.includes(k)) score += 3;
    if (tokens.some((t) => k.includes(t) || t.includes(k))) score += 1;
  }
  return score;
}

function pickSubfolder(rule, tokens, text) {
  const subs = rule.subfolders || {};
  let best = "";
  let bestScore = 0;
  for (const [folder, keywords] of Object.entries(subs)) {
    let s = 0;
    for (const kw of keywords) {
      const k = String(kw).toLowerCase();
      if (text.includes(k)) s += 2;
    }
    if (s > bestScore) {
      bestScore = s;
      best = folder;
    }
  }
  return bestScore > 0 ? `${best}/` : "";
}

function detectProjectFolder(tokens, text, manifest) {
  const projects = listProjectFolders(manifest);
  let best = "";
  let bestScore = 0;
  for (const project of projects) {
    const slug = project.toLowerCase().replace(/[_-]+/g, " ");
    const parts = slug.split(/\s+/).filter((p) => p.length >= 3);
    let s = 0;
    for (const part of parts) {
      if (text.includes(part)) s += 4;
      if (tokens.includes(part)) s += 2;
    }
    if (project.toLowerCase().replace(/_/g, "-") && text.includes(project.toLowerCase().replace(/_/g, " "))) {
      s += 3;
    }
    if (s > bestScore) {
      bestScore = s;
      best = project;
    }
  }
  return bestScore >= 4 ? best : "";
}

function suggestFilename(relPath, content) {
  const { properties, body } = extractDocumentMetadata(content);
  const title =
    valuesAsStrings(properties.title)[0] ||
    (() => {
      for (const line of body.split("\n")) {
        const m = /^#\s+(.+)$/.exec(line.trim());
        if (m) return m[1].trim();
      }
      return "";
    })();
  const base = path.basename(relPath, ".md");
  if (title && title !== base) {
    const safe = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._ -]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80);
    if (safe) return `${safe}.md`;
  }
  return path.basename(relPath);
}

export function heuristicClassifyDocument({ content, relPath, manifest, routingRules }) {
  const { properties, body } = extractDocumentMetadata(content);
  const title = valuesAsStrings(properties.title)[0] || path.basename(relPath, ".md");
  const text = `${title}\n${body}`.toLowerCase();
  const tokens = tokenize(text);
  const rules = routingRules?.folders || DEFAULT_ROUTING_RULES.folders;

  let bestRule = null;
  let bestScore = 0;
  for (const rule of rules) {
    const s = scoreFolderRule(rule, tokens, text);
    if (s > bestScore) {
      bestScore = s;
      bestRule = rule;
    }
  }

  const scored = scoreEntriesForQuestion(`${title}\n${body.slice(0, 1200)}`, manifest || { entries: [] });
  const topEntry = scored[0]?.entry;
  const topScore = scored[0]?.score || 0;
  if (topEntry?.path && topScore > 0) {
    const topPrefix = rules.find((r) => String(topEntry.path).startsWith(r.prefix));
    if (topPrefix) {
      const boost = Math.min(8, topScore * 2);
      if (!bestRule || bestRule.prefix !== topPrefix.prefix) {
        if (boost >= bestScore) {
          bestRule = topPrefix;
          bestScore = boost;
        }
      } else {
        bestScore += boost;
      }
    }
  }

  if (!bestRule) {
    return {
      targetPath: null,
      confidence: 0,
      rationale: "Geen passende map gevonden.",
      topics: [],
    };
  }

  let targetDir = bestRule.prefix;
  if (bestRule.prefix === "02-projecten/") {
    const project = detectProjectFolder(tokens, text, manifest);
    targetDir += project ? `${project}/` : "";
  } else {
    targetDir += pickSubfolder(bestRule, tokens, text);
  }

  const filename = suggestFilename(relPath, content);
  const targetPath = `${targetDir}${filename}`.replace(/\/+/g, "/");
  const maxScore = Math.max(12, bestScore);
  const confidence = Math.min(0.98, 0.35 + bestScore / maxScore);

  const topics = tokens.slice(0, 8);
  return {
    targetPath,
    confidence: Math.round(confidence * 1000) / 1000,
    rationale: `Heuristiek: ${bestRule.purpose}${topEntry ? `; vergelijkbaar met ${topEntry.path}` : ""}`,
    topics,
    rulePrefix: bestRule.prefix,
  };
}

function normalizeClassification(raw, fallback) {
  const targetPath = safeMarkdownPath(String(raw?.targetPath || raw?.target_path || "").trim());
  const confidence = Number(raw?.confidence);
  return {
    targetPath: targetPath || fallback?.targetPath || null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback?.confidence || 0,
    rationale: String(raw?.rationale || raw?.reason || fallback?.rationale || "").slice(0, 500),
    topics: Array.isArray(raw?.topics) ? raw.topics.map((t) => String(t).slice(0, 40)).slice(0, 10) : fallback?.topics || [],
    classifier: raw?.classifier || "llm",
  };
}

function uniquePath(markdownDir, relPath) {
  const safe = safeMarkdownPath(relPath);
  if (!safe) return null;
  let candidate = safe;
  let n = 1;
  while (fs.existsSync(path.join(markdownDir, ...candidate.split("/")))) {
    const stem = path.basename(safe, ".md");
    const dir = path.dirname(safe);
    candidate = `${dir}/${stem}_${n}.md`.replace(/^\.\//, "");
    n += 1;
  }
  return candidate;
}

export function moveCorpusDocument({
  markdownDir,
  reviewsDir,
  fromPath,
  toPath,
  content,
  docId,
  createStub = false,
  isProtected = () => false,
}) {
  const from = safeMarkdownPath(fromPath);
  let to = safeMarkdownPath(toPath);
  if (!from || !to) return { ok: false, error: "Ongeldig pad." };
  if (from === to) return { ok: true, fromPath: from, toPath: to, skipped: true, reason: "same-path" };
  if (isProtected(from) || isProtected(to)) {
    return { ok: false, error: `Beschermd document: verplaatsen geweigerd (${from} → ${to}).` };
  }

  const fromFull = path.join(markdownDir, ...from.split("/"));
  if (!fs.existsSync(fromFull)) return { ok: false, error: `Bronbestand niet gevonden: ${from}` };

  to = uniquePath(markdownDir, to) || to;
  const toFull = path.join(markdownDir, ...to.split("/"));
  ensureDir(path.dirname(toFull));

  const rawContent = content ?? fs.readFileSync(fromFull, "utf8");
  const { properties } = extractDocumentMetadata(rawContent);
  if (String(properties.type || "").toLowerCase() === "redirect") {
    return { ok: false, error: "Redirect-stubs kunnen niet opnieuw worden verplaatst." };
  }

  const aliases = new Set(valuesAsStrings(properties.aliases));
  aliases.add(from);
  const ensured = ensureCorpusMetaComment(rawContent, docId || properties.doc_id, { aliases: [...aliases] });
  fs.writeFileSync(toFull, ensured.content, "utf8");

  if (reviewsDir) {
    const fromJson = path.join(reviewsDir, `${from}.json`);
    const toJson = path.join(reviewsDir, `${to}.json`);
    if (fs.existsSync(fromJson)) {
      ensureDir(path.dirname(toJson));
      fs.renameSync(fromJson, toJson);
    }
    const fromBak = path.join(reviewsDir, ".versions", `${from}.bak.md`);
    const toBak = path.join(reviewsDir, ".versions", `${to}.bak.md`);
    if (fs.existsSync(fromBak)) {
      ensureDir(path.dirname(toBak));
      fs.renameSync(fromBak, toBak);
    }
  }

  if (from !== to) {
    if (createStub) {
      return { ok: false, error: "Redirect-stubs worden niet meer aangemaakt; bronbestand wordt verwijderd." };
    }
    fs.unlinkSync(fromFull);
  }

  return {
    ok: true,
    fromPath: from,
    toPath: to,
    docId: ensured.docId,
    stubCreated: false,
    sourceRemoved: from !== to,
  };
}

export function createCorpusOrganizer(deps) {
  const markdownDir = path.resolve(deps.markdownDir);
  const organizerRoot = path.join(markdownDir, ORGANIZER_DIRNAME);
  const statePath = deps.statePath || path.join(organizerRoot, "state.json");
  const eventsPath = deps.eventsPath || path.join(organizerRoot, "events.jsonl");
  const rulesPath = deps.rulesPath || path.join(organizerRoot, "routing-rules.json");
  const reviewsDir = deps.reviewsDir || null;
  const isProtected = deps.isProtected || (() => false);
  const classifyDocument = deps.classifyDocument || null;
  const onIndexRebuild = deps.onIndexRebuild || (async () => {});
  const log = deps.log || (() => {});

  const defaultConfig = {
    enabled: true,
    classifyWithLlm: true,
    debounceMs: 4000,
    scanIntervalMinutes: 30,
    autoMoveConfidence: DEFAULT_AUTO_MOVE_CONFIDENCE,
    privateConfidence: DEFAULT_PRIVATE_CONFIDENCE,
  };

  function loadState() {
    return readJsonFile(statePath, {
      version: 1,
      config: { ...defaultConfig },
      pending: [],
      recentMoves: [],
      lastScanAt: null,
    });
  }

  function saveState(state) {
    writeJsonAtomic(statePath, state);
  }

  function ensureRoutingRules() {
    ensureDir(organizerRoot);
    if (!fs.existsSync(rulesPath)) {
      writeJsonAtomic(rulesPath, DEFAULT_ROUTING_RULES);
    }
  }

  function getConfig() {
    const state = loadState();
    return { ...defaultConfig, ...(state.config || {}) };
  }

  function updateConfig(patch) {
    const state = loadState();
    state.config = { ...defaultConfig, ...(state.config || {}), ...(patch || {}) };
    saveState(state);
    return state.config;
  }

  function getStatus() {
    const state = loadState();
    const config = getConfig();
    return {
      ok: true,
      enabled: config.enabled !== false,
      config,
      pendingCount: (state.pending || []).length,
      lastScanAt: state.lastScanAt || null,
      organizerRoot: `${ORGANIZER_DIRNAME}/`,
      inboxPrefix: INBOX_PREFIX,
    };
  }

  function listActivity(opts = {}) {
    const days = Math.max(1, Math.min(90, Number(opts.days || 7) || 7));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    if (!fs.existsSync(eventsPath)) return [];
    const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const row = JSON.parse(lines[i]);
        const ts = Date.parse(row.ts || "");
        if (Number.isFinite(ts) && ts >= since) out.push(row);
        if (out.length >= 200) break;
      } catch {
        /* skip */
      }
    }
    return out;
  }

  function recordEvent(event) {
    appendJsonl(eventsPath, { ts: nowIso(), ...event });
  }

  function canMoveNow(state) {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = (state.recentMoves || []).filter((t) => t >= hourAgo);
    state.recentMoves = recent;
    return recent.length < MAX_MOVES_PER_HOUR;
  }

  async function classify({ content, relPath, manifest, runId }) {
    ensureRoutingRules();
    const routingRules = loadRoutingRules(rulesPath);
    const heuristic = heuristicClassifyDocument({ content, relPath, manifest, routingRules });
    const config = getConfig();
    if (!config.classifyWithLlm || !classifyDocument) {
      return { ...heuristic, classifier: "heuristic" };
    }
    try {
      const llm = await classifyDocument({
        content,
        relPath,
        manifest,
        routingRules,
        heuristic,
        runId,
      });
      return normalizeClassification(llm, heuristic);
    } catch (e) {
      log(runId, "corpus_organizer_classify_fallback", { error: String(e?.message || e), path: relPath });
      return { ...heuristic, classifier: "heuristic-fallback" };
    }
  }

  async function organizeFile(relPath, opts = {}) {
    const runId = opts.runId || randomUUID();
    const config = getConfig();
    if (config.enabled === false) return { ok: true, status: "disabled" };

    const safe = safeMarkdownPath(relPath);
    if (!safe || !isInboxPath(safe)) {
      return { ok: true, status: "skipped", reason: "not-inbox" };
    }
    if (isOrganizerExemptPath(safe)) {
      return { ok: true, status: "skipped", reason: "exempt" };
    }

    const full = path.join(markdownDir, ...safe.split("/"));
    if (!fs.existsSync(full)) return { ok: false, error: "Bestand niet gevonden." };

    const content = fs.readFileSync(full, "utf8");
    if (isRedirectDocument(content)) {
      return { ok: true, status: "skipped", reason: "redirect-stub" };
    }
    if (isWorkDraftPath(safe) && !isDraftContentReadyForOrganize(content)) {
      recordEvent({ action: "skip", path: safe, reason: "draft-not-ready" });
      return { ok: true, status: "skipped", reason: "draft-not-ready" };
    }

    const manifest = opts.manifest || null;
    const classification = await classify({ content, relPath: safe, manifest, runId });
    if (!classification.targetPath) {
      recordEvent({ action: "skip", path: safe, reason: "no-target", classification });
      return { ok: true, status: "skipped", reason: "no-target", classification };
    }

    const threshold =
      classification.targetPath.startsWith("99-prive/") ? config.privateConfidence : config.autoMoveConfidence;
    if (classification.confidence < threshold) {
      recordEvent({ action: "skip", path: safe, reason: "low-confidence", classification, threshold });
      return { ok: true, status: "skipped", reason: "low-confidence", classification, threshold };
    }

    if (classification.targetPath === safe) {
      recordEvent({ action: "skip", path: safe, reason: "same-path", classification });
      return { ok: true, status: "skipped", reason: "same-path", classification };
    }

    const state = loadState();
    if (!canMoveNow(state)) {
      state.pending = [...new Set([...(state.pending || []), safe])];
      saveState(state);
      recordEvent({ action: "defer", path: safe, reason: "rate-limit", classification });
      return { ok: true, status: "deferred", reason: "rate-limit", classification };
    }

    const moved = moveCorpusDocument({
      markdownDir,
      reviewsDir,
      fromPath: safe,
      toPath: classification.targetPath,
      content,
      isProtected,
    });
    if (!moved.ok) {
      recordEvent({ action: "error", path: safe, error: moved.error, classification });
      return { ok: false, error: moved.error, classification };
    }

    state.recentMoves = [...(state.recentMoves || []), Date.now()];
    state.pending = (state.pending || []).filter((p) => p !== safe);
    saveState(state);

    recordEvent({
      action: "move",
      docId: moved.docId,
      from: moved.fromPath,
      to: moved.toPath,
      confidence: classification.confidence,
      rationale: classification.rationale,
      classifier: classification.classifier,
    });

    void onIndexRebuild("corpus-organizer-move");
    log(runId, "corpus_organizer_moved", { from: moved.fromPath, to: moved.toPath, docId: moved.docId });
    return { ok: true, status: "moved", move: moved, classification };
  }

  async function processPending(runId) {
    const state = loadState();
    const pending = [...(state.pending || [])];
    const results = [];
    for (const relPath of pending) {
      results.push(await organizeFile(relPath, { runId, manifest: optsManifest() }));
    }
    return results;
  }

  function optsManifest() {
    return deps.readManifest ? deps.readManifest() : null;
  }

  async function scanInbox(runId = randomUUID()) {
    ensureRoutingRules();
    ensureDir(path.join(markdownDir, INBOX_PREFIX.replace(/\/$/, "")));
    const inboxDir = path.join(markdownDir, ...INBOX_PREFIX.replace(/\/$/, "").split("/"));
    if (!fs.existsSync(inboxDir)) return { ok: true, processed: [] };

    const manifest = optsManifest();
    const files = fs
      .readdirSync(inboxDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))
      .map((d) => `${INBOX_PREFIX}${d.name}`);

    const processed = [];
    for (const rel of files) {
      processed.push(await organizeFile(rel, { runId, manifest }));
    }
    await processPending(runId);

    const state = loadState();
    state.lastScanAt = nowIso();
    saveState(state);
    return { ok: true, processed };
  }

  let debounceTimer = null;
  let schedulerTimer = null;

  function scheduleOrganizeAfterSave(relPath) {
    const config = getConfig();
    if (config.enabled === false) return;
    if (!isInboxPath(relPath)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void scanInbox("save-trigger").catch((e) => {
        log("corpus-organizer", "scan_error", { error: String(e?.message || e) });
      });
    }, Math.max(1000, Number(config.debounceMs || 4000)));
  }

  /** Direct classificeren/verplaatsen na save (geen debounce) wanneer draft klaar is. */
  async function organizeInboxFileNow(relPath, opts = {}) {
    const config = getConfig();
    if (config.enabled === false) return { ok: true, status: "disabled" };
    const safe = safeMarkdownPath(relPath);
    if (!safe || !isInboxPath(safe)) return { ok: true, status: "skipped", reason: "not-inbox" };
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return organizeFile(safe, { ...opts, manifest: opts.manifest || optsManifest() });
  }

  function startScheduler() {
    const config = getConfig();
    if (config.enabled === false) return;
    ensureRoutingRules();
    ensureDir(path.join(markdownDir, INBOX_PREFIX.replace(/\/$/, "")));
    if (schedulerTimer) clearInterval(schedulerTimer);
    const minutes = Math.max(5, Number(config.scanIntervalMinutes || 30) || 30);
    schedulerTimer = setInterval(() => {
      void scanInbox("scheduler").catch(() => {});
    }, minutes * 60 * 1000);
  }

  function stopScheduler() {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  return {
    getConfig,
    updateConfig,
    getStatus,
    listActivity,
    organizeFile,
    scanInbox,
    scheduleOrganizeAfterSave,
    organizeInboxFileNow,
    startScheduler,
    stopScheduler,
    ensureRoutingRules,
    heuristicClassifyDocument: (input) => {
      ensureRoutingRules();
      return heuristicClassifyDocument({ ...input, routingRules: loadRoutingRules(rulesPath) });
    },
  };
}
