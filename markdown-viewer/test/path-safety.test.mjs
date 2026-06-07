import test from "node:test";
import assert from "node:assert/strict";
import {
  safeDocxDownloadName,
  safeDocxTemplateName,
  safeFolderPath,
  safeMarkdownName,
  safeMarkdownPath,
  safeMemoryMarkdownPath,
  safeTemplateName,
  suggestedMdNameFromDocxUpload,
} from "../server/path-safety.mjs";

test("safeMarkdownName only accepts basename markdown files", () => {
  assert.equal(safeMarkdownName("Note.md"), "Note.md");
  assert.equal(safeMarkdownName("folder/Note.md"), null);
  assert.equal(safeMarkdownName("../Note.md"), null);
  assert.equal(safeMarkdownName("Note.txt"), null);
});

test("safeMarkdownPath normalizes nested markdown paths and rejects traversal", () => {
  assert.equal(safeMarkdownPath("Project\\Plan.md"), "Project/Plan.md");
  assert.equal(safeMarkdownPath(" Project/Plan.md "), "Project/Plan.md");
  assert.equal(safeMarkdownPath("/Project/Plan.md"), null);
  assert.equal(safeMarkdownPath("Project/../Plan.md"), null);
  assert.equal(safeMarkdownPath("Project/.hidden/Plan.md"), null);
  assert.equal(safeMarkdownPath("Project/Plan?.md"), null);
  assert.equal(safeMarkdownPath("Project/Plan.txt"), null);
});

test("safeMemoryMarkdownPath strips supported memory prefixes", () => {
  assert.equal(safeMemoryMarkdownPath("Files/.memory/personen/Joost.md"), "personen/Joost.md");
  assert.equal(safeMemoryMarkdownPath(".memory\\onderwerpen\\Project.md"), "onderwerpen/Project.md");
  assert.equal(safeMemoryMarkdownPath("onderwerpen/Project.md"), "onderwerpen/Project.md");
  assert.equal(safeMemoryMarkdownPath("Files/werkdocument.md"), "werkdocument.md");
  assert.equal(safeMemoryMarkdownPath(".memory/.mv-index/README.md"), null);
});

test("safeFolderPath accepts root and nested folders but rejects hidden or unsafe segments", () => {
  assert.equal(safeFolderPath(""), "");
  assert.equal(safeFolderPath("/01-managed-services/DAP/"), "01-managed-services/DAP");
  assert.equal(safeFolderPath("01-managed-services\\.archive"), null);
  assert.equal(safeFolderPath("../Files"), null);
  assert.equal(safeFolderPath("Folder<Name"), null);
});

test("safeTemplateName and safeDocxTemplateName only accept safe basenames", () => {
  assert.equal(safeTemplateName("default.json"), "default.json");
  assert.equal(safeTemplateName("nested/default.json"), null);
  assert.equal(safeTemplateName("default.md"), null);

  assert.equal(safeDocxTemplateName("Template 1.docx"), "Template 1.docx");
  assert.equal(safeDocxTemplateName("Template/1.docx"), null);
  assert.equal(safeDocxTemplateName("Template.doc"), null);
  assert.equal(safeDocxTemplateName("Template?.docx"), null);
});

test("DOCX upload and download names are converted to safe filenames", () => {
  assert.equal(suggestedMdNameFromDocxUpload("Proposal.docx"), "Proposal.md");
  assert.equal(suggestedMdNameFromDocxUpload("C:\\tmp\\Proposal.docx"), "Proposal.md");
  assert.match(suggestedMdNameFromDocxUpload("bad?.docx"), /^Geimporteerd-\d+\.md$/);

  assert.equal(safeDocxDownloadName("Offer", "fallback.docx"), "Offer.docx");
  assert.equal(safeDocxDownloadName("Folder\\Offer.docx", "fallback.docx"), "Offer.docx");
  assert.equal(safeDocxDownloadName("Bad?.docx", "fallback.docx"), "fallback.docx");
});
