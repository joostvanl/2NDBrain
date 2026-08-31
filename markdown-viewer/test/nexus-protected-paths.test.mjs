import test from "node:test";
import assert from "node:assert/strict";
import { assertPatchAllowed } from "../server/nexus/nexus-protected-paths.mjs";

test("assertPatchAllowed blocks replaceAll on protected paths", () => {
  const result = assertPatchAllowed("01-managed-services/SLA Standaarden/iO Pro SLA.md", [
    { find: "foo", replace: "bar", replaceAll: true },
  ]);
  assert.equal(result.ok, false);
});

test("assertPatchAllowed requires rationale on protected paths", () => {
  const result = assertPatchAllowed("01-managed-services/DAP template/DAP Template.md", [
    { find: "foo", replace: "bar" },
  ]);
  assert.equal(result.ok, false);
});

test("assertPatchAllowed allows patch with rationale", () => {
  const result = assertPatchAllowed("01-managed-services/DAP template/DAP Template.md", [
    { find: "foo", replace: "bar", rationale: "KPI-tabel alignen met standaard" },
  ]);
  assert.equal(result.ok, true);
});
