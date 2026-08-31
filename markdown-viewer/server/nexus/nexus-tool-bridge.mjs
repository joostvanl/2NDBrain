import {
  getCachedToolResult,
  recordToolFailure,
  recordToolInvocation,
  setCachedToolResult,
} from "./nexus-run-cache.mjs";
import { wrapToolError } from "./nexus-evidence.mjs";

export const NEXUS_CACHEABLE_TOOLS = new Set([
  "search_kanban_tasks",
  "read_kanban_task",
  "search_email_memory",
  "read_activity_logs",
  "read_corpus_outline",
  "read_corpus_section",
  "read_corpus_markdown",
  "read_memory_outline",
  "read_memory_section",
  "read_memory_markdown",
  "web_search",
  "search_confluence",
  "read_confluence_page",
  "build_activity_overview",
]);

export function tryNexusToolCache(runContext, fnName, args, tc, messages) {
  if (!runContext || !NEXUS_CACHEABLE_TOOLS.has(fnName)) return false;
  const hit = getCachedToolResult(runContext, fnName, args);
  if (!hit) return false;
  messages.push({
    role: "tool",
    tool_call_id: tc.id,
    content: JSON.stringify({ ...(hit.result || {}), _nexusCacheHit: true }),
  });
  recordToolInvocation(runContext, fnName, args, hit.result, { ok: true, cacheHit: true });
  return true;
}

export function storeNexusToolResult(runContext, fnName, args, payload) {
  if (!runContext || !NEXUS_CACHEABLE_TOOLS.has(fnName)) return payload;
  setCachedToolResult(runContext, fnName, args, payload);
  recordToolInvocation(runContext, fnName, args, payload, { ok: payload?.ok !== false });
  return payload;
}

export function pushNexusToolMessage(messages, tc, runContext, fnName, args, payload) {
  const stored = storeNexusToolResult(runContext, fnName, args, payload);
  messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(stored) });
}

export async function runNexusToolSafe(runContext, fnName, args, executor, appendErrorLog) {
  try {
    const result = await executor();
    return storeNexusToolResult(runContext, fnName, args, result);
  } catch (error) {
    const failCount = recordToolFailure(runContext, fnName, args);
    const wrapped = wrapToolError(fnName, error);
    recordToolInvocation(runContext, fnName, args, wrapped, { ok: false });
    if (failCount >= 2 && typeof appendErrorLog === "function") {
      try {
        appendErrorLog({
          title: `Herhaalde toolfout: ${fnName}`,
          tool: fnName,
          error: wrapped.error,
          context: args,
        });
      } catch {
        /* ignore */
      }
    }
    return wrapped;
  }
}

export function kanbanTitleSimilarity(a, b) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

export function suggestKanbanDuplicateTask(title, kanbanStore, opts = {}) {
  const payload = kanbanStore.listTasks({
    query: title,
    limit: opts.limit || 12,
    since: opts.since || "30d",
  });
  const openStatuses = new Set(["inbox", "today", "this_week", "waiting", "scheduled", "doing"]);
  const candidates = (payload.tasks || []).filter((t) => openStatuses.has(t.status));
  let best = null;
  let bestScore = 0;
  for (const task of candidates) {
    const score = kanbanTitleSimilarity(title, task.title);
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }
  if (best && bestScore >= 0.55) {
    return { duplicate: true, task: best, score: bestScore };
  }
  return { duplicate: false, score: bestScore, task: best };
}
