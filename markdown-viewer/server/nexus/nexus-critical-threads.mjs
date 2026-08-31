import fs from "node:fs";
import path from "node:path";

const CRITICAL_TAG_RE = /\b(SLA|contract|RFP|incident)\b/i;

export function isCriticalEmailTag(tagsOrText) {
  if (Array.isArray(tagsOrText)) {
    return tagsOrText.some((t) => CRITICAL_TAG_RE.test(String(t || "")));
  }
  return CRITICAL_TAG_RE.test(String(tagsOrText || ""));
}

/**
 * @param {string} storePath absolute path to critical-threads.json
 */
export function readCriticalThreads(storePath) {
  try {
    if (!fs.existsSync(storePath)) return { version: 1, threads: [] };
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return { version: 1, threads: [] };
  }
}

export function writeCriticalThreads(storePath, payload) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * @param {string} storePath
 * @param {{ subject?: string, notificationId?: string, tags?: string[], client?: string, mailDate?: string }} input
 */
export function upsertCriticalThread(storePath, input) {
  const tags = Array.isArray(input.tags) ? input.tags : [];
  if (!isCriticalEmailTag(tags) && !isCriticalEmailTag(input.subject || "")) {
    return { updated: false };
  }
  const payload = readCriticalThreads(storePath);
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  const id = String(input.notificationId || input.subject || "").trim();
  if (!id) return { updated: false };
  const existing = threads.find((t) => t.id === id);
  const next = {
    id,
    subject: input.subject || "",
    tags,
    client: input.client || "",
    mailDate: input.mailDate || "",
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, next);
  } else {
    threads.unshift(next);
  }
  writeCriticalThreads(storePath, { version: 1, threads: threads.slice(0, 200) });
  return { updated: true, id };
}

/**
 * Boost email memory results that match critical threads for a query.
 * @param {Array<Record<string, unknown>>} results
 * @param {string} storePath
 * @param {string} query
 */
export function boostCriticalThreadResults(results, storePath, query = "") {
  const payload = readCriticalThreads(storePath);
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  if (!threads.length || !Array.isArray(results)) return results;
  const q = String(query || "").toLowerCase();
  const criticalIds = new Set(threads.map((t) => t.id));
  const criticalSubjects = threads.map((t) => String(t.subject || "").toLowerCase()).filter(Boolean);

  return [...results].sort((a, b) => scoreCritical(b, criticalIds, criticalSubjects, q) - scoreCritical(a, criticalIds, criticalSubjects, q));
}

function scoreCritical(item, criticalIds, criticalSubjects, query) {
  let score = 0;
  const id = String(item.notificationId || item.id || "");
  const subject = String(item.subject || "").toLowerCase();
  if (criticalIds.has(id)) score += 5;
  if (criticalSubjects.some((s) => s && subject.includes(s))) score += 3;
  if (query && subject.includes(query)) score += 2;
  if (isCriticalEmailTag(item.tags || item.subject || "")) score += 2;
  return score;
}
