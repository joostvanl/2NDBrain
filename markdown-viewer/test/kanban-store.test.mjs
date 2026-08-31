import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKanbanStore } from "../server/kanban-store.mjs";

function tmpStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ioms-kanban-"));
  return { rootDir, store: createKanbanStore({ rootDir }) };
}

test("kanban store creates, updates, moves and logs tasks", () => {
  const { rootDir, store } = tmpStore();
  const created = store.createTask({
    title: "Review SLA addendum",
    status: "inbox",
    priority: "hoog",
    project: "DHL",
    people: ["Maurice"],
    nextAction: "Controleer de open punten.",
    sourceRefs: [{ type: "email", label: "Mail over DHL", entryId: "entry-1" }],
  });

  assert.equal(created.ok, true);
  assert.equal(created.task.status, "inbox");
  assert.equal(created.task.sourceRefs.length, 1);

  const updated = store.updateTask(created.task.id, { summary: "Extra context", people: ["Maurice", "Joost"] });
  assert.equal(updated.ok, true);
  assert.equal(updated.task.summary, "Extra context");
  assert.deepEqual(updated.task.people, ["Maurice", "Joost"]);

  const moved = store.moveTask(created.task.id, "today");
  assert.equal(moved.ok, true);
  assert.equal(moved.task.status, "today");

  const search = store.searchTasks({ query: "SLA DHL Maurice", limit: 5 });
  assert.equal(search.ok, true);
  assert.equal(search.tasks[0].id, created.task.id);

  const events = fs.readFileSync(path.join(rootDir, "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(events.length, 3);
  assert.equal(JSON.parse(events[0]).type, "task_created");
});

test("kanban ingest updates matching source instead of duplicating", () => {
  const { store } = tmpStore();
  const signal = {
    title: "Beantwoord mail over Sentinel",
    priority: "middel",
    action: "Maak een reply.",
    summary: "Er is opvolging nodig.",
    people: ["Maurice"],
    sourceRef: { type: "email", label: "Sentinel mail", entryId: "same-entry" },
  };
  const first = store.ingestSignal(signal);
  assert.equal(first.action, "create");
  assert.ok(first.task.id);

  const second = store.ingestSignal(
    { ...signal, action: "Reply is scherper geworden." },
    { action: "update", taskId: first.task.id, nextAction: "Stuur aangepaste reply.", rationale: "Zelfde e-mailthread." },
  );
  assert.equal(second.action, "update");
  assert.equal(second.task.id, first.task.id);
  assert.equal(store.listTasks().total, 1);
  assert.equal(second.task.nextAction, "Stuur aangepaste reply.");
});

test("kanban store preserves lane order when moving to target index", () => {
  const { store } = tmpStore();
  const first = store.createTask({ title: "Eerste", status: "today", nextAction: "A" }).task;
  const second = store.createTask({ title: "Tweede", status: "today", nextAction: "B" }).task;
  const third = store.createTask({ title: "Derde", status: "inbox", nextAction: "C" }).task;

  store.moveTask(first.id, "today", { targetIndex: 0 });
  store.moveTask(second.id, "today", { targetIndex: 1 });
  const moved = store.moveTask(third.id, "today", { targetIndex: 1 });
  assert.equal(moved.ok, true);

  const today = store.board().columns.find((column) => column.status === "today").tasks;
  assert.deepEqual(
    today.map((task) => task.title),
    ["Eerste", "Derde", "Tweede"],
  );
  assert.deepEqual(
    today.map((task) => task.rank),
    [1000, 2000, 3000],
  );
});

test("kanban listTasks combines filters and includes recent events for reports", () => {
  const { store } = tmpStore();
  const relevant = store.createTask({
    title: "Weekrapport Kanban activiteit",
    status: "doing",
    project: "Managed Services",
    nextAction: "Vat Kanban-werk samen.",
  }).task;
  store.createTask({
    title: "Ander project met Kanban woord",
    status: "done",
    project: "Anders",
    nextAction: "Niet meenemen.",
  });
  store.moveTask(relevant.id, "done", { note: "Afgerond voor weekrapport." });

  const filtered = store.listTasks({
    query: "Kanban",
    project: "Managed",
    status: "done",
    since: "14d",
    eventLimit: 10,
  });

  assert.equal(filtered.ok, true);
  assert.equal(filtered.tasks.length, 1);
  assert.equal(filtered.tasks[0].id, relevant.id);
  assert.ok(Array.isArray(filtered.recentEvents));
  assert.equal(filtered.recentEvents.some((event) => event.taskId === relevant.id), true);
  assert.match(filtered.searchHint, /rapportages eerst query=''/);
});

test("kanban store merges two tasks into one overarching task", () => {
  const { rootDir, store } = tmpStore();
  const primary = store.createTask({
    title: "DHL SLA opvolging",
    status: "today",
    priority: "hoog",
    project: "DHL",
    people: ["Joost"],
    nextAction: "Plan overleg.",
    summary: "SLA-afspraken moeten scherp worden.",
    sourceRefs: [{ type: "email", label: "SLA mail", entryId: "mail-1" }],
  }).task;
  const secondary = store.createTask({
    title: "DHL governance mail beantwoorden",
    status: "inbox",
    priority: "middel",
    project: "DHL",
    people: ["Aurelie"],
    nextAction: "Conceptreactie maken.",
    summary: "Governance-vragen hangen samen met SLA.",
    sourceRefs: [{ type: "email", label: "Governance mail", entryId: "mail-2" }],
  }).task;

  const merged = store.mergeTasks(primary.id, secondary.id, {
    title: "DHL SLA en governance afronden",
    status: "today",
    priority: "hoog",
    project: "DHL",
    people: ["Joost", "Aurelie"],
    nextAction: "Maak één voorstel voor SLA en governance.",
    summary: "Overkoepelende taak voor SLA-afspraken en governance-opvolging.",
    rationale: "Zelfde traject en dezelfde opvolging.",
  });

  assert.equal(merged.ok, true);
  assert.equal(merged.task.id, primary.id);
  assert.equal(merged.task.title, "DHL SLA en governance afronden");
  assert.deepEqual(merged.task.people, ["Joost", "Aurelie"]);
  assert.equal(merged.task.sourceRefs.some((ref) => ref.entryId === "mail-1"), true);
  assert.equal(merged.task.sourceRefs.some((ref) => ref.entryId === "mail-2"), true);
  assert.equal(merged.task.history.at(-1).event, "tasks_merged");

  const archived = store.getTask(secondary.id).task;
  assert.equal(archived.status, "ignored");
  assert.equal(archived.history.at(-1).event, "merged_into_task");

  const activeTasks = store.listTasks().tasks.filter((task) => task.status !== "ignored");
  assert.deepEqual(
    activeTasks.map((task) => task.id),
    [primary.id],
  );

  const events = fs.readFileSync(path.join(rootDir, "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(JSON.parse(events.at(-2)).type, "tasks_merged");
  assert.equal(JSON.parse(events.at(-1)).type, "task_merged_into");
});

test("kanban store purges done and ignored tasks after retention period", () => {
  const { rootDir, store } = tmpStore();
  const doneTask = store.createTask({ title: "Afgerond", status: "inbox", nextAction: "Klaar." }).task;
  const ignoredTask = store.createTask({ title: "Genegeerd", status: "inbox", nextAction: "Niet doen." }).task;
  const activeTask = store.createTask({ title: "Nog open", status: "today", nextAction: "Doorgaan." }).task;
  store.moveTask(doneTask.id, "done");
  store.moveTask(ignoredTask.id, "ignored");

  const oldClosedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const tasksPath = path.join(rootDir, "tasks.json");
  const raw = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  for (const task of raw.tasks) {
    if (task.id === doneTask.id || task.id === ignoredTask.id) {
      task.closedAt = oldClosedAt;
      task.updatedAt = oldClosedAt;
    }
  }
  fs.writeFileSync(tasksPath, JSON.stringify(raw, null, 2));

  const board = store.board();
  assert.equal(board.total, 1);
  assert.equal(board.tasks[0].id, activeTask.id);

  const events = fs.readFileSync(path.join(rootDir, "events.jsonl"), "utf8").trim().split("\n");
  assert.equal(JSON.parse(events.at(-2)).type, "task_purged");
  assert.equal(JSON.parse(events.at(-1)).type, "task_purged");
});

test("kanban store keeps terminal tasks younger than retention period", () => {
  const { rootDir, store } = tmpStore();
  const doneTask = store.createTask({ title: "Recent afgerond", status: "inbox", nextAction: "Klaar." }).task;
  store.moveTask(doneTask.id, "done");

  const recentClosedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const tasksPath = path.join(rootDir, "tasks.json");
  const raw = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  raw.tasks.find((task) => task.id === doneTask.id).closedAt = recentClosedAt;
  fs.writeFileSync(tasksPath, JSON.stringify(raw, null, 2));

  const board = store.board();
  assert.equal(board.total, 1);
  assert.equal(board.tasks[0].id, doneTask.id);
  assert.equal(board.tasks[0].status, "done");
});

test("kanban updateTask can reopen ignored tasks to an open status", () => {
  const { store } = tmpStore();
  const task = store.createTask({ title: "E-mail follow-up", status: "inbox", nextAction: "Reageren." }).task;
  store.moveTask(task.id, "ignored", { actor: "agent", note: "Per ongeluk genegeerd." });
  const reopened = store.updateTask(
    task.id,
    { status: "today", actor: "joost", rationale: "Taak heropend." },
    { actor: "joost" },
  );
  assert.equal(reopened.ok, true);
  assert.equal(reopened.task.status, "today");
  assert.equal(reopened.task.closedAt, "");
  const board = store.board();
  assert.equal(board.tasks.some((item) => item.id === task.id && item.status === "today"), true);
});
