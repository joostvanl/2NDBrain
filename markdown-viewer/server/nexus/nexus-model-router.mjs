/**
 * Auto model-router: kiest per LLM-fase het beste model uit de catalogus.
 */

import {
  buildModelCatalog,
  phaseLabelNl,
  scoreModelForPhase,
} from "./nexus-model-catalog.mjs";
import {
  getLearnedScore,
  shouldExplore,
} from "./nexus-model-learning.mjs";

export const AUTO_MODEL_SENTINEL = "auto";

export function isAutoModel(model) {
  return String(model || "").trim().toLowerCase() === AUTO_MODEL_SENTINEL;
}

export function readModelRouterConfig(agentConfig = {}) {
  const router = agentConfig.modelRouter && typeof agentConfig.modelRouter === "object" ? agentConfig.modelRouter : {};
  return {
    explorationRate: router.explorationRate,
    enableStrategyPhase: router.enableStrategyPhase !== false,
    exploreReview: router.exploreReview === true,
  };
}

export function shouldRunStrategyPhase(context = {}, routerConfig = {}) {
  if (routerConfig.enableStrategyPhase === false) return false;
  const profile = context.intentProfile || context.intent?.profile;
  if (!["research", "planning"].includes(profile)) return false;
  const messageLen = String(context.message || "").length;
  if (context.corpusWide && messageLen > 40) return true;
  if (messageLen > 120) return true;
  if (context.optionalSourceHints?.length > 1) return true;
  return false;
}

function rankModelsForPhase(catalog, phase, context = {}) {
  const intentProfile = context.intentProfile || context.intent?.profile || "any";
  return catalog
    .map((entry) => {
      const capability = scoreModelForPhase(entry, phase, context);
      const learned = getLearnedScore(entry.id, phase, intentProfile);
      return {
        entry,
        score: capability + learned,
        reasonParts: [
          `fit=${capability.toFixed(1)}`,
          learned ? `learned=+${learned.toFixed(2)}` : null,
          `${intentProfile}-profiel`,
        ].filter(Boolean),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectModelForPhase(catalog, phase, context = {}, routerConfig = {}) {
  if (!catalog?.length) {
    return { model: "", reason: "Geen modellen in catalogus", experiment: false };
  }
  const ranked = rankModelsForPhase(catalog, phase, context);
  let pickIndex = 0;
  let experiment = false;
  if (ranked.length > 1 && shouldExplore(phase, undefined, routerConfig)) {
    pickIndex = Math.min(2, ranked.length - 1);
    experiment = true;
  }
  const chosen = ranked[pickIndex];
  return {
    model: chosen.entry.id,
    reason: `${phaseLabelNl(phase)}: ${chosen.reasonParts.join(", ")}`,
    experiment,
    score: chosen.score,
    modelMeta: chosen.entry,
  };
}

export function resolveLlmConfig(baseConfig, phase, context = {}, catalog = []) {
  const config = { ...baseConfig };
  if (!isAutoModel(config.model)) {
    return {
      ...config,
      modelMode: "fixed",
      modelRole: phase,
      modelReason: "Vast model gekozen in instellingen",
      experiment: false,
    };
  }
  const routerConfig = readModelRouterConfig(baseConfig);
  let activeCatalog = catalog;
  if (!activeCatalog.length && config.fallbackModel) {
    activeCatalog = buildModelCatalog([config.fallbackModel]);
  }
  if (!activeCatalog.length) {
    throw new Error(
      "Auto-modus vereist een modelcatalogus. Laad modellen via Instellingen → Modellen laden, of zet een vast model.",
    );
  }
  const selection = selectModelForPhase(activeCatalog, phase, context, routerConfig);
  return {
    ...config,
    model: selection.model,
    modelMode: "auto",
    modelRole: phase,
    modelReason: selection.reason,
    experiment: selection.experiment,
    modelMeta: selection.modelMeta,
  };
}

export function createModelTrace() {
  const entries = [];
  return {
    entries,
    add(phase, model, ms, extra = {}) {
      entries.push({
        phase,
        model,
        ms: Number.isFinite(ms) ? Math.round(ms) : undefined,
        ...extra,
      });
    },
    summary() {
      return entries.map((e) => `${phaseLabelNl(e.phase)}: ${e.model}`).join(" → ");
    },
  };
}

export async function getOrBuildCatalog(fetchModelsFn) {
  const ids = await fetchModelsFn();
  return buildModelCatalog(ids);
}

export function publicRouterPayload(agentConfig = {}) {
  const auto = isAutoModel(agentConfig.model);
  return {
    modelMode: auto ? "auto" : "fixed",
    autoRouterEnabled: auto,
    modelRouter: readModelRouterConfig(agentConfig),
  };
}
