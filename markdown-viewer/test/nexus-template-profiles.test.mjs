import test from "node:test";
import assert from "node:assert/strict";
import { detectTemplateProfile, getTemplateChecklist } from "../server/nexus/nexus-template-profiles.mjs";

test("detectTemplateProfile matches DAP template", () => {
  const md = "# DAP\n\n## Event Management\n...\n\n## Availability\nRTO 4h";
  const profile = detectTemplateProfile("01-managed-services/DAP template/Example.md", md);
  assert.equal(profile?.id, "dap");
});

test("getTemplateChecklist returns prompt block", () => {
  const md = "# SLA\n\n## KPI\n...\n\n## Responstijd\n...";
  const checklist = getTemplateChecklist("01-managed-services/SLA Standaarden/iO Pro SLA.md", md);
  assert.ok(checklist?.promptBlock.includes("Template-checklist"));
});
