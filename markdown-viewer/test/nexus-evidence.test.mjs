import test from "node:test";
import assert from "node:assert/strict";
import {
  extractStructuredToolContext,
  formatEvidenceFooter,
  normalizeEvidenceItem,
} from "../server/nexus/nexus-evidence.mjs";

test("extractStructuredToolContext parses evidence and assumptions", () => {
  const structured = extractStructuredToolContext({
    reply: "Antwoord",
    evidence: [{ path: "01-managed-services/SLA.md", sourceType: "corpus", excerpt: "P1 binnen 15 min" }],
    assumptions: [{ claim: "Klant wil Pro SLA", derivedFrom: ["e-mailmemory"] }],
  });
  assert.equal(structured.reply, "Antwoord");
  assert.equal(structured.evidence.length, 1);
  assert.equal(structured.assumptions.length, 1);
});

test("formatEvidenceFooter stays compact", () => {
  const footer = formatEvidenceFooter({
    evidence: [normalizeEvidenceItem({ path: "a.md", sourceType: "corpus", excerpt: "tekst" })],
    assumptions: [{ claim: "Aanname", derivedFrom: ["a.md"] }],
  });
  assert.match(footer, /Gebruikte bronnen/);
  assert.ok(footer.split("\n").length <= 12);
});
