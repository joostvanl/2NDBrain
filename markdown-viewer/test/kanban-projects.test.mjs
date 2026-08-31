import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKanbanStore } from "../server/kanban-store.mjs";
import {
  buildKanbanProjectRegistry,
  formatProjectDisplayName,
  normalizeProjectKey,
  resolveKanbanProject,
} from "../server/kanban-projects.mjs";

function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ioms-kanban-projects-"));
  const memoryDir = path.join(root, "memory");
  const markdownDir = path.join(root, "files");
  fs.mkdirSync(path.join(memoryDir, "onderwerpen"), { recursive: true });
  fs.mkdirSync(path.join(markdownDir, "02-projecten"), { recursive: true });
  return { root, memoryDir, markdownDir };
}

test("normalizeProjectKey ignores case and punctuation differences", () => {
  assert.equal(normalizeProjectKey("DHL Express"), normalizeProjectKey("dhl express"));
  assert.equal(normalizeProjectKey("Provincie Zeeland"), normalizeProjectKey("provincie-zeeland"));
});

test("resolveKanbanProject maps aliases to canonical customer names", () => {
  const { memoryDir, markdownDir } = tmpDirs();
  fs.writeFileSync(
    path.join(memoryDir, "onderwerpen", "dhl_express_rca_project.md"),
    "# DHL Express – RCA projectoverzicht\n",
    "utf8",
  );
  fs.mkdirSync(path.join(markdownDir, "02-projecten", "dhl"));
  const registry = buildKanbanProjectRegistry({ memoryDir, markdownDir, existingProjects: ["DHL", "dhl"] });
  assert.equal(resolveKanbanProject("DHL", registry), "DHL Express");
  assert.equal(resolveKanbanProject("confluence", registry), "");
  assert.equal(resolveKanbanProject("meeting", registry), "");
  assert.equal(resolveKanbanProject("Widget Partners", registry), "Widget Partners");
  assert.equal(
    resolveKanbanProject("", registry, { title: "KNLTB – SLA bespreken" }),
    "KNLTB",
  );
  assert.equal(resolveKanbanProject("Provincie zeeland", registry, { title: "Kick-off Provincie Zeeland" }), "Provincie Zeeland");
});

test("resolveKanbanProject honors explicit project over title hints", () => {
  const registry = buildKanbanProjectRegistry({ memoryDir: "", markdownDir: "", existingProjects: ["KNLTB"] });
  assert.equal(
    resolveKanbanProject("Nieuwe Klant BV", registry, { title: "KNLTB – SLA bespreken", explicit: true }),
    "Nieuwe Klant BV",
  );
  assert.equal(
    resolveKanbanProject("", registry, { title: "KNLTB – SLA bespreken", explicit: true }),
    "",
  );
});

test("formatProjectDisplayName keeps readable customer labels", () => {
  assert.equal(formatProjectDisplayName("monitoring & observability io-breed"), "Monitoring & Observability Io-breed");
  assert.equal(formatProjectDisplayName("dhl"), "DHL");
});

test("kanban store normalizes project names on create", () => {
  const { memoryDir, markdownDir } = tmpDirs();
  fs.writeFileSync(
    path.join(memoryDir, "onderwerpen", "superunie_project.md"),
    "# Superunie – projectoverzicht\n",
    "utf8",
  );
  fs.mkdirSync(path.join(markdownDir, "02-projecten", "Superunie"));
  const registry = buildKanbanProjectRegistry({ memoryDir, markdownDir });
  const store = createKanbanStore({
    rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "ioms-kanban-store-")),
    resolveProject: (value, hints) => resolveKanbanProject(value, registry, hints),
  });
  const created = store.createTask({
    title: "SLA feedback terugkoppelen",
    project: "superunie",
    nextAction: "Mail sturen.",
  });
  assert.equal(created.task.project, "Superunie");
});

test("kanban store keeps explicit project updates over title inference", () => {
  const registry = buildKanbanProjectRegistry({ memoryDir: "", markdownDir: "", existingProjects: ["KNLTB"] });
  const store = createKanbanStore({
    rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "ioms-kanban-store-explicit-")),
    resolveProject: (value, hints) => resolveKanbanProject(value, registry, hints),
  });
  const created = store.createTask({
    title: "KNLTB – SLA bespreken",
    nextAction: "Voorbereiden.",
  });
  assert.equal(created.task.project, "KNLTB");
  const updated = store.updateTask(created.task.id, { project: "Nieuwe Klant BV" });
  assert.equal(updated.task.project, "Nieuwe Klant BV");
  const cleared = store.updateTask(created.task.id, { project: "" });
  assert.equal(cleared.task.project, "");
});
