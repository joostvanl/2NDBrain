import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityOverview, formatActivityOverviewMarkdown } from "../server/nexus/nexus-activity-overview.mjs";

test("buildActivityOverview combines kanban and email signals", () => {
  const overview = buildActivityOverview({ message: "week" }, {
    listKanbanTasks: () => ({
      tasks: [{ id: "t1", title: "RCA afronden", status: "today", project: "DHL" }],
      recentEvents: [],
    }),
    searchEmailMemory: () => ({
      results: [{ subject: "SLA follow-up", requiresAction: true, summary: "Actie nodig" }],
    }),
    readActivityLogs: () => ({ entries: [{ id: "a1", title: "Meeting", ts: "2026-06-10" }] }),
  });
  assert.ok(overview.factual.length >= 2);
  assert.ok(overview.inferred.length >= 1);
  const md = formatActivityOverviewMarkdown(overview);
  assert.match(md, /Activiteitenoverzicht/);
});
