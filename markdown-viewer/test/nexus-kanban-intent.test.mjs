import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNexusIntent,
  formatInternalKanbanDisambiguationBlock,
  inferInternalKanbanIntent,
} from "../server/nexus/nexus-intent.mjs";
import { formatNexusViewerContextBlock } from "../server/nexus/nexus-viewer-context.mjs";

test("inferInternalKanbanIntent recognizes Kanban bord and Nexus Kanban", () => {
  assert.equal(inferInternalKanbanIntent("Wat staat er op mijn Kanban bord?"), true);
  assert.equal(inferInternalKanbanIntent("Toon mijn Nexus Kanban taken"), true);
  assert.equal(inferInternalKanbanIntent("Welke Kanban taken zijn open?"), true);
  assert.equal(inferInternalKanbanIntent("Actie-Kanban inbox"), true);
});

test("inferInternalKanbanIntent ignores explicit external tooling", () => {
  assert.equal(inferInternalKanbanIntent("Wat staat er op het Jira Kanban bord?"), false);
  assert.equal(inferInternalKanbanIntent("Azure DevOps board status"), false);
});

test("inferInternalKanbanIntent is true when kanban view is active", () => {
  assert.equal(inferInternalKanbanIntent("Wat moet ik vandaag doen?", { activeView: "kanban" }), true);
});

test("classifyNexusIntent enables kanban tools for Kanban board questions", () => {
  const intent = classifyNexusIntent("Wat staat er op het Kanban bord?", {
    hasDocument: true,
    documentPath: "02-projecten/foo.md",
    mode: "ask",
  });
  assert.equal(intent.profile, "planning");
  assert.equal(intent.internalKanbanIntent, true);
  assert.equal(intent.enabledToolGroups.kanban, true);
});

test("classifyNexusIntent keeps document-edit when no Kanban signal", () => {
  const intent = classifyNexusIntent("Pas dit document aan met de nieuwe terminologie.", {
    hasDocument: true,
    documentPath: "02-projecten/foo.md",
    mode: "agent",
  });
  assert.equal(intent.profile, "document-edit");
  assert.equal(intent.internalKanbanIntent, false);
  assert.equal(intent.enabledToolGroups.kanban, false);
});

test("classifyNexusIntent prioritizes Kanban over document-edit when both signals appear", () => {
  const intent = classifyNexusIntent("Verplaats de KNLTB taak op het Kanban bord naar Wachtend.", {
    hasDocument: true,
    documentPath: "02-projecten/foo.md",
    mode: "agent",
  });
  assert.equal(intent.profile, "planning");
  assert.equal(intent.internalKanbanIntent, true);
  assert.equal(intent.enabledToolGroups.kanban, true);
});

test("formatInternalKanbanDisambiguationBlock returns guidance for Kanban questions", () => {
  const block = formatInternalKanbanDisambiguationBlock("Kanban taken voor DHL");
  assert.match(block, /Kanban-disambiguatie/);
  assert.match(block, /search_kanban_tasks/);
});

test("formatNexusViewerContextBlock flags Kanban view and Kanban questions", () => {
  const viewBlock = formatNexusViewerContextBlock({ activeView: "kanban" });
  assert.match(viewBlock, /Actie-Kanban-weergave actief/);

  const questionBlock = formatNexusViewerContextBlock({
    activeView: "documents",
    question: "Wat staat op het Kanban bord?",
  });
  assert.match(questionBlock, /Kanban-vraag herkend/);
});
