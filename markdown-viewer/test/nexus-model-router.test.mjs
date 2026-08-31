import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelCatalog,
  enrichModelCatalogEntry,
  scoreModelForPhase,
} from "../server/nexus/nexus-model-catalog.mjs";
import {
  isAutoModel,
  resolveLlmConfig,
  selectModelForPhase,
  shouldRunStrategyPhase,
} from "../server/nexus/nexus-model-router.mjs";
import { getLearnedScore, recordModelRouterEvent } from "../server/nexus/nexus-model-learning.mjs";

test("enrichModelCatalogEntry infers capabilities from model id", () => {
  const mini = enrichModelCatalogEntry("gpt-4o-mini");
  const strong = enrichModelCatalogEntry("claude-opus-4");
  assert.equal(mini.reasoningTier, "fast");
  assert.equal(mini.toolCalling, true);
  assert.equal(strong.reasoningTier, "strong");
  assert.ok(mini.phaseAffinity.retrieval > 0);
});

test("buildModelCatalog dedupes and sorts", () => {
  const catalog = buildModelCatalog(["z-model", "a-model", "a-model"], {});
  assert.deepEqual(catalog.map((m) => m.id), ["a-model", "z-model"]);
});

test("isAutoModel detects auto sentinel", () => {
  assert.equal(isAutoModel("auto"), true);
  assert.equal(isAutoModel("gpt-4o-mini"), false);
});

test("resolveLlmConfig keeps fixed model unchanged", () => {
  const resolved = resolveLlmConfig(
    { model: "gpt-4o-mini", apiKey: "x", endpoint: "https://api.example.com" },
    "retrieval",
    {},
    buildModelCatalog(["gpt-4o-mini", "gpt-4o"]),
  );
  assert.equal(resolved.model, "gpt-4o-mini");
  assert.equal(resolved.modelMode, "fixed");
});

test("resolveLlmConfig picks per phase when auto", () => {
  const catalog = buildModelCatalog(["gpt-4o-mini", "claude-opus-4", "gpt-4o"]);
  const base = { model: "auto", apiKey: "x", endpoint: "https://api.example.com" };
  const retrieval = resolveLlmConfig(base, "retrieval", { intentProfile: "research" }, catalog);
  const synthesis = resolveLlmConfig(base, "synthesis", { intentProfile: "research" }, catalog);
  assert.equal(retrieval.modelMode, "auto");
  assert.ok(retrieval.model);
  assert.ok(synthesis.model);
});

test("selectModelForPhase prefers tool-calling models for retrieval", () => {
  const catalog = buildModelCatalog(["text-embedding-3-small", "gpt-4o-mini"]);
  const pick = selectModelForPhase(catalog, "retrieval", {}, { explorationRate: 0 });
  assert.equal(pick.model, "gpt-4o-mini");
});

test("shouldRunStrategyPhase for research corpus-wide", () => {
  assert.equal(
    shouldRunStrategyPhase({ intentProfile: "research", corpusWide: true, message: "x".repeat(50) }, {}),
    true,
  );
  assert.equal(shouldRunStrategyPhase({ intentProfile: "document-edit", corpusWide: true }, {}), false);
});

test("recordModelRouterEvent updates learned score", () => {
  recordModelRouterEvent({
    runId: "test",
    phase: "retrieval",
    model: "test-model-router",
    intentProfile: "research",
    outcome: "success",
    llmMs: 100,
  });
  const score = getLearnedScore("test-model-router", "retrieval", "research");
  assert.ok(score > 0);
});

test("scoreModelForPhase penalizes non-tool models for retrieval", () => {
  const withTools = enrichModelCatalogEntry("gpt-4o-mini");
  const noTools = { ...enrichModelCatalogEntry("text-embedding-3-small"), toolCalling: false };
  assert.ok(scoreModelForPhase(withTools, "retrieval") > scoreModelForPhase(noTools, "retrieval"));
});
