import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const KANBAN_COMMENT_MAX_THREADS = 80;
export const KANBAN_COMMENT_MAX_REPLIES = 50;
export const KANBAN_COMMENT_BODY_MAX = 12000;
export const KANBAN_COMMENT_REPLY_MAX = 2000;

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function truncate(value, max = 1000) {
  const s = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

function safeTaskId(id) {
  const s = String(id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return null;
  return s;
}

function normalizeAuthor(value, fallback = "joost") {
  const author = truncate(value || fallback, 80) || fallback;
  return author;
}

function normalizeReply(raw = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  const createdAt = truncate(o.createdAt || nowIso(), 80);
  return {
    id: truncate(o.id || randomUUID(), 120),
    author: normalizeAuthor(o.author, "onbekend"),
    body: truncate(o.body || "", KANBAN_COMMENT_REPLY_MAX),
    createdAt,
    updatedAt: truncate(o.updatedAt || createdAt, 80),
  };
}

function normalizeThread(raw = {}) {
  const o = raw && typeof raw === "object" ? raw : {};
  const createdAt = truncate(o.createdAt || nowIso(), 80);
  const replies = Array.isArray(o.replies) ? o.replies.map(normalizeReply).slice(-KANBAN_COMMENT_MAX_REPLIES) : [];
  return {
    id: truncate(o.id || randomUUID(), 120),
    author: normalizeAuthor(o.author, "onbekend"),
    body: truncate(o.body || "", KANBAN_COMMENT_BODY_MAX),
    createdAt,
    updatedAt: truncate(o.updatedAt || createdAt, 80),
    replies,
  };
}

function defaultPayload(taskId) {
  return {
    version: 1,
    taskId,
    threads: [],
    updatedAt: nowIso(),
  };
}

function normalizePayload(raw, taskId) {
  const o = raw && typeof raw === "object" ? raw : {};
  const threads = Array.isArray(o.threads) ? o.threads.map(normalizeThread).slice(-KANBAN_COMMENT_MAX_THREADS) : [];
  return {
    version: 1,
    taskId,
    threads,
    updatedAt: truncate(o.updatedAt || nowIso(), 80),
  };
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

export function createKanbanCommentsStore(options = {}) {
  const rootDir = options.rootDir || path.join(process.cwd(), "Files", ".kanban", "comments");
  ensureDir(rootDir);

  function commentPath(taskId) {
    const safeId = safeTaskId(taskId);
    if (!safeId) return null;
    return path.join(rootDir, `${safeId}.json`);
  }

  function readPayload(taskId) {
    const safeId = safeTaskId(taskId);
    if (!safeId) return { ok: false, error: "Ongeldige taak-id." };
    const filePath = commentPath(safeId);
    const payload = normalizePayload(readJsonFile(filePath, defaultPayload(safeId)), safeId);
    return { ok: true, taskId: safeId, threads: payload.threads, path: filePath };
  }

  function writePayload(taskId, threads) {
    const safeId = safeTaskId(taskId);
    if (!safeId) return { ok: false, error: "Ongeldige taak-id." };
    const filePath = commentPath(safeId);
    const payload = normalizePayload({ taskId: safeId, threads, updatedAt: nowIso() }, safeId);
    if (!payload.threads.length) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { ok: true, taskId: safeId, threads: [], path: filePath };
    }
    writeJsonAtomic(filePath, payload);
    return { ok: true, taskId: safeId, threads: payload.threads, path: filePath };
  }

  function listThreads(taskId) {
    return readPayload(taskId);
  }

  function addThread(taskId, input = {}) {
    const body = truncate(input.body || "", KANBAN_COMMENT_BODY_MAX);
    if (!body) return { ok: false, error: "Commentaar mag niet leeg zijn." };
    const current = readPayload(taskId);
    if (!current.ok) return current;
    const ts = nowIso();
    const thread = normalizeThread({
      id: randomUUID(),
      author: normalizeAuthor(input.author, "joost"),
      body,
      createdAt: ts,
      updatedAt: ts,
      replies: [],
    });
    const threads = [...current.threads, thread].slice(-KANBAN_COMMENT_MAX_THREADS);
    const saved = writePayload(taskId, threads);
    if (!saved.ok) return saved;
    return { ok: true, thread, threads: saved.threads };
  }

  function addReply(taskId, threadId, input = {}) {
    const body = truncate(input.body || "", KANBAN_COMMENT_REPLY_MAX);
    if (!body) return { ok: false, error: "Antwoord mag niet leeg zijn." };
    const current = readPayload(taskId);
    if (!current.ok) return current;
    const idx = current.threads.findIndex((thread) => thread.id === threadId);
    if (idx < 0) return { ok: false, error: "Commentaardraad niet gevonden." };
    const ts = nowIso();
    const reply = normalizeReply({
      id: randomUUID(),
      author: normalizeAuthor(input.author, "joost"),
      body,
      createdAt: ts,
      updatedAt: ts,
    });
    const thread = { ...current.threads[idx] };
    thread.replies = [...thread.replies, reply].slice(-KANBAN_COMMENT_MAX_REPLIES);
    thread.updatedAt = ts;
    const threads = current.threads.slice();
    threads[idx] = thread;
    const saved = writePayload(taskId, threads);
    if (!saved.ok) return saved;
    return { ok: true, thread, reply, threads: saved.threads };
  }

  function deleteForTask(taskId) {
    const filePath = commentPath(taskId);
    if (!filePath) return { ok: false, error: "Ongeldige taak-id." };
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  }

  function mergeTasks(primaryId, secondaryId) {
    const primary = readPayload(primaryId);
    const secondary = readPayload(secondaryId);
    if (!primary.ok) return primary;
    if (!secondary.ok) return secondary;
    if (!secondary.threads.length) return { ok: true, threads: primary.threads, mergedCount: 0 };
    const marker = `[Gefuseerd van taak ${secondaryId}]`;
    const imported = secondary.threads.map((thread) =>
      normalizeThread({
        ...thread,
        body: thread.body ? `${thread.body}\n\n${marker}` : marker,
        replies: thread.replies,
      }),
    );
    const threads = [...primary.threads, ...imported].slice(-KANBAN_COMMENT_MAX_THREADS);
    const saved = writePayload(primaryId, threads);
    if (!saved.ok) return saved;
    deleteForTask(secondaryId);
    return { ok: true, threads: saved.threads, mergedCount: imported.length };
  }

  return {
    rootDir,
    listThreads,
    addThread,
    addReply,
    deleteForTask,
    mergeTasks,
  };
}
