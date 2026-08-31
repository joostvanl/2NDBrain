import fs from "node:fs";
import path from "node:path";

const GENERIC_NON_PROJECT_KEYS = new Set(
  [
    "meeting",
    "agenda",
    "confluence",
    "hr",
    "facturatie",
    "io",
    "intern",
    "algemeen",
    "planning",
    "administratie",
    "equipe",
    "ns zakelijk",
    "twilio",
  ].map(normalizeProjectKey),
);

const FOLDER_CANONICAL = {
  dhl: "DHL Express",
  "ocean cleanup": "The Ocean Cleanup",
  ocean_cleanup: "The Ocean Cleanup",
  "stanley stella": "Stanley Stella",
  "stanley-stella": "Stanley Stella",
  stl: "STL",
  "provincie zeeland": "Provincie Zeeland",
  superunie: "Superunie",
  knltb: "KNLTB",
  knmi: "KNMI",
  knhb: "KNHB",
  cgi: "CGI",
  nokia: "Nokia",
  natuurmonumenten: "Natuurmonumenten",
  firan: "Firan",
  thuisarts: "Thuisarts",
  "brussels airport": "Brussels Airport",
  bac: "BAC",
  evnia: "Evnia",
  euroconsumers: "Euroconsumers",
  alliander: "Alliander",
  sentinel: "Sentinel",
  zadkine: "Zadkine",
  "campus utrecht": "Campus Utrecht",
  "de verloskundige": "De Verloskundige",
  deverloskundige: "De Verloskundige",
  knov: "KNOV",
};

export function normalizeProjectKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromMemoryHeading(line) {
  const raw = String(line || "").trim();
  const hash = /^#\s+(.+)$/.exec(raw);
  const subject = hash?.[1] || raw;
  const cleaned = subject
    .replace(/\s*[–-]\s*project.*$/i, "")
    .replace(/\s*projectoverzicht.*$/i, "")
    .replace(/\s*&\s*releasestop.*$/i, "")
    .trim();
  return cleaned || "";
}

function readMemoryProjectTitles(memoryDir) {
  const dir = path.join(memoryDir, "onderwerpen");
  if (!fs.existsSync(dir)) return [];
  const titles = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/_project\.md$/i.test(entry.name)) continue;
    try {
      const content = fs.readFileSync(path.join(dir, entry.name), "utf8");
      const heading = content.match(/^#\s+.+$/m)?.[0] || "";
      const title = titleFromMemoryHeading(heading);
      if (!title || /^type:/i.test(title) || title.length < 2) continue;
      titles.push(title);
    } catch {
      // skip unreadable memory files
    }
  }
  return titles;
}

function readCorpusProjectFolders(markdownDir) {
  const dir = path.join(markdownDir, "02-projecten");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function canonicalFromFolderName(folderName) {
  const key = normalizeProjectKey(folderName);
  if (FOLDER_CANONICAL[key]) return FOLDER_CANONICAL[key];
  if (/^[a-z0-9]+$/.test(folderName) && folderName.length <= 6) return folderName.toUpperCase();
  return folderName.replace(/_/g, " ").trim();
}

function addEntry(registry, canonical, source = "manual") {
  const name = String(canonical || "").replace(/\s+/g, " ").trim();
  const key = normalizeProjectKey(name);
  if (!name || !key || GENERIC_NON_PROJECT_KEYS.has(key)) return;
  if (/^type:/i.test(name) || /^owner:/i.test(name)) return;
  if (!registry.byKey.has(key)) {
    registry.byKey.set(key, name);
    registry.entries.push({ canonical: name, key, source });
  }
  registry.aliasToCanonical.set(key, name);
}

function addAlias(registry, alias, canonical) {
  const canonicalName = registry.aliasToCanonical.get(normalizeProjectKey(canonical)) || canonical;
  const aliasKey = normalizeProjectKey(alias);
  if (!aliasKey || !canonicalName) return;
  registry.aliasToCanonical.set(aliasKey, canonicalName);
}

function buildAliasVariants(registry, canonical) {
  const key = normalizeProjectKey(canonical);
  addAlias(registry, key, canonical);
  addAlias(registry, key.replace(/\s+/g, "-"), canonical);
  addAlias(registry, key.replace(/\s+/g, ""), canonical);
  if (key.endsWith(" express")) {
    addAlias(registry, key.replace(/\s+express$/, ""), canonical);
  }
}

export function buildKanbanProjectRegistry(options = {}) {
  const memoryDir = options.memoryDir || "";
  const markdownDir = options.markdownDir || "";
  const existingProjects = Array.isArray(options.existingProjects) ? options.existingProjects : [];

  const registry = {
    entries: [],
    byKey: new Map(),
    aliasToCanonical: new Map(),
  };

  for (const [alias, canonical] of Object.entries(FOLDER_CANONICAL)) {
    addEntry(registry, canonical, "override");
    addAlias(registry, alias, canonical);
  }

  for (const title of readMemoryProjectTitles(memoryDir)) {
    addEntry(registry, title, "memory");
    buildAliasVariants(registry, title);
  }

  for (const folder of readCorpusProjectFolders(markdownDir)) {
    const canonical = canonicalFromFolderName(folder);
    addEntry(registry, canonical, "corpus");
    buildAliasVariants(registry, canonical);
    addAlias(registry, folder, canonical);
  }

  const usage = new Map();
  for (const project of existingProjects) {
    const trimmed = String(project || "").trim();
    if (!trimmed) continue;
    const key = normalizeProjectKey(trimmed);
    usage.set(key, (usage.get(key) || 0) + 1);
  }
  for (const [key, count] of usage.entries()) {
    if (registry.aliasToCanonical.has(key)) continue;
    if (count >= 1 && !GENERIC_NON_PROJECT_KEYS.has(key)) {
      const label = pickDisplayLabelForKey(key, existingProjects);
      if (label) {
        addEntry(registry, label, "kanban-usage");
        buildAliasVariants(registry, label);
      }
    }
  }

  registry.catalog = [...new Set(registry.entries.map((entry) => entry.canonical))].sort((a, b) => a.localeCompare(b, "nl"));
  return registry;
}

function pickDisplayLabelForKey(key, values) {
  const matches = values.filter((value) => normalizeProjectKey(value) === key);
  if (!matches.length) return "";
  const scored = matches.map((value) => ({
    value: String(value).trim(),
    score: String(value).trim().length + (/[A-Z]/.test(String(value)) ? 2 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value, "nl"));
  return scored[0]?.value || "";
}

export function formatProjectDisplayName(value) {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (/[A-Z]/.test(trimmed) && trimmed !== trimmed.toUpperCase()) return trimmed.slice(0, 160);
  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length <= 6 && /^[a-z0-9.-]+$/i.test(compact)) return compact.toUpperCase().slice(0, 160);
  return trimmed
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      if (word.length <= 3) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    .slice(0, 160);
}

export function registerDynamicProject(registry, name, source = "dynamic") {
  const formatted = formatProjectDisplayName(name);
  if (!formatted) return "";
  addEntry(registry, formatted, source);
  buildAliasVariants(registry, formatted);
  if (Array.isArray(registry.catalog) && !registry.catalog.includes(formatted)) {
    registry.catalog.push(formatted);
    registry.catalog.sort((a, b) => a.localeCompare(b, "nl"));
  }
  return formatted;
}

function inferProjectFromHints(hints = {}, registry) {
  const text = normalizeProjectKey(`${hints.title || ""} ${hints.summary || ""} ${hints.subject || ""}`);
  if (!text) return "";

  let best = "";
  let bestScore = 0;
  for (const entry of registry?.entries || []) {
    if (!entry.key || entry.key.length < 3) continue;
    const score = scoreProjectMatch(text, entry.key);
    if (score > bestScore) {
      bestScore = score;
      best = entry.canonical;
    }
    if (text.includes(entry.key)) {
      const score = Math.max(scoreProjectMatch(text, entry.key), 0.85);
      if (score > bestScore) {
        bestScore = score;
        best = entry.canonical;
      }
    }
  }
  if (bestScore >= 0.6) return best;

  const source = String(hints.title || hints.subject || "").trim();
  const dashMatch = /^([^:]+?)\s*(?:–|-)\s+/u.exec(source);
  if (dashMatch?.[1]) {
    const candidate = formatProjectDisplayName(dashMatch[1].trim());
    const candidateKey = normalizeProjectKey(candidate);
    if (candidate && !GENERIC_NON_PROJECT_KEYS.has(candidateKey)) {
      const matched = registry?.aliasToCanonical?.get(candidateKey);
      if (matched) return matched;
      return candidate;
    }
  }
  return "";
}

function resolveKnownProject(input, registry, options = {}) {
  const inputKey = normalizeProjectKey(input);
  if (!inputKey) return { canonical: "", score: 0 };

  const direct = registry?.aliasToCanonical?.get(inputKey);
  if (direct) return { canonical: direct, score: 1 };

  let best = "";
  let bestScore = 0;
  for (const entry of registry?.entries || []) {
    const score = scoreProjectMatch(inputKey, entry.key);
    if (score > bestScore) {
      bestScore = score;
      best = entry.canonical;
    }
  }
  const matchThreshold = options.explicit === true ? 0.92 : 0.75;
  if (bestScore >= matchThreshold) return { canonical: best, score: bestScore };

  if (!options.explicit) {
    const hintText = normalizeProjectKey(`${options.title || ""} ${options.summary || ""} ${options.subject || ""}`);
    if (hintText) {
      for (const entry of registry?.entries || []) {
        if (!hintText.includes(entry.key) && !entry.key.split(/\s+/).every((token) => hintText.includes(token))) continue;
        const score = 0.8;
        if (score > bestScore) {
          bestScore = score;
          best = entry.canonical;
        }
      }
    }
  }

  if (bestScore >= matchThreshold) return { canonical: best, score: bestScore };
  return { canonical: "", score: bestScore };
}

function tokenSet(value) {
  return new Set(
    normalizeProjectKey(value)
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );
}

function scoreProjectMatch(inputKey, candidateKey) {
  if (!inputKey || !candidateKey) return 0;
  if (inputKey === candidateKey) return 1;
  if (candidateKey.includes(inputKey) || inputKey.includes(candidateKey)) return 0.92;
  const inputTokens = tokenSet(inputKey);
  const candidateTokens = tokenSet(candidateKey);
  if (!inputTokens.size || !candidateTokens.size) return 0;
  let overlap = 0;
  for (const token of inputTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(inputTokens.size, candidateTokens.size);
}

export function resolveKanbanProject(raw, registry, options = {}) {
  const input = String(raw || "").replace(/\s+/g, " ").trim();
  const inputKey = input ? normalizeProjectKey(input) : "";
  const isGeneric = inputKey && GENERIC_NON_PROJECT_KEYS.has(inputKey);
  const explicit = options.explicit === true;

  if (explicit) {
    if (!input || isGeneric) return "";
    const known = resolveKnownProject(input, registry, options);
    if (known.canonical) return known.canonical;
    if (options.allowUnknown === false) return "";
    return registerDynamicProject(registry, input);
  }

  if (input && !isGeneric) {
    const known = resolveKnownProject(input, registry, options);
    if (known.canonical) return known.canonical;
    if (options.allowUnknown === false) return "";
    return registerDynamicProject(registry, input);
  }

  const inferred = inferProjectFromHints(options, registry);
  if (!inferred) return "";
  const knownInferred = resolveKnownProject(inferred, registry, options);
  if (knownInferred.canonical) return knownInferred.canonical;
  return registerDynamicProject(registry, inferred);
}

export function getKanbanProjectCatalog(registry, { limit = 40 } = {}) {
  return (registry?.catalog || []).slice(0, limit);
}

export function getKanbanProjectCatalogPrompt(registry, { limit = 35 } = {}) {
  const catalog = getKanbanProjectCatalog(registry, { limit });
  if (!catalog.length) {
    return "Gebruik echte klant- of projectnamen voor het project-veld. Als er nog geen passende naam in de catalogus staat, maak een nieuwe canonieke projectnaam aan in plaats van het veld leeg te laten.";
  }
  return (
    "Geef voorkeur aan deze bestaande project-/klantnamen (exacte spelling): " +
    `${catalog.join(", ")}. ` +
    "Gebruik geen generieke labels zoals meeting, agenda of confluence als project. " +
    "Staat de juiste klant/project niet in de lijst, maak dan een nieuwe duidelijke projectnaam aan in plaats van project leeg te laten."
  );
}

let registryCache = null;
let registryCacheKey = "";

export function getKanbanProjectRegistry(options = {}) {
  const key = `${options.memoryDir || ""}|${options.markdownDir || ""}|${(options.existingProjects || []).join("\u0001")}`;
  if (registryCache && registryCacheKey === key) return registryCache;
  registryCache = buildKanbanProjectRegistry(options);
  registryCacheKey = key;
  return registryCache;
}

export function createKanbanProjectResolver(options = {}) {
  return (raw, hints = {}) => {
    const existingProjects = options.getExistingProjects?.() || options.existingProjects || [];
    const registry = getKanbanProjectRegistry({
      memoryDir: options.memoryDir,
      markdownDir: options.markdownDir,
      existingProjects,
    });
    return resolveKanbanProject(raw, registry, hints);
  };
}

export function consolidateKanbanProjectNames(tasks, registry) {
  const changes = [];
  for (const task of tasks || []) {
    const current = String(task?.project || "").trim();
    const hints = { title: task?.title, summary: task?.summary, subject: task?.subject };
    if (!current) {
      const inferred = resolveKanbanProject("", registry, hints);
      if (inferred) {
        changes.push({ id: task.id, from: "", to: inferred });
        task.project = inferred;
      }
      continue;
    }
    const resolved = resolveKanbanProject(current, registry, hints);
    if (resolved && resolved !== current) {
      changes.push({ id: task.id, from: current, to: resolved });
      task.project = resolved;
    } else if (!resolved) {
      const inferred = resolveKanbanProject("", registry, hints);
      if (inferred) {
        changes.push({ id: task.id, from: current, to: inferred });
        task.project = inferred;
      }
    }
  }
  return changes;
}
