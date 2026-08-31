/**
 * Modelcatalogus: verrijkt provider-model-IDs met capabilities voor de Auto-router.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
export const MODEL_CATALOG_OVERRIDES_PATH =
  process.env.MODEL_CATALOG_OVERRIDES_PATH || path.join(ROOT_DIR, "model-catalog.overrides.json");

export const LLM_PHASES = ["strategy", "retrieval", "synthesis", "review", "simple", "utility"];

const REASONING_STRONG = /\b(o1|o3|opus|sonnet-4|gpt-4o(?!-mini)|gpt-4\.1|gpt-5|claude-3-5-sonnet|claude-sonnet-4|deepseek-r1|reasoning)\b/i;
const REASONING_FAST = /\b(mini|nano|flash|lite|haiku|instant|3\.5-turbo|gpt-3\.5|small|fast)\b/i;
const TOOL_HINT = /\b(gpt-4o|gpt-4\.1|gpt-5|claude-3|claude-sonnet|gemini-2|mistral-large)\b/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function inferReasoningTier(id) {
  const lower = String(id || "").toLowerCase();
  if (REASONING_STRONG.test(lower)) return "strong";
  if (REASONING_FAST.test(lower)) return "fast";
  return "balanced";
}

function inferRelativeCost(id) {
  const tier = inferReasoningTier(id);
  if (tier === "fast") return 1;
  if (tier === "strong") return 4;
  if (/mini|nano|lite|haiku/i.test(id)) return 2;
  return 3;
}

function inferRelativeLatency(id) {
  const tier = inferReasoningTier(id);
  if (tier === "fast") return 1;
  if (tier === "strong") return 4;
  return 2;
}

function inferContextWindow(id) {
  const lower = String(id || "").toLowerCase();
  if (/128k|200k|1m|million/i.test(lower)) return 128000;
  if (/32k/i.test(lower)) return 32000;
  if (inferReasoningTier(id) === "strong") return 128000;
  if (inferReasoningTier(id) === "fast") return 16000;
  return 64000;
}

function inferToolCalling(id) {
  const lower = String(id || "").toLowerCase();
  if (/embed|whisper|tts|dall-e|image|audio/i.test(lower)) return false;
  if (TOOL_HINT.test(lower)) return true;
  if (REASONING_FAST.test(lower)) return true;
  return inferReasoningTier(id) !== "fast" || /gpt-4/i.test(lower);
}

function inferJsonReliability(id) {
  const tier = inferReasoningTier(id);
  if (tier === "strong") return 5;
  if (tier === "balanced") return 4;
  return 3;
}

function defaultPhaseAffinity(id) {
  const tier = inferReasoningTier(id);
  const cost = inferRelativeCost(id);
  const latency = inferRelativeLatency(id);
  const json = inferJsonReliability(id);
  const tools = inferToolCalling(id) ? 1 : 0;
  const strong = tier === "strong" ? 2 : tier === "balanced" ? 1 : 0;
  const fast = tier === "fast" ? 2 : latency <= 2 ? 1 : 0;
  return {
    strategy: strong * 2 + json * 0.3,
    retrieval: tools * 3 + fast * 2 + (5 - cost) * 0.4,
    synthesis: json * 1.2 + strong * 1.5,
    review: json * 1.5 + strong,
    simple: fast * 2 + json,
    utility: fast * 3 + (5 - cost),
  };
}

export function loadModelCatalogOverrides() {
  try {
    if (!fs.existsSync(MODEL_CATALOG_OVERRIDES_PATH)) return {};
    const data = JSON.parse(fs.readFileSync(MODEL_CATALOG_OVERRIDES_PATH, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function enrichModelCatalogEntry(modelId, overrides = loadModelCatalogOverrides()) {
  const id = String(modelId || "").trim();
  const override = overrides[id] && typeof overrides[id] === "object" ? overrides[id] : {};
  const base = {
    id,
    toolCalling: inferToolCalling(id),
    jsonReliability: inferJsonReliability(id),
    reasoningTier: inferReasoningTier(id),
    relativeCost: inferRelativeCost(id),
    relativeLatency: inferRelativeLatency(id),
    contextWindow: inferContextWindow(id),
    phaseAffinity: defaultPhaseAffinity(id),
  };
  if (override.reasoningTier) base.reasoningTier = override.reasoningTier;
  if (typeof override.toolCalling === "boolean") base.toolCalling = override.toolCalling;
  if (typeof override.jsonReliability === "number") base.jsonReliability = override.jsonReliability;
  if (typeof override.relativeCost === "number") base.relativeCost = override.relativeCost;
  if (typeof override.relativeLatency === "number") base.relativeLatency = override.relativeLatency;
  if (typeof override.contextWindow === "number") base.contextWindow = override.contextWindow;
  if (override.phaseAffinity && typeof override.phaseAffinity === "object") {
    base.phaseAffinity = { ...base.phaseAffinity, ...override.phaseAffinity };
  }
  if (override.label) base.label = String(override.label);
  return base;
}

export function buildModelCatalog(modelIds, overrides = loadModelCatalogOverrides()) {
  const unique = Array.from(new Set((modelIds || []).map((m) => String(m || "").trim()).filter(Boolean)));
  return unique.map((id) => enrichModelCatalogEntry(id, overrides)).sort((a, b) => a.id.localeCompare(b.id));
}

export function catalogSummaryForPrompt(catalog, max = 12) {
  return catalog
    .slice(0, max)
    .map(
      (m) =>
        `${m.id}: tier=${m.reasoningTier}, tools=${m.toolCalling}, json=${m.jsonReliability}, cost=${m.relativeCost}`,
    )
    .join("; ");
}

export function phaseLabelNl(phase) {
  const map = {
    strategy: "strategie",
    retrieval: "ophalen",
    synthesis: "antwoord",
    review: "review",
    simple: "vraag",
    utility: "hulp",
  };
  return map[phase] || phase;
}

export function scoreModelForPhase(entry, phase, context = {}) {
  const affinity = entry?.phaseAffinity?.[phase] ?? 0;
  let score = affinity;
  if (phase === "retrieval" && entry.toolCalling) score += 2;
  if (phase === "retrieval" && !entry.toolCalling) score -= 5;
  if ((phase === "synthesis" || phase === "review") && entry.jsonReliability >= 4) score += 1;
  if (context.contextChars > 50000 && entry.contextWindow >= 100000) score += 1;
  if (context.contextChars > 100000 && entry.contextWindow < 50000) score -= 2;
  return score;
}

export { clamp };
