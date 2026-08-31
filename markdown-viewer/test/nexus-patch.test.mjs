import test from "node:test";
import assert from "node:assert/strict";
import {
  applySectionScopedPatches,
  coerceAgentChangesForEmptyDocument,
  fillEmptyDocumentMarkdown,
  isEffectivelyEmptyDocumentMarkdown,
  resolveEmptyDocumentChanges,
  resolveSectionRange,
} from "../server/nexus/nexus-patch.mjs";
import { ensureCorpusMetaComment } from "../server/corpus-index.mjs";

test("resolveSectionRange finds section by heading", () => {
  const md = "# Doc\n\n## Event Management\nOld text\n\n## Other\nX";
  const range = resolveSectionRange(md, "Event Management");
  assert.ok(range);
  assert.match(range.text, /Old text/);
});

test("applySectionScopedPatches patches only target section", () => {
  const md = "# Doc\n\n## Event Management\nOld text\n\n## Other\nOld text";
  const next = applySectionScopedPatches(
    md,
    [{ sectionId: "Event Management", find: "Old text", replace: "New text" }],
    {
      normalizeForPatchMatch: (s) => s,
      applyExactPatches: (doc, changes) => {
        let out = doc;
        for (const c of changes) out = out.replace(c.find, c.replace);
        return out;
      },
    },
  );
  assert.match(next, /## Event Management\nNew text/);
  assert.match(next, /## Other\nOld text/);
});

test("isEffectivelyEmptyDocumentMarkdown ignores corpus meta comment", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  assert.equal(isEffectivelyEmptyDocumentMarkdown(emptyDraft), true);
  assert.equal(isEffectivelyEmptyDocumentMarkdown("# Titel\n\nInhoud"), false);
});

test("resolveEmptyDocumentChanges fills via empty find", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  const next = resolveEmptyDocumentChanges(emptyDraft, [
    { find: "", replace: "# Verslag\n\nEerste inhoud." },
  ]);
  assert.ok(next);
  assert.match(next, /ioms-corpus-meta/);
  assert.match(next, /status: "draft"/);
  assert.match(next, /# Verslag/);
  assert.match(next, /Eerste inhoud/);
});

test("resolveEmptyDocumentChanges fallback combines replace fields", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  const next = resolveEmptyDocumentChanges(
    emptyDraft,
    [{ find: "niet aanwezig", replace: "# Hoofd\n\nParagraaf." }],
    { mode: "fallback" },
  );
  assert.ok(next);
  assert.match(next, /# Hoofd/);
  assert.match(next, /Paragraaf/);
});

test("fillEmptyDocumentMarkdown preserves doc_id", () => {
  const emptyDraft = ensureCorpusMetaComment("", "draft-abc123", { status: "draft" }).content;
  const next = fillEmptyDocumentMarkdown(emptyDraft, "Body tekst");
  assert.match(next, /doc_id: "draft-abc123"/);
  assert.match(next, /Body tekst/);
});

test("coerceAgentChangesForEmptyDocument synthesizes from reply", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  const reply = "Hier is het verslag.\n\n# Gesprek met klant\n\n## Samenvatting\nKorte samenvatting van het gesprek.\n\n## Acties\n- Joost: follow-up sturen voor vrijdag";
  const changes = coerceAgentChangesForEmptyDocument(emptyDraft, [], reply);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].find, "");
  assert.match(changes[0].replace, /# Gesprek met klant/);
});

test("coerceAgentChangesForEmptyDocument leaves non-empty documents unchanged", () => {
  const md = "# Bestaand\n\nInhoud.";
  const changes = coerceAgentChangesForEmptyDocument(md, [], "# Nieuw\n\nTekst.");
  assert.deepEqual(changes, []);
});

test("coerceAgentChangesForEmptyDocument recovers body from JSON-wrapped reply (Claude)", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  const reply =
    'Ik heb het verslag klaar.\n\n```json\n{"changes":[{"find":"","replace":"# Gespreksverslag\\n\\n## Samenvatting\\nJoost en Rimante bespraken het Jira-proces en besloten over te stappen op Jira Service Desk voor SLA-timers."}]}\n```';
  const changes = coerceAgentChangesForEmptyDocument(emptyDraft, [], reply);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].find, "");
  assert.match(changes[0].replace, /# Gespreksverslag/);
  assert.match(changes[0].replace, /## Samenvatting/);
  assert.ok(!changes[0].replace.includes('"changes"'));
});

test("coerceAgentChangesForEmptyDocument recovers plain prose report without headings", () => {
  const emptyDraft = ensureCorpusMetaComment("", null, { status: "draft" }).content;
  const reply =
    "Joost en Rimante bespraken de inrichting van de service desk in Jira. De huidige omgeving komt uit een softwareontwikkelproject en past niet goed.\n\nAfspraak: overstappen op Jira Service Desk. Rimante werkt de voorstellen uit voor vrijdag en Joost stemt af met het team.";
  const changes = coerceAgentChangesForEmptyDocument(emptyDraft, [], reply);
  assert.equal(changes.length, 1);
  assert.match(changes[0].replace, /service desk/i);
});
