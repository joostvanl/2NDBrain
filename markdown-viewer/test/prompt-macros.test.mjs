import test from "node:test";
import assert from "node:assert/strict";

/** Mirror van server/index.mjs — alleen ontbrekende defaults toevoegen, nooit overschrijven. */
function mergeDefaultPromptMacros(macros, defaults) {
  const merged = [...(macros || [])];
  const existingIds = new Set(merged.map((m) => m?.id).filter(Boolean));
  for (const def of defaults) {
    if (!existingIds.has(def.id)) merged.push({ ...def });
  }
  return merged;
}

test("mergeDefaultPromptMacros bewaart gebruikerswijzigingen aan bestaande defaults", () => {
  const defaults = [
    { id: "meeting-report", name: "Default", prompt: "default prompt" },
    { id: "weekplan-2ndbrain", name: "Week", prompt: "week prompt" },
  ];
  const stored = [
    {
      id: "meeting-report",
      name: "Mijn verslag",
      prompt: "Aangepaste prompt van gebruiker",
    },
  ];
  const merged = mergeDefaultPromptMacros(stored, defaults);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].prompt, "Aangepaste prompt van gebruiker");
  assert.equal(merged[0].name, "Mijn verslag");
  assert.equal(merged[1].id, "weekplan-2ndbrain");
});

test("mergeDefaultPromptMacros voegt alleen ontbrekende defaults toe", () => {
  const defaults = [{ id: "new-macro", name: "Nieuw", prompt: "x" }];
  const merged = mergeDefaultPromptMacros([], defaults);
  assert.deepEqual(merged, defaults);
});
