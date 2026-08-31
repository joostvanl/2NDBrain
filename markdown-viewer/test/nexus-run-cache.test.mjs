import test from "node:test";
import assert from "node:assert/strict";
import {
  createNexusRunContext,
  getCachedToolResult,
  hasPriorKanbanSearch,
  setCachedToolResult,
  stableToolCacheKey,
} from "../server/nexus/nexus-run-cache.mjs";

test("stableToolCacheKey is stable for key order", () => {
  const a = stableToolCacheKey("search_kanban_tasks", { query: "dhl", limit: 10 });
  const b = stableToolCacheKey("search_kanban_tasks", { limit: 10, query: "dhl" });
  assert.equal(a, b);
});

test("run context caches tool results", () => {
  const ctx = createNexusRunContext("run-1");
  setCachedToolResult(ctx, "search_kanban_tasks", { query: "x" }, { ok: true, total: 1 });
  const hit = getCachedToolResult(ctx, "search_kanban_tasks", { query: "x" });
  assert.ok(hit);
  assert.equal(hit.result.total, 1);
});

test("hasPriorKanbanSearch tracks tool history", () => {
  const ctx = createNexusRunContext("run-2");
  assert.equal(hasPriorKanbanSearch(ctx), false);
  ctx.toolHistory.push({ fnName: "search_kanban_tasks", ok: true });
  assert.equal(hasPriorKanbanSearch(ctx), true);
});
