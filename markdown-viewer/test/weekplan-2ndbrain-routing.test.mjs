import test from "node:test";
import assert from "node:assert/strict";

// Inline mirrors of server routing helpers (keep in sync with index.mjs)
function looksLikeOutlookToolRequest(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  const outlookSignal = /\b(outlook|agenda|kalender|calendar|2ndbrain)\b/.test(text);
  const actionSignal =
    /\b(plan|planning|plannen|verwerk|verwerken|zet|maak|aanmaken|schrijf|toevoegen|blok|focusblok|afspraak|afspraken|vul|vullen|aanvul|aanvullen)\b/.test(
      text,
    );
  return outlookSignal && actionSignal;
}

function isWeekPlan2ndbrainRequest(promptMacroId, message) {
  if (promptMacroId === "weekplan-2ndbrain") return true;
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  return looksLikeOutlookToolRequest(message) && /\b(2ndbrain|weekplan|week\s*vullen|focusblok(?:en)?)\b/.test(text);
}

test("isWeekPlan2ndbrainRequest detects prompt macro id", () => {
  assert.equal(isWeekPlan2ndbrainRequest("weekplan-2ndbrain", "hallo"), true);
});

test("isWeekPlan2ndbrainRequest detects outlook fill phrasing", () => {
  const msg = "vul mijn Outlook-agenda 2ndbrain met afspraken voor de werkweek";
  assert.equal(isWeekPlan2ndbrainRequest("", msg), true);
  assert.equal(looksLikeOutlookToolRequest(msg), true);
});

test("looksLikeOutlookToolRequest matches vullen on agenda", () => {
  assert.equal(
    looksLikeOutlookToolRequest("Vul de 2ndbrain agenda met focusblokken"),
    true,
  );
});
