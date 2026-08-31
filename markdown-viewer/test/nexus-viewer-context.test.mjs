import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNexusViewerContextBlock,
  resolveNexusViewerDocument,
  resolveViewerOpenDocument,
  truncateNexusHeuristicBlob,
} from "../server/nexus/nexus-viewer-context.mjs";

test("formatNexusViewerContextBlock includes open document path", () => {
  const block = formatNexusViewerContextBlock({
    activeView: "documents",
    documentPath: "01-managed-services/foo.md",
    markdown: "# Titel\n\nInhoud",
  });
  assert.match(block, /01-managed-services\/foo\.md/);
  assert.match(block, /Geopend Markdown-bestand/);
});

test("formatNexusViewerContextBlock handles no open document", () => {
  const block = formatNexusViewerContextBlock({ activeView: "kanban" });
  assert.match(block, /Geen Markdown-bestand open/);
  assert.match(block, /Actie-Kanban-weergave actief/);
});

test("formatNexusViewerContextBlock flags meta question", () => {
  const block = formatNexusViewerContextBlock({
    documentPath: "x.md",
    question: "Welk bestand heb ik open?",
  });
  assert.match(block, /Meta-vraag herkend/);
});

test("truncateNexusHeuristicBlob preserves pinned viewercontext", () => {
  const pinned = formatNexusViewerContextBlock({ documentPath: "a.md", markdown: "x" });
  const body = "x".repeat(5000);
  const out = truncateNexusHeuristicBlob(pinned, body, 800);
  assert.match(out, /a\.md/);
  assert.ok(out.length <= 820);
});

test("resolveNexusViewerDocument prefers primary then openDocument", () => {
  assert.deepEqual(resolveNexusViewerDocument("primary.md", "a", "secondary.md", "b"), {
    documentPath: "primary.md",
    markdown: "a",
  });
  assert.deepEqual(resolveNexusViewerDocument("", "", "secondary.md", "b"), {
    documentPath: "secondary.md",
    markdown: "b",
  });
});

test("resolveViewerOpenDocument ignores email contextual name", () => {
  assert.deepEqual(
    resolveViewerOpenDocument("email-followup:abc", "", "01/foo.md", "# x"),
    { documentPath: "01/foo.md", markdown: "# x" },
  );
});
