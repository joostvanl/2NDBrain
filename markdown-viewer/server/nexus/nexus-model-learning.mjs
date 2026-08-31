/**
 * Zelflerend scoreboek voor de Auto model-router.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = process.env.MODEL_ROUTER_DATA_DIR || path.join(ROOT_DIR, "data");

export const MODEL_ROUTER_EVENTS_PATH =
  process.env.MODEL_ROUTER_EVENTS_PATH || path.join(DATA_DIR, "model-router-events.jsonl");
export const MODEL_ROUTER_SCORES_PATH =
  process.env.MODEL_ROUTER_SCORES_PATH || path.join(DATA_DIR, "model-router-scores.json");

const DEFAULT_EXPLORATION_RATE = Number(process.env.MODEL_ROUTER_EXPLORATION_RATE || 0.08) || 0.08;
const SCORE_WINDOW = 50;
const LEARNED_WEIGHT = 0.35;

let scoresCache = null;

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function scoreKey(phase, intentProfile, model) {
  return `${phase}\0${intentProfile || "any"}\0${model}`;
}

function loadScoresFile() {
  if (scoresCache) return scoresCache;
  try {
    if (!fs.existsSync(MODEL_ROUTER_SCORES_PATH)) {
      scoresCache = { version: 1, updatedAt: null, buckets: {} };
      return scoresCache;
    }
    scoresCache = JSON.parse(fs.readFileSync(MODEL_ROUTER_SCORES_PATH, "utf8"));
    if (!scoresCache.buckets) scoresCache.buckets = {};
    return scoresCache;
  } catch {
    scoresCache = { version: 1, updatedAt: null, buckets: {} };
    return scoresCache;
  }
}

function saveScoresFile() {
  if (!scoresCache) return;
  ensureParent(MODEL_ROUTER_SCORES_PATH);
  scoresCache.updatedAt = new Date().toISOString();
  fs.writeFileSync(MODEL_ROUTER_SCORES_PATH, JSON.stringify(scoresCache, null, 2), "utf8");
}

function outcomeDelta(outcome) {
  if (outcome === "success") return 1;
  if (outcome === "error") return -1;
  if (outcome === "retry") return -0.25;
  return 0;
}

function updateBucket(bucket, event) {
  const delta = outcomeDelta(event.outcome);
  const n = (bucket.count || 0) + 1;
  const prev = bucket.avgScore ?? 0;
  bucket.count = n;
  bucket.avgScore = prev + (delta - prev) / Math.min(n, SCORE_WINDOW);
  bucket.lastOutcome = event.outcome;
  bucket.lastAt = event.ts;
  if (event.experiment) bucket.experiments = (bucket.experiments || 0) + 1;
  if (typeof event.llmMs === "number") {
    bucket.avgLlmMs = bucket.avgLlmMs
      ? Math.round(bucket.avgLlmMs * 0.85 + event.llmMs * 0.15)
      : event.llmMs;
  }
}

export function getExplorationRate(configRouter = {}) {
  const raw = configRouter.explorationRate ?? DEFAULT_EXPLORATION_RATE;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(0.25, n)) : DEFAULT_EXPLORATION_RATE;
}

export function getLearnedScore(model, phase, intentProfile = "any") {
  const scores = loadScoresFile();
  const specific = scores.buckets[scoreKey(phase, intentProfile, model)];
  const generic = scores.buckets[scoreKey(phase, "any", model)];
  const s = specific?.avgScore ?? generic?.avgScore ?? 0;
  return s * LEARNED_WEIGHT;
}

export function recordModelRouterEvent(event) {
  const entry = {
    ts: new Date().toISOString(),
    runId: event.runId || "",
    phase: event.phase || "",
    model: event.model || "",
    intentProfile: event.intentProfile || "any",
    experiment: event.experiment === true,
    llmMs: Number.isFinite(event.llmMs) ? Math.round(event.llmMs) : undefined,
    tokenUsage: event.tokenUsage || undefined,
    toolCallCount: Number.isFinite(event.toolCallCount) ? event.toolCallCount : undefined,
    outcome: event.outcome || "success",
  };
  try {
    ensureParent(MODEL_ROUTER_EVENTS_PATH);
    fs.appendFileSync(MODEL_ROUTER_EVENTS_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* non-fatal */
  }
  const scores = loadScoresFile();
  const key = scoreKey(entry.phase, entry.intentProfile, entry.model);
  if (!scores.buckets[key]) scores.buckets[key] = { count: 0, avgScore: 0 };
  updateBucket(scores.buckets[key], entry);
  const anyKey = scoreKey(entry.phase, "any", entry.model);
  if (!scores.buckets[anyKey]) scores.buckets[anyKey] = { count: 0, avgScore: 0 };
  updateBucket(scores.buckets[anyKey], entry);
  saveScoresFile();
  return entry;
}

export function readModelRouterScores() {
  return loadScoresFile();
}

export function topModelsByPhase(phase, limit = 5) {
  const scores = loadScoresFile();
  const rows = [];
  for (const [key, bucket] of Object.entries(scores.buckets)) {
    const [p, intent, model] = key.split("\0");
    if (p !== phase) continue;
    rows.push({ model, intentProfile: intent, ...bucket });
  }
  return rows
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0) || (b.count || 0) - (a.count || 0))
    .slice(0, limit);
}

export function shouldExplore(phase, explorationRate, configRouter = {}) {
  if (phase === "review" && configRouter.exploreReview !== true) return false;
  return Math.random() < getExplorationRate(configRouter);
}

export function resetModelLearningCache() {
  scoresCache = null;
}
