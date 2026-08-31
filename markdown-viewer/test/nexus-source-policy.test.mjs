import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourceConflicts, sourceTierForPath } from "../server/nexus/nexus-source-policy.mjs";

test("sourceTierForPath ranks SLA above experiment", () => {
  assert.ok(sourceTierForPath("01-managed-services/SLA Standaarden/iO Pro SLA.md") > sourceTierForPath("90-experiments-en-test/x.md"));
});

test("resolveSourceConflicts marks lower tier as possiblyStale", () => {
  const { evidence, conflicts } = resolveSourceConflicts([
    {
      claim: "responstijd p1",
      path: "01-managed-services/SLA Standaarden/iO Pro SLA.md",
      excerpt: "15 minuten",
      sourceType: "corpus",
    },
    {
      claim: "responstijd p1",
      path: "90-experiments-en-test/notitie.md",
      excerpt: "10 minuten",
      sourceType: "corpus",
    },
  ]);
  assert.ok(conflicts.length >= 1);
  const stale = evidence.find((e) => e.path.includes("90-experiments"));
  assert.equal(stale?.possiblyStale, true);
});
