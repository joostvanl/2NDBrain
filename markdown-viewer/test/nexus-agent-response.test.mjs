import test from "node:test";
import assert from "node:assert/strict";
import {
  extractJsonLikeStringField,
  normalizeReviewAgentLlmPayload,
  recoverReviewAgentChanges,
} from "../server/nexus/nexus-agent-response.mjs";

function parseAgentJsonResponse(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  return JSON.parse(trimmed);
}

const helpers = { parseAgentJsonResponse };

test("recoverReviewAgentChanges hoists changes from JSON reply string", () => {
  const replace = "# Gesprek\\n\\n## Samenvatting\\nTekst.";
  const parsed = {
    changes: [],
    reply: `{"changes":[{"find":"","replace":"${replace}"}]}`,
  };
  const changes = recoverReviewAgentChanges(parsed, "", helpers);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].find, "");
  assert.match(changes[0].replace, /# Gesprek/);
});

test("recoverReviewAgentChanges extracts replace from truncated JSON in prose reply", () => {
  const parsed = {
    changes: [],
    reply:
      "Ik heb het verslag klaar.\n\n```json\n{\"changes\":[{\"find\":\"\",\"replace\":\"# Titel\\n\\nInhoud.\"}",
  };
  const changes = recoverReviewAgentChanges(parsed, "", helpers);
  assert.equal(changes.length, 1);
  assert.match(changes[0].replace, /# Titel/);
});

test("normalizeReviewAgentLlmPayload strips JSON envelope from chat reply", () => {
  const parsed = {
    changes: [],
    reply: '{"changes":[{"find":"","replace":"# Verslag\\n\\nBody."}]}',
  };
  const out = normalizeReviewAgentLlmPayload(parsed, "", helpers);
  assert.equal(out.changes.length, 1);
  assert.ok(!out.reply.startsWith("{"));
  assert.match(out.changes[0].replace, /# Verslag/);
});

test("extractJsonLikeStringField reads long escaped replace", () => {
  const text = '{"find":"","replace":"# Kop\\n\\nRegel met \\"quotes\\"."}';
  const replace = extractJsonLikeStringField(text, "replace");
  assert.match(replace, /# Kop/);
  assert.match(replace, /quotes/);
});
