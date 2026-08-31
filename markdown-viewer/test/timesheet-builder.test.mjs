import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimesheetEvidence,
  formatTimesheetDraftMarkdown,
  isInternalDossier,
  listWeekdays,
  parseDateRange,
  resolveDossier,
} from "../server/timesheet-builder.mjs";

test("resolveDossier maps DHL paths and kanban project", () => {
  assert.equal(resolveDossier("", { documentPath: "02-projecten/dhl/RCA.md" }).dossier, "DHL / Sentinel");
  assert.equal(resolveDossier("Follow-up SLA", { project: "Provincie Zeeland" }).dossier, "Provincie Zeeland");
});

test("isInternalDossier classifies overig dossiers", () => {
  assert.equal(isInternalDossier("Algemeen / intern"), true);
  assert.equal(isInternalDossier("DHL / Sentinel"), false);
});

test("buildTimesheetEvidence allocates 80/20 and 8h per weekday", async () => {
  const evidence = await buildTimesheetEvidence(
    { fromDate: "2026-06-16", toDate: "2026-06-17", includeCalendar: false },
    {
      readActivityLogs: () => ({
        entries: [
          {
            id: "a1",
            localDate: "2026-06-16",
            ts: "2026-06-16T09:00:00.000Z",
            chatTitle: "DHL RCA",
            documentPath: "02-projecten/dhl/RCA.md",
            request: "Werk RCA uit",
            durationMs: 45 * 60000,
          },
        ],
      }),
      listKanbanTasks: () => ({
        tasks: [{ id: "t1", title: "Ocean Cleanup SLA", project: "The Ocean Cleanup", updatedAt: "2026-06-17T10:00:00.000Z", status: "today", nextAction: "Mail sturen" }],
        recentEvents: [{ id: "e1", ts: "2026-06-17T11:00:00.000Z", note: "Taak verplaatst", taskId: "t1" }],
      }),
      searchEmailMemory: () => ({
        results: [{ subject: "Governance overleg", mailDate: "2026-06-16", summary: "Intern overleg", status: "action_required", requiresAction: true }],
      }),
    },
  );

  assert.ok(evidence.days["2026-06-16"]);
  assert.equal(evidence.days["2026-06-16"].totalMinutes, 480);
  assert.ok(evidence.days["2026-06-16"].clientMinutes >= 360);
  assert.ok(evidence.days["2026-06-16"].internalMinutes >= 60);
  assert.ok(evidence.days["2026-06-16"].activities?.length >= 2);
  const md = formatTimesheetDraftMarkdown(evidence);
  assert.match(md, /Urenregistratie-concept/);
  assert.match(md, /DHL \/ Sentinel|Governance|Managed Services/);
});

test("listWeekdays returns mon-fri only", () => {
  const days = listWeekdays("2026-06-15", "2026-06-21");
  assert.deepEqual(days, ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]);
});

test("empty day still gets 8h with 80/20 split", async () => {
  const evidence = await buildTimesheetEvidence(
    { fromDate: "2026-06-18", toDate: "2026-06-18", includeCalendar: false, includeOutlookMail: false },
    {},
  );
  const day = evidence.days["2026-06-18"];
  assert.equal(day.totalMinutes, 480);
  assert.equal(day.clientMinutes, 384);
  assert.equal(day.internalMinutes, 96);
});

test("parseDateRange defaults to current week when empty", () => {
  const range = parseDateRange("", "");
  assert.ok(range.from);
  assert.ok(range.to);
  assert.ok(range.from <= range.to);
});
