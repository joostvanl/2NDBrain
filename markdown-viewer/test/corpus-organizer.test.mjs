import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureCorpusMetaComment, extractDocumentMetadata, resolveCanonicalDocumentPath, searchCorpusManifests } from "../server/corpus-index.mjs";
import {
  createCorpusOrganizer,
  heuristicClassifyDocument,
  isDraftContentReadyForOrganize,
  isInboxPath,
  isOrganizerExemptPath,
  isWorkDraftPath,
  moveCorpusDocument,
  resolveRedirectTarget,
  writeWorkDocumentDraft,
} from "../server/corpus-organizer.mjs";

test("isInboxPath accepts only 00-inbox markdown paths", () => {
  assert.equal(isInboxPath("00-inbox/Concept.md"), true);
  assert.equal(isInboxPath("02-projecten/dhl/x.md"), false);
});

test("isOrganizerExemptPath protects inbox README", () => {
  assert.equal(isOrganizerExemptPath("00-inbox/README.md"), true);
  assert.equal(isOrganizerExemptPath("00-inbox/Concept.md"), false);
});

test("ensureCorpusMetaComment stores metadata in HTML comment only", () => {
  const out = ensureCorpusMetaComment("# Titel\n\nInhoud.", "my-doc");
  assert.match(out.content, /<!--[\s\S]*ioms-corpus-meta/);
  assert.match(out.content, /doc_id: "my-doc"/);
  assert.doesNotMatch(out.content, /^---/m);
  assert.match(out.content, /# Titel/);
  const meta = extractDocumentMetadata(out.content);
  assert.equal(meta.properties.doc_id, "my-doc");
  assert.equal(meta.body.trim(), "# Titel\n\nInhoud.");
});

test("resolveRedirectTarget reads legacy redirect metadata", () => {
  const legacy = `<!-- ioms-corpus-meta
type: "redirect"
moved_to: "02-projecten/dhl/Notes.md"
-->
`;
  assert.equal(resolveRedirectTarget(legacy), "02-projecten/dhl/Notes.md");
});

test("heuristicClassifyDocument routes DHL content to project folder", () => {
  const manifest = {
    entries: [
      {
        path: "02-projecten/dhl/SLA.md",
        title: "DHL SLA",
        preview: "Service level agreement DHL express",
        isRedirect: false,
      },
    ],
  };
  const result = heuristicClassifyDocument({
    content: "# DHL governance\n\nBespreking SLA en Sentinel pilot met Aurelie.",
    relPath: "00-inbox/DHL governance.md",
    manifest,
    routingRules: null,
  });
  assert.ok(result.targetPath?.startsWith("02-projecten/"));
  assert.ok(result.confidence >= 0.5);
});

test("moveCorpusDocument removes inbox source and writes hidden metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-organizer-"));
  try {
    const inbox = path.join(dir, "00-inbox");
    fs.mkdirSync(inbox, { recursive: true });
    fs.mkdirSync(path.join(dir, "02-projecten", "dhl"), { recursive: true });
    const fromRel = "00-inbox/Test_DHL.md";
    fs.writeFileSync(path.join(dir, fromRel), "# DHL test\n\nInhoud.", "utf8");

    const moved = moveCorpusDocument({
      markdownDir: dir,
      fromPath: fromRel,
      toPath: "02-projecten/dhl/Test_DHL.md",
    });
    assert.equal(moved.ok, true);
    assert.equal(moved.sourceRemoved, true);
    assert.equal(fs.existsSync(path.join(dir, fromRel)), false);
    const target = fs.readFileSync(path.join(dir, moved.toPath), "utf8");
    assert.match(target, /<!--[\s\S]*ioms-corpus-meta/);
    assert.match(target, /# DHL test/);
    assert.doesNotMatch(target, /^---/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("corpus organizer moves inbox file when confidence threshold met", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-organizer-run-"));
  try {
    fs.mkdirSync(path.join(dir, "00-inbox"), { recursive: true });
    fs.mkdirSync(path.join(dir, "02-projecten", "dhl"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "02-projecten/dhl/Referentie.md"),
      "# DHL referentie\n\nBestaand projectdocument.",
      "utf8",
    );
    const inboxFile = "00-inbox/DHL_Governance_meeting.md";
    fs.writeFileSync(
      path.join(dir, inboxFile),
      "# DHL governance meeting\n\nAfspraken over SLA en Sentinel pilot.",
      "utf8",
    );

    const organizer = createCorpusOrganizer({
      markdownDir: dir,
      classifyDocument: null,
      readManifest: () => ({
        entries: [
          {
            path: "02-projecten/dhl/Referentie.md",
            title: "DHL referentie",
            preview: "DHL SLA Sentinel",
            isRedirect: false,
          },
        ],
      }),
    });
    organizer.updateConfig({ classifyWithLlm: false, autoMoveConfidence: 0.5 });

    const result = await organizer.organizeFile(inboxFile, { runId: "test" });
    assert.equal(result.status, "moved");
    assert.ok(result.move?.toPath?.includes("02-projecten/"));
    assert.equal(fs.existsSync(path.join(dir, inboxFile)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveCanonicalDocumentPath finds moved document via alias or doc_id", () => {
  const manifest = {
    entries: [
      {
        path: "02-projecten/dhl/Notes.md",
        docId: "draft-abc",
        aliases: ["00-inbox/_draft-old.md"],
        isRedirect: false,
      },
    ],
  };
  assert.equal(resolveCanonicalDocumentPath(manifest, "00-inbox/_draft-old.md"), "02-projecten/dhl/Notes.md");
  const emptyDraft = ensureCorpusMetaComment("", "draft-abc", { status: "draft" }).content;
  assert.equal(
    resolveCanonicalDocumentPath(manifest, "00-inbox/_draft-new.md", emptyDraft),
    "02-projecten/dhl/Notes.md",
  );
});

test("searchCorpusManifests ranks doc_id and title matches", () => {
  const payload = searchCorpusManifests("DHL SLA governance", [
    {
      scope: "working",
      manifest: {
        entries: [
          {
            path: "02-projecten/dhl/SLA.md",
            docId: "dhl-sla",
            aliases: [],
            title: "DHL SLA governance",
            preview: "Reactietijden",
            tags: [],
          },
          {
            path: "99-prive/recept.md",
            docId: null,
            aliases: [],
            title: "Chana Masala",
            preview: "Kikkererwten",
            tags: [],
          },
        ],
      },
    },
  ]);
  assert.equal(payload.results[0]?.path, "02-projecten/dhl/SLA.md");
});

test("isWorkDraftPath detects inbox draft filenames", () => {
  assert.equal(isWorkDraftPath("00-inbox/_draft-abc.md"), true);
  assert.equal(isWorkDraftPath("00-inbox/Concept.md"), false);
});

test("isDraftContentReadyForOrganize waits for meaningful body", () => {
  const empty = ensureCorpusMetaComment("", "x");
  assert.equal(isDraftContentReadyForOrganize(empty.content), false);
  const ready = ensureCorpusMetaComment(
    "# Gesprek met klant\n\nWe bespraken SLA, monitoring en vervolgstappen voor volgende week.",
    "x",
  );
  assert.equal(isDraftContentReadyForOrganize(ready.content), true);
});

test("writeWorkDocumentDraft creates empty inbox draft", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ioms-draft-"));
  try {
    const created = writeWorkDocumentDraft({ markdownDir: dir, content: "" });
    assert.equal(created.ok, true);
    assert.match(created.path, /^00-inbox\/_draft-.+\.md$/);
    const full = path.join(dir, ...created.path.split("/"));
    assert.ok(fs.existsSync(full));
    assert.equal(isDraftContentReadyForOrganize(created.content), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
