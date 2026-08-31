import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const KANBAN_STATUSES = ["inbox", "today", "this_week", "waiting", "scheduled", "doing", "done", "ignored"];
export const KANBAN_PRIORITIES = ["laag", "middel", "hoog", "kritiek"];
export const KANBAN_TERMINAL_STATUSES = ["done", "ignored"];
export const KANBAN_TERMINAL_RETENTION_DAYS = 7;
export const KANBAN_TERMINAL_RETENTION_MS = KANBAN_TERMINAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const STATUS_LABELS = {
  inbox: "Inbox",
  today: "Vandaag",
  this_week: "Deze week",
  waiting: "Wachten op",
  scheduled: "Gepland",
  doing: "In uitvoering",
  done: "Afgehandeld",
  ignored: "Genegeerd",
};
const RANK_STEP = 1000;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function truncate(value, max = 1000) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function safeDateMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function parseSinceMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const relative = /^(\d+)\s*(d|day|days|w|week|weeks)$/i.exec(raw);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const days = unit.startsWith("w") ? amount * 7 : amount;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }
  return safeDateMs(raw);
}

function normalizeMultiline(value, max = 4000) {
  const s = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

function normalizeStatus(value, fallback = "inbox") {
  return KANBAN_STATUSES.includes(value) ? value : fallback;
}

function normalizePriority(value, fallback = "middel") {
  return KANBAN_PRIORITIES.includes(value) ? value : fallback;
}

function normalizeStringArray(value, maxItems = 20, maxLen = 120) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => truncate(item, maxLen))
        .filter(Boolean),
    ),
  ].slice(0, maxItems);
}

function normalizeSourceRef(raw = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  const type = truncate(o.type || "manual", 40) || "manual";
  const label = truncate(o.label || o.subject || o.path || o.entryId || "Bron", 300) || "Bron";
  return {
    id: truncate(o.id || `${type}:${o.entryId || o.path || label}`, 500),
    type,
    label,
    entryId: truncate(o.entryId, 4000),
    storeId: truncate(o.storeId, 4000),
    notificationId: truncate(o.notificationId, 120),
    path: truncate(o.path, 500),
    timestamp: truncate(o.timestamp, 80),
    url: truncate(o.url, 1000),
  };
}

function dedupeSourceRefs(sourceRefs) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(sourceRefs) ? sourceRefs : []) {
    const ref = normalizeSourceRef(raw);
    const key = ref.id || `${ref.type}|${ref.entryId}|${ref.path}|${ref.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out.slice(0, 50);
}

function dedupeStrings(values, maxItems = 40, maxLen = 120) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const value = truncate(raw, maxLen);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, maxItems);
}

function normalizeHistoryEntry(raw = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    ts: truncate(o.ts || nowIso(), 80),
    actor: o.actor === "joost" ? "joost" : "agent",
    event: truncate(o.event || "updated", 80),
    note: truncate(o.note || "", 1000),
  };
}

function normalizeRank(value, fallback = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isTerminalKanbanStatus(status) {
  return status === "done" || status === "ignored";
}

function resolveClosedAt(status, previousStatus, currentClosedAt, updatedAt, ts = nowIso()) {
  if (!isTerminalKanbanStatus(status)) return "";
  if (previousStatus !== status || !currentClosedAt) return ts;
  return currentClosedAt;
}

function normalizeTask(raw = {}, options = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  const createdAt = truncate(o.createdAt || nowIso(), 80);
  const updatedAt = truncate(o.updatedAt || createdAt, 80);
  const status = normalizeStatus(o.status);
  let closedAt = truncate(o.closedAt || "", 80);
  if (isTerminalKanbanStatus(status)) {
    if (!closedAt) closedAt = updatedAt;
  } else {
    closedAt = "";
  }
  const resolveProject =
    typeof options.resolveProject === "function" ? options.resolveProject : (value) => String(value || "").replace(/\s+/g, " ").trim();
  const projectHints = {
    title: o.title || "",
    summary: o.summary || "",
    subject: o.subject || "",
    explicit: options.projectExplicit === true,
  };
  const resolvedProject = options.projectExplicit
    ? truncate(resolveProject(o.project ?? "", projectHints), 160)
    : truncate(resolveProject(o.project || "", projectHints), 160) ||
      truncate(resolveProject("", projectHints), 160);
  return {
    id: truncate(o.id || randomUUID(), 120),
    title: truncate(o.title || "Nieuwe taak", 240) || "Nieuwe taak",
    status,
    priority: normalizePriority(o.priority),
    project: resolvedProject,
    people: normalizeStringArray(o.people, 30, 120),
    dueDate: truncate(o.dueDate || "", 80),
    nextAction: truncate(o.nextAction || o.action || "", 600),
    summary: normalizeMultiline(o.summary || "", 3000),
    sourceRefs: dedupeSourceRefs(o.sourceRefs),
    history: Array.isArray(o.history) ? o.history.map(normalizeHistoryEntry).slice(-100) : [],
    rank: normalizeRank(o.rank),
    createdAt,
    updatedAt,
    closedAt,
  };
}

function defaultState() {
  return {
    version: 1,
    generatedAt: nowIso(),
    tasks: [],
  };
}

function normalizeState(raw, options = {}) {
  const state = { ...defaultState(), ...(raw && typeof raw === "object" ? raw : {}) };
  state.version = 1;
  state.generatedAt = truncate(state.generatedAt || nowIso(), 80);
  state.tasks = Array.isArray(state.tasks) ? state.tasks.map((task) => normalizeTask(task, options)) : [];
  const byId = new Map();
  for (const task of state.tasks) byId.set(task.id, task);
  state.tasks = [...byId.values()];
  const byStatus = new Map();
  for (const task of state.tasks) {
    if (!byStatus.has(task.status)) byStatus.set(task.status, []);
    byStatus.get(task.status).push(task);
  }
  for (const tasks of byStatus.values()) {
    tasks
      .sort((a, b) => {
        const ar = normalizeRank(a.rank);
        const br = normalizeRank(b.rank);
        if (ar !== br) return ar - br;
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      })
      .forEach((task, idx) => {
        if (!Number.isFinite(task.rank) || task.rank === Number.MAX_SAFE_INTEGER) task.rank = (idx + 1) * RANK_STEP;
      });
  }
  state.tasks.sort((a, b) => {
    const statusDelta = KANBAN_STATUSES.indexOf(a.status) - KANBAN_STATUSES.indexOf(b.status);
    if (statusDelta !== 0) return statusDelta;
    const rankDelta = normalizeRank(a.rank) - normalizeRank(b.rank);
    if (rankDelta !== 0) return rankDelta;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return state;
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
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

function haystackForTask(task) {
  return [
    task.title,
    task.project,
    task.nextAction,
    task.summary,
    ...(task.people || []),
    ...(task.sourceRefs || []).flatMap((ref) => [ref.label, ref.type, ref.path, ref.entryId, ref.notificationId]),
  ]
    .join(" ")
    .toLowerCase();
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 40);
}

function scoreTask(task, input = {}) {
  let score = 0;
  const hay = haystackForTask(task);
  const query = String(input.query || "").trim().toLowerCase();
  if (query) {
    for (const token of tokenize(query)) {
      if (hay.includes(token)) score += 5;
    }
  }
  const project = String(input.project || "").trim().toLowerCase();
  if (project && task.project.toLowerCase().includes(project)) score += 20;
  for (const person of normalizeStringArray(input.people, 20, 120)) {
    if (task.people.some((p) => p.toLowerCase().includes(person.toLowerCase()))) score += 12;
  }
  const sourceRefs = Array.isArray(input.sourceRefs) ? input.sourceRefs.map(normalizeSourceRef) : [];
  for (const ref of sourceRefs) {
    if (!ref.entryId && !ref.notificationId && !ref.path && !ref.label) continue;
    if (
      task.sourceRefs.some(
        (existing) =>
          (ref.entryId && existing.entryId === ref.entryId) ||
          (ref.notificationId && existing.notificationId === ref.notificationId) ||
          (ref.path && existing.path === ref.path) ||
          (ref.label && existing.label === ref.label),
      )
    ) {
      score += 50;
    }
  }
  return score;
}

function scoreTasks(tasks, input = {}) {
  return tasks
    .map((task) => ({ task, score: scoreTask(task, input) }))
    .filter(({ score }) => score > 0 || !input.query)
    .sort((a, b) => b.score - a.score || String(b.task.updatedAt).localeCompare(String(a.task.updatedAt)));
}

function eventRecord(type, task, patch = {}, actor = "agent", note = "") {
  return {
    version: 1,
    id: randomUUID(),
    ts: nowIso(),
    type,
    actor: actor === "joost" ? "joost" : "agent",
    taskId: task?.id || "",
    status: task?.status || "",
    title: task?.title || "",
    note: truncate(note, 1000),
    patch,
  };
}

function readRecentEvents(eventsPath, filters = {}) {
  if (!fs.existsSync(eventsPath)) return [];
  const sinceMs = parseSinceMs(filters.since || filters.fromDate || "");
  const limit = Math.min(200, Math.max(0, Number(filters.eventLimit || 50) || 50));
  if (limit <= 0) return [];
  const queryTokens = tokenize(filters.query || "");
  const lines = fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-1000);
  const events = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const tsMs = safeDateMs(event.ts);
      if (sinceMs && tsMs && tsMs < sinceMs) continue;
      const hay = `${event.type || ""} ${event.title || ""} ${event.note || ""} ${event.status || ""}`.toLowerCase();
      if (queryTokens.length && !queryTokens.some((token) => hay.includes(token))) continue;
      events.push(event);
    } catch {
      // Negeer corrupte JSONL-regels; Kanban taken blijven leidend.
    }
  }
  return events.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || ""))).slice(0, limit);
}

export function purgeExpiredTerminalTasks(state, options = {}) {
  const retentionMs =
    Number.isFinite(Number(options.retentionMs)) && Number(options.retentionMs) > 0
      ? Number(options.retentionMs)
      : KANBAN_TERMINAL_RETENTION_MS;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const removed = [];
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  state.tasks = tasks.filter((task) => {
    if (!isTerminalKanbanStatus(task.status)) return true;
    const closedMs = safeDateMs(task.closedAt || task.updatedAt || task.createdAt);
    if (!closedMs || nowMs - closedMs < retentionMs) return true;
    removed.push(task);
    return false;
  });
  return { removed, retentionMs, nowMs };
}

function rerankStatusTasks(tasks, status) {
  tasks
    .filter((task) => task.status === status)
    .sort((a, b) => normalizeRank(a.rank) - normalizeRank(b.rank) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .forEach((task, idx) => {
      task.rank = (idx + 1) * RANK_STEP;
    });
}

export function createKanbanStore(options = {}) {
  const rootDir = options.rootDir || path.join(process.cwd(), "Files", ".kanban");
  const tasksPath = options.tasksPath || path.join(rootDir, "tasks.json");
  const eventsPath = options.eventsPath || path.join(rootDir, "events.jsonl");
  const terminalRetentionMs =
    Number.isFinite(Number(options.terminalRetentionMs)) && Number(options.terminalRetentionMs) > 0
      ? Number(options.terminalRetentionMs)
      : KANBAN_TERMINAL_RETENTION_MS;
  const normalizeOptions = {
    resolveProject:
      typeof options.resolveProject === "function"
        ? options.resolveProject
        : (value) => String(value || "").replace(/\s+/g, " ").trim(),
  };

  function loadState() {
    const raw = readJsonFile(tasksPath, defaultState());
    const projectsBefore = JSON.stringify((raw.tasks || []).map((task) => task?.project || ""));
    const state = normalizeState(raw, normalizeOptions);
    const projectsAfter = JSON.stringify(state.tasks.map((task) => task.project || ""));
    const { removed } = purgeExpiredTerminalTasks(state, { retentionMs: terminalRetentionMs });
    if (removed.length > 0) {
      saveState(state, { skipPurge: true });
      for (const task of removed) {
        appendEvent(
          "task_purged",
          task,
          { status: task.status, closedAt: task.closedAt || task.updatedAt || task.createdAt },
          "agent",
          `Automatisch verwijderd na ${KANBAN_TERMINAL_RETENTION_DAYS} dagen in ${STATUS_LABELS[task.status] || task.status}.`,
        );
      }
      if (typeof options.onTasksPurged === "function") {
        try {
          options.onTasksPurged(removed);
        } catch {
          // Comment-sidecars zijn best-effort; taken zijn al verwijderd.
        }
      }
    } else if (projectsBefore !== projectsAfter) {
      saveState(state, { skipPurge: true });
    }
    return state;
  }

  function saveState(state, saveOptions = {}) {
    const normalized = normalizeState({ ...state, generatedAt: nowIso() }, normalizeOptions);
    if (!saveOptions.skipPurge) {
      purgeExpiredTerminalTasks(normalized, { retentionMs: terminalRetentionMs });
    }
    writeJsonAtomic(tasksPath, normalized);
    if (typeof options.onStateSaved === "function") {
      try {
        options.onStateSaved(normalized);
      } catch {
        // Cache-invalidatie is best-effort.
      }
    }
    return normalized;
  }

  function appendEvent(type, task, patch = {}, actor = "agent", note = "") {
    const event = eventRecord(type, task, patch, actor, note);
    appendJsonl(eventsPath, event);
    return event;
  }

  function listTasks(filters = {}) {
    const state = loadState();
    let tasks = state.tasks.slice();
    const sinceMs = parseSinceMs(filters.since || filters.fromDate || "");
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      const valid = new Set(statuses.map((s) => normalizeStatus(s, "")).filter(Boolean));
      if (valid.size > 0) tasks = tasks.filter((task) => valid.has(task.status));
    }
    if (filters.project) {
      const q = String(filters.project).toLowerCase();
      tasks = tasks.filter((task) => task.project.toLowerCase().includes(q));
    }
    if (filters.person) {
      const q = String(filters.person).toLowerCase();
      tasks = tasks.filter((task) => task.people.some((p) => p.toLowerCase().includes(q)));
    }
    if (sinceMs) {
      tasks = tasks.filter((task) => safeDateMs(task.updatedAt || task.createdAt) >= sinceMs);
    }
    if (filters.query) {
      tasks = scoreTasks(tasks, filters).map(({ task, score }) => ({ ...task, matchScore: score }));
    }
    const limit = Math.min(500, Math.max(1, Number(filters.limit || 200) || 200));
    return {
      ok: true,
      tasks: tasks.slice(0, limit),
      total: tasks.length,
      recentEvents: readRecentEvents(eventsPath, filters),
      tasksPath,
      eventsPath,
      searchHint: "Gebruik bij rapportages eerst query='', geen statusfilter, en eventueel since='7d' of since='14d'. Verfijn pas daarna.",
    };
  }

  function board(filters = {}) {
    const tasks = listTasks({ ...filters, limit: filters.limit || 500 }).tasks;
    const columns = KANBAN_STATUSES.map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      tasks: tasks.filter((task) => task.status === status),
    }));
    return { ok: true, columns, tasks, total: tasks.length, tasksPath, eventsPath };
  }

  function getTask(id) {
    const task = loadState().tasks.find((item) => item.id === id);
    return task ? { ok: true, task } : { ok: false, error: "Taak niet gevonden." };
  }

  function createTask(input = {}, meta = {}) {
    const state = loadState();
    const ts = nowIso();
    const status = normalizeStatus(input.status, "inbox");
    const sameStatus = state.tasks.filter((task) => task.status === status);
    const topRank = sameStatus.length ? Math.min(...sameStatus.map((task) => normalizeRank(task.rank))) : RANK_STEP;
    const task = normalizeTask(
      {
        ...input,
        id: input.id || randomUUID(),
        status,
        priority: normalizePriority(input.priority, "middel"),
        rank: Number.isFinite(Number(input.rank)) ? Number(input.rank) : topRank - RANK_STEP,
        createdAt: ts,
        updatedAt: ts,
        closedAt: isTerminalKanbanStatus(status) ? ts : "",
        history: [
          normalizeHistoryEntry({
            ts,
            actor: meta.actor || input.actor || "agent",
            event: "created",
            note: meta.note || input.rationale || "Taak aangemaakt.",
          }),
        ],
      },
      {
        ...normalizeOptions,
        projectExplicit: Object.prototype.hasOwnProperty.call(input, "project"),
      },
    );
    state.tasks.unshift(task);
    saveState(state);
    appendEvent("task_created", task, input, meta.actor || "agent", meta.note || input.rationale || "");
    return { ok: true, task };
  }

  function updateTask(id, patch = {}, meta = {}) {
    const state = loadState();
    const idx = state.tasks.findIndex((task) => task.id === id);
    if (idx < 0) return { ok: false, error: "Taak niet gevonden." };
    const current = state.tasks[idx];
    const nextStatus = patch.status != null ? normalizeStatus(patch.status, current.status) : current.status;
    if (patch.status != null && nextStatus !== current.status) {
      const moveResult = moveTask(id, nextStatus, {
        actor: meta.actor || patch.actor || "agent",
        note:
          meta.note ||
          patch.rationale ||
          `Verplaatst naar ${STATUS_LABELS[nextStatus] || nextStatus}.`,
        targetIndex: patch.targetIndex,
      });
      if (!moveResult.ok) return moveResult;
      const rest = { ...patch };
      delete rest.status;
      delete rest.actor;
      delete rest.rationale;
      delete rest.targetIndex;
      if (!Object.keys(rest).length) return moveResult;
      return updateTask(id, rest, meta);
    }
    const statusChanged = nextStatus !== current.status;
    const ts = nowIso();
    const sameStatus = state.tasks.filter((task) => task.status === nextStatus && task.id !== current.id);
    const bottomRank = sameStatus.length ? Math.max(...sameStatus.map((task) => normalizeRank(task.rank))) : 0;
    const next = normalizeTask(
      {
        ...current,
        ...patch,
        status: nextStatus,
        priority: patch.priority != null ? normalizePriority(patch.priority, current.priority) : current.priority,
        people: patch.people != null ? patch.people : current.people,
        sourceRefs: patch.sourceRefs != null ? [...current.sourceRefs, ...patch.sourceRefs] : current.sourceRefs,
        rank: patch.rank != null ? patch.rank : statusChanged ? bottomRank + RANK_STEP : current.rank,
        closedAt: resolveClosedAt(nextStatus, current.status, current.closedAt, current.updatedAt, ts),
        history: [
          ...current.history,
          normalizeHistoryEntry({
            ts,
            actor: meta.actor || patch.actor || "agent",
            event: meta.event || "updated",
            note: meta.note || patch.rationale || "Taak bijgewerkt.",
          }),
        ],
        updatedAt: ts,
      },
      {
        ...normalizeOptions,
        projectExplicit: Object.prototype.hasOwnProperty.call(patch, "project"),
      },
    );
    state.tasks[idx] = next;
    saveState(state);
    appendEvent(meta.event || "task_updated", next, patch, meta.actor || "agent", meta.note || patch.rationale || "");
    return { ok: true, task: next };
  }

  function moveTask(id, status, meta = {}) {
    const state = loadState();
    const idx = state.tasks.findIndex((task) => task.id === id);
    if (idx < 0) return { ok: false, error: "Taak niet gevonden." };
    const current = state.tasks[idx];
    const fromStatus = current.status;
    const targetStatus = normalizeStatus(status, current.status);
    const targetTasks = state.tasks
      .filter((task) => task.status === targetStatus && task.id !== id)
      .sort((a, b) => normalizeRank(a.rank) - normalizeRank(b.rank) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const targetIndexRaw = Number(meta.targetIndex);
    const targetIndex = Number.isFinite(targetIndexRaw)
      ? Math.min(targetTasks.length, Math.max(0, Math.floor(targetIndexRaw)))
      : targetTasks.length;
    const ts = nowIso();
    current.status = targetStatus;
    current.updatedAt = ts;
    current.closedAt = resolveClosedAt(targetStatus, fromStatus, current.closedAt, current.updatedAt, ts);
    current.history = [
      ...current.history,
      normalizeHistoryEntry({
        ts,
        actor: meta.actor || "agent",
        event: "task_moved",
        note: meta.note || `Verplaatst naar ${STATUS_LABELS[targetStatus] || targetStatus}.`,
      }),
    ].slice(-100);
    targetTasks.splice(targetIndex, 0, current);
    targetTasks.forEach((task, orderIdx) => {
      task.rank = (orderIdx + 1) * RANK_STEP;
    });
    if (fromStatus !== targetStatus) rerankStatusTasks(state.tasks, fromStatus);
    saveState(state);
    appendEvent(
      "task_moved",
      current,
      { status: targetStatus, fromStatus, targetIndex },
      meta.actor || "agent",
      meta.note || `Verplaatst naar ${STATUS_LABELS[targetStatus] || targetStatus}.`,
    );
    return { ok: true, task: normalizeTask(current, normalizeOptions) };
  }

  function linkSource(id, sourceRef, meta = {}) {
    return updateTask(id, { sourceRefs: [sourceRef] }, { ...meta, event: "source_linked", note: meta.note || "Bron gekoppeld." });
  }

  function mergeTasks(primaryId, secondaryId, input = {}, meta = {}) {
    const state = loadState();
    const primaryIdx = state.tasks.findIndex((task) => task.id === primaryId);
    const secondaryIdx = state.tasks.findIndex((task) => task.id === secondaryId);
    if (!primaryId || !secondaryId || primaryId === secondaryId) return { ok: false, error: "Geef twee verschillende Kanban-taak-id's op." };
    if (primaryIdx < 0 || secondaryIdx < 0) return { ok: false, error: "Een of beide Kanban-taken zijn niet gevonden." };

    const primary = state.tasks[primaryIdx];
    const secondary = state.tasks[secondaryIdx];
    const ts = nowIso();
    const actor = meta.actor || input.actor || "agent";
    const rationale = meta.note || input.rationale || "Twee Kanban-taken gefuseerd door Nexus.";
    const nextStatus = input.status != null ? normalizeStatus(input.status, primary.status) : primary.status;
    const statusChanged = nextStatus !== primary.status;
    const sameStatus = state.tasks.filter((task) => task.status === nextStatus && task.id !== primary.id && task.id !== secondary.id);
    const bottomRank = sameStatus.length ? Math.max(...sameStatus.map((task) => normalizeRank(task.rank))) : 0;
    const sourceRefs = dedupeSourceRefs([
      ...primary.sourceRefs,
      ...secondary.sourceRefs,
      { type: "kanban", label: `Gefuseerde taak: ${primary.title}`, path: primary.id, id: `kanban:${primary.id}` },
      { type: "kanban", label: `Gefuseerde taak: ${secondary.title}`, path: secondary.id, id: `kanban:${secondary.id}` },
      ...(Array.isArray(input.sourceRefs) ? input.sourceRefs : []),
    ]);
    const merged = normalizeTask(
      {
        ...primary,
        title: input.title || primary.title,
        status: nextStatus,
        priority: input.priority != null ? normalizePriority(input.priority, primary.priority) : primary.priority,
        project: input.project != null ? input.project : primary.project || secondary.project,
        people: input.people != null ? input.people : dedupeStrings([...primary.people, ...secondary.people]),
        dueDate: input.dueDate != null ? input.dueDate : primary.dueDate || secondary.dueDate,
        nextAction: input.nextAction != null ? input.nextAction : primary.nextAction || secondary.nextAction,
        summary:
          input.summary != null
            ? input.summary
            : [primary.summary, secondary.summary].filter(Boolean).join("\n\n---\n\n"),
        sourceRefs,
        rank: input.rank != null ? input.rank : statusChanged ? bottomRank + RANK_STEP : primary.rank,
        history: [
          ...primary.history,
          ...secondary.history.map((entry) => ({
            ...entry,
            event: `merged_source:${entry.event || "history"}`,
            note: `[${secondary.title}] ${entry.note || ""}`.trim(),
          })),
          normalizeHistoryEntry({
            ts,
            actor,
            event: "tasks_merged",
            note: `${rationale} Bron: ${secondary.title} (${secondary.id}).`,
          }),
        ].slice(-100),
        updatedAt: ts,
      },
      {
        ...normalizeOptions,
        projectExplicit: input.project != null,
      },
    );

    const archivedSecondary = normalizeTask(
      {
        ...secondary,
        status: "ignored",
        closedAt: ts,
        sourceRefs: dedupeSourceRefs([
          ...secondary.sourceRefs,
          { type: "kanban", label: `Gefuseerd in: ${merged.title}`, path: merged.id, id: `kanban:${merged.id}` },
        ]),
        rank: Number.MAX_SAFE_INTEGER,
        history: [
          ...secondary.history,
          normalizeHistoryEntry({
            ts,
            actor,
            event: "merged_into_task",
            note: `Gefuseerd in '${merged.title}' (${merged.id}). ${rationale}`,
          }),
        ].slice(-100),
        updatedAt: ts,
      },
      normalizeOptions,
    );

    state.tasks[primaryIdx] = merged;
    state.tasks[secondaryIdx] = archivedSecondary;
    rerankStatusTasks(state.tasks, primary.status);
    rerankStatusTasks(state.tasks, nextStatus);
    rerankStatusTasks(state.tasks, "ignored");
    saveState(state);
    appendEvent("tasks_merged", merged, { primaryId, secondaryId, input }, actor, rationale);
    appendEvent("task_merged_into", archivedSecondary, { mergedIntoTaskId: merged.id }, actor, rationale);
    return { ok: true, task: merged, mergedTask: merged, archivedTask: archivedSecondary };
  }

  function searchTasks(input = {}) {
    const state = loadState();
    const candidates = scoreTasks(state.tasks, input);
    const limit = Math.min(100, Math.max(1, Number(input.limit || 20) || 20));
    return {
      ok: true,
      tasks: candidates.slice(0, limit).map(({ task, score }) => ({ ...task, matchScore: score })),
      total: candidates.length,
      recentEvents: readRecentEvents(eventsPath, input),
    };
  }

  function ingestSignal(signal = {}, decision = null, meta = {}) {
    const sourceRef = normalizeSourceRef(signal.sourceRef || {});
    const people = normalizeStringArray(signal.people || []);
    const project = normalizeOptions.resolveProject(signal.project || "", {
      title: signal.title || "",
      summary: signal.summary || "",
      subject: signal.subject || "",
      explicit: Object.prototype.hasOwnProperty.call(signal, "project"),
    });
    const projectValue = truncate(project, 160);
    const decisionProject = decision?.project
      ? truncate(
          normalizeOptions.resolveProject(decision.project, {
            title: decision?.title || signal.title || "",
            summary: decision?.summary || signal.summary || "",
            subject: signal.subject || "",
            explicit: true,
          }),
          160,
        )
      : "";
    const finalProject = decisionProject || projectValue;
    const existing = searchTasks({
      query: signal.title || signal.summary || signal.action || sourceRef.label,
      project: finalProject,
      people,
      sourceRefs: [sourceRef],
      limit: 5,
    }).tasks;
    const action = decision?.action || (existing[0]?.matchScore >= 35 ? "update" : "create");
    if (action === "ignore") {
      appendEvent("signal_ignored", { id: "", title: signal.title || sourceRef.label, status: "ignored" }, { signal, decision }, meta.actor || "agent", decision?.rationale || "");
      return { ok: true, action: "ignore", task: null, candidates: existing };
    }
    if ((action === "update" || action === "move" || action === "complete") && (decision?.taskId || existing[0]?.id)) {
      const taskId = decision?.taskId || existing[0].id;
      const patch = {
        title: decision?.title || signal.title || undefined,
        summary: decision?.summary || signal.summary || undefined,
        nextAction: decision?.nextAction || signal.action || undefined,
        priority: decision?.priority || signal.priority || undefined,
        project: finalProject || undefined,
        people: people.length ? people : undefined,
        dueDate: decision?.dueDate || signal.dueDate || undefined,
        sourceRefs: [sourceRef],
      };
      if (action === "move" && decision?.status) patch.status = decision.status;
      if (action === "complete") patch.status = "done";
      const updated = updateTask(taskId, patch, { actor: meta.actor || "agent", event: "signal_merged", note: decision?.rationale || "Signaal gekoppeld aan bestaande taak." });
      return { ...updated, action: "update", candidates: existing };
    }
    const created = createTask(
      {
        title: decision?.title || signal.title || sourceRef.label || "Nieuwe taak",
        status: decision?.status || signal.status || "inbox",
        priority: decision?.priority || signal.priority || "middel",
        project: finalProject,
        people,
        dueDate: decision?.dueDate || signal.dueDate || "",
        nextAction: decision?.nextAction || signal.action || "",
        summary: decision?.summary || signal.summary || "",
        sourceRefs: [sourceRef],
      },
      { actor: meta.actor || "agent", note: decision?.rationale || "Taak aangemaakt uit nieuw signaal." },
    );
    return { ...created, action: "create", candidates: existing };
  }

  return {
    rootDir,
    tasksPath,
    eventsPath,
    loadState,
    listTasks,
    board,
    getTask,
    createTask,
    updateTask,
    moveTask,
    linkSource,
    mergeTasks,
    searchTasks,
    ingestSignal,
  };
}
