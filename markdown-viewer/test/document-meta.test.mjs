import assert from "node:assert/strict";
import test from "node:test";
import {
  extractHiddenDocumentPrefix,
  isWorkDraftPath,
  mergeHiddenDocumentPrefix,
  stripHiddenDocumentPrefix,
} from "../src/document-meta.ts";

test("extractHiddenDocumentPrefix reads corpus meta comment", () => {
  const md = "<!--\nioms-corpus-meta\ndoc_id: \"x\"\n-->\n\n# Titel";
  assert.match(extractHiddenDocumentPrefix(md), /ioms-corpus-meta/);
  assert.equal(stripHiddenDocumentPrefix(md), "# Titel");
});

test("mergeHiddenDocumentPrefix restores meta on editor export", () => {
  const prefix = extractHiddenDocumentPrefix("<!--\nioms-corpus-meta\nstatus: draft\n-->\n");
  const merged = mergeHiddenDocumentPrefix(prefix, "# Gesprek\n\nInhoud.");
  assert.match(merged, /ioms-corpus-meta/);
  assert.match(merged, /# Gesprek/);
});

test("isWorkDraftPath detects inbox drafts", () => {
  assert.equal(isWorkDraftPath("00-inbox/_draft-abc.md"), true);
  assert.equal(isWorkDraftPath("02-projecten/x.md"), false);
});
