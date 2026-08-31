import test from "node:test";
import assert from "node:assert/strict";
import {
  findMemoryEntryByBasename,
  findMemoryEntryByExactPath,
  findMemoryEntriesBySuffix,
  normMemoryPathKey,
  resolveMemoryMarkdownPath,
  scoreMemoryPathCandidates,
} from "../server/nexus/nexus-memory-path.mjs";

const memoryEntries = [
  { path: "onderwerpen/stanley_stella_project.md", title: "Stanley Stella", preview: "SLA panel activeren" },
  { path: "personen_iO/Marlies_Client_Service_Lead.md", title: "Marlies", preview: "" },
  { path: "chat-promoties/2026-06-18-test.md", title: "Test", preview: "" },
];

const workingEntries = [
  {
    path: "02-projecten/stanley-stella/18062026 activeren SLA panel.md",
    title: "Activeren SLA panel",
    preview: "",
  },
];

test("normMemoryPathKey strips Files and .memory prefixes", () => {
  assert.equal(
    normMemoryPathKey("Files/.memory/onderwerpen/stanley_stella_project.md"),
    "onderwerpen/stanley_stella_project.md",
  );
  assert.equal(
    normMemoryPathKey("02-projecten/stanley-stella/18062026 activeren SLA panel.md"),
    "02-projecten/stanley-stella/18062026 activeren sla panel.md",
  );
});

test("findMemoryEntryByExactPath matches case-insensitively", () => {
  const hit = findMemoryEntryByExactPath(memoryEntries, "Onderwerpen/Stanley_Stella_Project.md");
  assert.equal(hit?.path, "onderwerpen/stanley_stella_project.md");
});

test("findMemoryEntriesBySuffix resolves partial memory paths", () => {
  const hits = findMemoryEntriesBySuffix(memoryEntries, "stanley_stella_project.md");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "onderwerpen/stanley_stella_project.md");
});

test("findMemoryEntryByBasename only accepts unique basename matches", () => {
  assert.equal(
    findMemoryEntryByBasename(memoryEntries, "onderwerpen/stanley_stella_project.md")?.path,
    "onderwerpen/stanley_stella_project.md",
  );
  assert.equal(findMemoryEntryByBasename(memoryEntries, "README.md"), null);
});

test("scoreMemoryPathCandidates ranks stanley project memory file", () => {
  const ranked = scoreMemoryPathCandidates(
    "02-projecten/stanley-stella/18062026 activeren SLA panel.md",
    memoryEntries,
    3,
  );
  assert.equal(ranked[0]?.path, "onderwerpen/stanley_stella_project.md");
});

test("resolveMemoryMarkdownPath detects work document misuse", () => {
  const result = resolveMemoryMarkdownPath("02-projecten/stanley-stella/18062026 activeren SLA panel.md", {
    memoryManifest: { entries: memoryEntries },
    workingManifest: { entries: workingEntries },
    memoryExists: (p) => p === "onderwerpen/stanley_stella_project.md",
    workingExists: (p) => p === "02-projecten/stanley-stella/18062026 activeren SLA panel.md",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "working_document");
  assert.equal(result.pathScope, "working");
  assert.match(result.error, /werkdocument/);
  assert.ok(result.memorySuggestions.includes("onderwerpen/stanley_stella_project.md"));
});

test("resolveMemoryMarkdownPath resolves memory path via manifest suffix", () => {
  const result = resolveMemoryMarkdownPath("stanley_stella_project.md", {
    memoryManifest: { entries: memoryEntries },
    workingManifest: { entries: workingEntries },
    memoryExists: (p) => p === "onderwerpen/stanley_stella_project.md",
    workingExists: () => false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, "onderwerpen/stanley_stella_project.md");
  assert.equal(result.resolvedVia, "manifest-suffix");
});

test("resolveMemoryMarkdownPath suggests memory targets when path is unknown", () => {
  const result = resolveMemoryMarkdownPath("onderwerpen/stanley-stella.md", {
    memoryManifest: { entries: memoryEntries },
    workingManifest: { entries: workingEntries },
    memoryExists: (p) => p === "onderwerpen/stanley_stella_project.md",
    workingExists: () => false,
    allowFuzzy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, "onderwerpen/stanley_stella_project.md");
  assert.equal(result.resolvedVia, "manifest-fuzzy");
});

test("resolveMemoryMarkdownPath does not fuzzy-resolve when only memory basename overlaps work topic", () => {
  const result = resolveMemoryMarkdownPath("stanley-stella/meeting.md", {
    memoryManifest: { entries: memoryEntries },
    workingManifest: { entries: [] },
    memoryExists: (p) => p === "onderwerpen/stanley_stella_project.md",
    workingExists: () => false,
    allowFuzzy: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, "onderwerpen/stanley_stella_project.md");
});
