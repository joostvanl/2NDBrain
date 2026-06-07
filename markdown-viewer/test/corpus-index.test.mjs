import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractMarkdownSections,
  linkUnlinkedMentionsInMarkdown,
  repairEscapedMarkdownLinksInMarkdown,
  rebuildCorpusIndex,
  retrievalBudgetForQuestion,
  scoreEntriesForQuestion,
  scoreMarkdownSectionsForQuestion,
  unlinkedMentionSuggestionsFromManifest,
} from "../server/corpus-index.mjs";

test("extractMarkdownSections returns heading hierarchy and previews", () => {
  const sections = extractMarkdownSections(`# Project\nIntro\n\n## Planning\nSprint 1\n\n### Risico's\n- Scope\n`);

  assert.equal(sections.length, 3);
  assert.deepEqual(sections[0].headingPath, ["Project"]);
  assert.deepEqual(sections[1].headingPath, ["Project", "Planning"]);
  assert.deepEqual(sections[2].headingPath, ["Project", "Planning", "Risico's"]);
  assert.equal(sections[1].preview, "Sprint 1");
});

test("retrievalBudgetForQuestion chooses focused and broad profiles", () => {
  assert.equal(retrievalBudgetForQuestion("Waar staat DHL?").profile, "focused");
  assert.equal(
    retrievalBudgetForQuestion("Maak een volledige inventarisatie en vergelijking van alle projectdocumenten").profile,
    "broad",
  );
});

test("scoreEntriesForQuestion ranks matching documents higher", () => {
  const manifest = {
    entries: [
      {
        path: "projecten/dhl.md",
        title: "DHL Sentinel pilot",
        headings: ["Pilot", "Reviewproces"],
        preview: "Sentinel zet Jira tickets om naar merge-ready code.",
        related: [],
      },
      {
        path: "recepten/chana.md",
        title: "Chana Masala",
        headings: ["Ingrediënten"],
        preview: "Kikkererwten en kruiden.",
        related: [],
      },
    ],
  };

  const results = scoreEntriesForQuestion("Wat is de status van de Sentinel pilot bij DHL?", manifest);
  assert.equal(results[0].entry.path, "projecten/dhl.md");
  assert.ok(results[0].score > results[1].score);
});

test("scoreMarkdownSectionsForQuestion returns best matching section first", () => {
  const sections = extractMarkdownSections(
    "# Dossier\nAlgemeen\n\n## SLA\nReactietijden en incidentprioriteiten.\n\n## Team\nRollen en overleg.",
  );

  const scored = scoreMarkdownSectionsForQuestion("Welke reactietijden gelden voor incidenten?", sections);
  assert.equal(scored.sections[0].heading, "SLA");
  assert.ok(scored.meta.returnedCount >= 1);
});

test("rebuildCorpusIndex indexes frontmatter, tags, backlinks and unlinked mentions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-corpus-"));
  try {
    fs.writeFileSync(
      path.join(dir, "Project.md"),
      [
        "---",
        "status: active",
        "tags: [klant, sentinel]",
        "---",
        "# Project Alpha",
        "",
        "Zie [[Besluit]] en bespreek Roadmap zonder link.",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "Besluit.md"), "# Besluit\n\nBesluitvorming.", "utf8");
    fs.writeFileSync(path.join(dir, "Roadmap.md"), "# Roadmap\n\nPlanning.", "utf8");

    const manifest = await rebuildCorpusIndex(dir);
    const project = manifest.entries.find((entry) => entry.path === "Project.md");
    const besluit = manifest.entries.find((entry) => entry.path === "Besluit.md");

    assert.equal(manifest.entryCount, 3);
    assert.deepEqual(project.tags, ["klant", "sentinel"]);
    assert.equal(project.properties.status, "active");
    assert.deepEqual(project.linksOut, ["Besluit.md"]);
    assert.deepEqual(besluit.backlinks, ["Project.md"]);
    assert.equal(project.unlinkedMentions[0].path, "Roadmap.md");
    assert.equal(unlinkedMentionSuggestionsFromManifest(manifest)[0].to, "Roadmap.md");
    assert.ok(manifest.metadataKeys.includes("status"));
    assert.equal(manifest.tagCounts.sentinel, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("linkUnlinkedMentionsInMarkdown links safe body mentions once", () => {
  const content = [
    "---",
    "related: Roadmap",
    "---",
    "# Roadmap",
    "",
    "```",
    "Roadmap in code blijft tekst.",
    "```",
    "",
    "Bespreek Roadmap met het team.",
  ].join("\n");

  const suggestion = {
    from: "Project.md",
    to: "Roadmap.md",
    title: "Roadmap",
    mention: "Roadmap",
  };
  const first = linkUnlinkedMentionsInMarkdown(content, "Project.md", [suggestion]);

  assert.equal(first.applied.length, 1);
  assert.match(first.content, /Bespreek \[Roadmap\]\(Roadmap\.md\) met het team\./);
  assert.match(first.content, /related: Roadmap/);
  assert.match(first.content, /# Roadmap/);
  assert.match(first.content, /Roadmap in code blijft tekst\./);

  const second = linkUnlinkedMentionsInMarkdown(first.content, "Project.md", [suggestion]);
  assert.equal(second.applied.length, 0);
  assert.equal(second.skipped[0].reason, "already-linked");
});

test("linkUnlinkedMentionsInMarkdown respects Obsidian style markdown links", () => {
  const suggestion = {
    from: "Project.md",
    to: "Project Management.md",
    title: "Project Management",
    mention: "Project Management",
  };

  const alreadyLinked = linkUnlinkedMentionsInMarkdown(
    "Bespreek [Project Management](Project Management) en laat Project Management verder ongemoeid.",
    "Project.md",
    [suggestion],
  );

  assert.equal(alreadyLinked.applied.length, 0);
  assert.equal(alreadyLinked.skipped[0].reason, "already-linked");

  const percentEncoded = linkUnlinkedMentionsInMarkdown(
    "Bespreek [Project Management](Project%20Management.md) en laat Project Management verder ongemoeid.",
    "Project.md",
    [suggestion],
  );

  assert.equal(percentEncoded.applied.length, 0);
  assert.equal(percentEncoded.skipped[0].reason, "already-linked");
});

test("linkUnlinkedMentionsInMarkdown writes readable Obsidian style targets with spaces", () => {
  const result = linkUnlinkedMentionsInMarkdown("Bespreek Project Management morgen.", "Overzicht.md", [
    {
      from: "Overzicht.md",
      to: "Project Management.md",
      title: "Project Management",
      mention: "Project Management",
    },
  ]);

  assert.equal(result.applied.length, 1);
  assert.match(result.content, /Bespreek \[Project Management\]\(Project Management\.md\) morgen\./);
});

test("linkUnlinkedMentionsInMarkdown escapes parentheses in Obsidian style targets", () => {
  const result = linkUnlinkedMentionsInMarkdown("Bespreek Service Desk morgen.", "Overzicht.md", [
    {
      from: "Overzicht.md",
      to: "Service Desk (Cloud).md",
      title: "Service Desk",
      mention: "Service Desk",
    },
  ]);

  assert.equal(result.applied.length, 1);
  assert.equal(result.content, "Bespreek [Service Desk](Service Desk \\(Cloud\\).md) morgen.");
});

test("repairEscapedMarkdownLinksInMarkdown fixes escaped brackets in links", () => {
  const result = repairEscapedMarkdownLinksInMarkdown(
    "Context voor [managed services\\](90-experiments-en-test/Managed Services.md)-accounts.",
  );

  assert.equal(result.repairedCount, 1);
  assert.equal(result.content, "Context voor [managed services](90-experiments-en-test/Managed Services.md)-accounts.");
});

test("linkUnlinkedMentionsInMarkdown repairs escaped links before applying suggestions", () => {
  const result = linkUnlinkedMentionsInMarkdown(
    "Context voor \\[managed services\\](90-experiments-en-test/Managed Services.md)-accounts.",
    "Plan week 23.md",
    [],
  );

  assert.equal(result.repairedCount, 1);
  assert.equal(result.changed, true);
  assert.equal(result.content, "Context voor [managed services](90-experiments-en-test/Managed Services.md)-accounts.");
});
