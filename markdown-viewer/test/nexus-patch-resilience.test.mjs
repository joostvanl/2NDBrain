import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExactPatchesResilient,
  applySectionScopedPatches,
  countPatchFindOccurrences,
  dedupePatchChanges,
  isPatchAlreadySatisfied,
  normalizePatchTypography,
} from "../server/nexus/nexus-patch.mjs";

const normalize = (s) => String(s).replace(/\r\n/g, "\n").normalize("NFC");

test("applyExactPatchesResilient applies multiple non-overlapping patches sequentially", () => {
  const md = "# Titel\n\nEerste alinea.\n\nTweede alinea.";
  const next = applyExactPatchesResilient(
    md,
    [
      { find: "Eerste alinea.", replace: "Eerste alinea (bijgewerkt)." },
      { find: "Tweede alinea.", replace: "Tweede alinea (bijgewerkt)." },
    ],
    { normalizeForPatchMatch: normalize },
  );
  assert.match(next, /Eerste alinea \(bijgewerkt\)/);
  assert.match(next, /Tweede alinea \(bijgewerkt\)/);
});

test("applyExactPatchesResilient skips duplicate find in batch after first patch", () => {
  const md = "Status: concept";
  const next = applyExactPatchesResilient(
    md,
    [
      { find: "concept", replace: "definitief" },
      { find: "concept", replace: "definitief" },
    ],
    { normalizeForPatchMatch: normalize },
  );
  assert.equal(next, "Status: definitief");
});

test("applyExactPatchesResilient skips already-satisfied patch", () => {
  const md = "Status: definitief";
  const next = applyExactPatchesResilient(
    md,
    [{ find: "concept", replace: "definitief" }],
    { normalizeForPatchMatch: normalize },
  );
  assert.equal(next, md);
});

test("applyExactPatchesResilient matches smart quotes and typography", () => {
  const md = "Hij zei \u201challo\u201d en ging door.";
  const next = applyExactPatchesResilient(
    md,
    [{ find: 'Hij zei "hallo"', replace: "Hij zei \u201cdag\u201d" }],
    { normalizeForPatchMatch: normalize },
  );
  assert.match(next, /\u201cdag\u201d/);
});

test("countPatchFindOccurrences finds trimmed trailing whitespace variant", () => {
  const md = "Regel met tekst   \nVolgende regel";
  const { count, needle } = countPatchFindOccurrences(md, "Regel met tekst\nVolgende regel", normalize);
  assert.equal(count, 1);
  assert.ok(needle);
});

test("dedupePatchChanges removes exact duplicates", () => {
  const out = dedupePatchChanges([
    { find: "a", replace: "b" },
    { find: "a", replace: "b" },
    { find: "c", replace: "d" },
  ]);
  assert.equal(out.length, 2);
});

test("coerce replaceAll when find occurs multiple times", () => {
  const md = "foo bar foo";
  const next = applyExactPatchesResilient(
    md,
    [{ find: "foo", replace: "baz" }],
    { normalizeForPatchMatch: normalize, coerceReplaceAll: true },
  );
  assert.equal(next, "baz bar baz");
});

test("normalizePatchTypography maps ellipsis", () => {
  assert.equal(normalizePatchTypography("wacht…"), "wacht...");
});

test("isPatchAlreadySatisfied detects prior replacement", () => {
  const md = "nieuwe tekst";
  assert.equal(
    isPatchAlreadySatisfied(md, { find: "oude tekst", replace: "nieuwe tekst" }, normalize),
    true,
  );
});

test("applySectionScopedPatches still scopes to one section", () => {
  const md = "# Doc\n\n## Event Management\nOld text\n\n## Other\nOld text";
  const next = applySectionScopedPatches(
    md,
    [{ sectionId: "Event Management", find: "Old text", replace: "New text" }],
    { normalizeForPatchMatch: normalize },
  );
  assert.match(next, /## Event Management\nNew text/);
  assert.match(next, /## Other\nOld text/);
});
