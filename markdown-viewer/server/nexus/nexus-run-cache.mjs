import crypto from "node:crypto";

export function nexusToolCacheEnabled() {
  const raw = process.env.NEXUS_TOOL_CACHE;
  if (raw === "0" || raw === "false") return false;
  return true;
}

export function stableToolCacheKey(fnName, args = {}) {
  const sorted = sortObjectKeys(args);
  const payload = `${fnName}:${JSON.stringify(sorted)}`;
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function sortObjectKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortObjectKeys(value[key]);
  }
  return out;
}

/**
 * @param {string} runId
 */
export function createNexusRunContext(runId) {
  return {
    runId: String(runId || "—"),
    toolCache: new Map(),
    readPathsSeen: new Set(),
    toolHistory: [],
    toolFailures: new Map(),
    createdAt: Date.now(),
  };
}

export function getCachedToolResult(runContext, fnName, args) {
  if (!runContext || !nexusToolCacheEnabled()) return null;
  const key = stableToolCacheKey(fnName, args);
  if (!runContext.toolCache.has(key)) return null;
  return { cacheHit: true, key, result: runContext.toolCache.get(key) };
}

export function setCachedToolResult(runContext, fnName, args, result) {
  if (!runContext || !nexusToolCacheEnabled()) return;
  const key = stableToolCacheKey(fnName, args);
  runContext.toolCache.set(key, result);
}

export function recordToolInvocation(runContext, fnName, args, result, meta = {}) {
  if (!runContext) return;
  runContext.toolHistory.push({
    ts: Date.now(),
    fnName,
    args: sortObjectKeys(args),
    ok: meta.ok !== false,
    cacheHit: meta.cacheHit === true,
  });
  const readTools = new Set([
    "read_corpus_markdown",
    "read_corpus_section",
    "read_corpus_outline",
    "read_memory_markdown",
    "read_memory_section",
    "read_memory_outline",
  ]);
  if (readTools.has(fnName) && typeof args.path === "string" && args.path.trim()) {
    runContext.readPathsSeen.add(args.path.trim());
  }
}

export function recordToolFailure(runContext, fnName, args) {
  if (!runContext) return 0;
  const key = stableToolCacheKey(fnName, args);
  const count = (runContext.toolFailures.get(key) || 0) + 1;
  runContext.toolFailures.set(key, count);
  return count;
}

export function hasPriorKanbanSearch(runContext) {
  if (!runContext) return false;
  return runContext.toolHistory.some((row) => row.fnName === "search_kanban_tasks" && row.ok !== false);
}
