import path from "node:path";
import { safeMemoryMarkdownPath } from "../path-safety.mjs";

const MEMORY_TARGET_STOPWORDS = new Set([
  "hebben",
  "besproken",
  "komende",
  "vooral",
  "aandacht",
  "nodig",
  "contractuele",
  "borging",
  "openstaande",
  "vragen",
  "concreet",
  "overlegmoment",
  "logisch",
  "bestaande",
  "dossier",
  "voeg",
  "korte",
  "statusregel",
  "actiepunt",
  "timestamp",
  "werk",
  "waar",
  "fase",
  "projecten",
  "onderwerpen",
  "personen",
  "memory",
  "files",
]);

export function normMemoryPathKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^files\//, "")
    .replace(/^\.memory\//, "")
    .replace(/^\/+|\/+$/g, "");
}

function normSearchText(value) {
  return normMemoryPathKey(value);
}

function manifestEntries(manifest) {
  return Array.isArray(manifest?.entries) ? manifest.entries : [];
}

function uniqueEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const p = typeof entry?.path === "string" ? entry.path.trim() : "";
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(entry);
  }
  return out;
}

export function findMemoryEntryByExactPath(entries, requestedPath) {
  const key = normMemoryPathKey(requestedPath);
  if (!key) return null;
  return entries.find((entry) => normMemoryPathKey(entry.path) === key) || null;
}

export function findMemoryEntriesBySuffix(entries, requestedPath) {
  const key = normMemoryPathKey(requestedPath);
  if (!key) return [];
  return entries.filter((entry) => {
    const entryKey = normMemoryPathKey(entry.path);
    return entryKey === key || entryKey.endsWith(`/${key}`) || key.endsWith(`/${entryKey}`);
  });
}

export function findMemoryEntryByBasename(entries, requestedPath) {
  const base = path.basename(String(requestedPath || "")).toLowerCase();
  if (!base.endsWith(".md")) return null;
  const matches = entries.filter((entry) => path.basename(String(entry.path || "")).toLowerCase() === base);
  return matches.length === 1 ? matches[0] : null;
}

function tokenizeMemoryPathTerms(value) {
  const normalized = normSearchText(value).replace(/[_-]+/g, " ");
  return Array.from(new Set(normalized.match(/[a-z0-9]{3,}/g) || [])).filter(
    (term) => !MEMORY_TARGET_STOPWORDS.has(term),
  );
}

export function scoreMemoryPathCandidates(requestedPath, entries, limit = 5) {
  const terms = tokenizeMemoryPathTerms(requestedPath);
  const scored = [];
  for (const entry of entries) {
    const hayPath = normSearchText(entry.path).replace(/[_-]+/g, " ");
    const hayTitle = normSearchText(entry.title).replace(/[_-]+/g, " ");
    const hayPreview = normSearchText(entry.preview).replace(/[_-]+/g, " ");
    let score = 0;
    for (const term of terms) {
      if (hayPath.includes(term)) score += 12;
      if (hayTitle.includes(term)) score += 8;
      if (hayPreview.includes(term)) score += 2;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.entry.path).localeCompare(String(b.entry.path)));
  return scored.slice(0, limit).map((item) => item.entry);
}

/**
 * Bepaalt het beste memory-pad op basis van index + bestaan op schijf.
 * Geeft duidelijke fouten wanneer een werkdocument-pad per ongeluk als memory-pad wordt gebruikt.
 */
export function resolveMemoryMarkdownPath(rawPath, options = {}) {
  const {
    memoryManifest = null,
    workingManifest = null,
    memoryExists = () => false,
    workingExists = () => false,
    allowFuzzy = true,
  } = options;

  const requested = safeMemoryMarkdownPath(rawPath);
  if (!requested) {
    return {
      ok: false,
      code: "invalid_path",
      error: "Ongeldig memory-pad of geen .md-bestand.",
    };
  }

  if (memoryExists(requested)) {
    return { ok: true, path: requested, resolvedVia: "exact", requestedPath: requested };
  }

  const memoryEntries = uniqueEntries(manifestEntries(memoryManifest));
  const workingEntries = uniqueEntries(manifestEntries(workingManifest));

  const exactEntry = findMemoryEntryByExactPath(memoryEntries, requested);
  if (exactEntry?.path && memoryExists(exactEntry.path)) {
    return {
      ok: true,
      path: exactEntry.path,
      resolvedVia: "manifest-exact",
      requestedPath: requested,
    };
  }

  const suffixMatches = findMemoryEntriesBySuffix(memoryEntries, requested).filter((entry) =>
    memoryExists(entry.path),
  );
  if (suffixMatches.length === 1) {
    return {
      ok: true,
      path: suffixMatches[0].path,
      resolvedVia: "manifest-suffix",
      requestedPath: requested,
    };
  }

  const basenameEntry = findMemoryEntryByBasename(memoryEntries, requested);
  if (basenameEntry?.path && memoryExists(basenameEntry.path)) {
    return {
      ok: true,
      path: basenameEntry.path,
      resolvedVia: "manifest-basename",
      requestedPath: requested,
    };
  }

  const workingExact = findMemoryEntryByExactPath(workingEntries, requested);
  const workingSuffix = findMemoryEntriesBySuffix(workingEntries, requested);
  const workingBasename = findMemoryEntryByBasename(workingEntries, requested);
  const workingDetected =
    workingExists(requested) ||
    !!workingExact ||
    workingSuffix.length === 1 ||
    !!workingBasename;

  if (workingDetected) {
    const workingPath =
      (workingExists(requested) && requested) ||
      workingExact?.path ||
      workingSuffix[0]?.path ||
      workingBasename?.path ||
      requested;
    return {
      ok: false,
      code: "working_document",
      requestedPath: requested,
      workingPath,
      pathScope: "working",
      error:
        `Dit pad hoort bij een werkdocument onder Files/, niet bij long-term memory onder Files/.memory/: ${workingPath}`,
      hint:
        "Gebruik update_corpus_markdown alleen voor Files/.memory/. Voor werkdocumenten: bewerk het actieve document via agent-modus/changes, of kies een memory-pad uit read_memory_outline.",
      memorySuggestions: scoreMemoryPathCandidates(requested, memoryEntries, 3)
        .map((entry) => entry.path)
        .filter((p) => memoryExists(p)),
    };
  }

  if (allowFuzzy && memoryEntries.length) {
    const ranked = scoreMemoryPathCandidates(requested, memoryEntries, 1);
    const best = ranked[0];
    if (best?.path && memoryExists(best.path) && normMemoryPathKey(best.path) !== normMemoryPathKey(requested)) {
      return {
        ok: true,
        path: best.path,
        resolvedVia: "manifest-fuzzy",
        requestedPath: requested,
      };
    }
  }

  const suggestions = scoreMemoryPathCandidates(requested, memoryEntries, 5)
    .map((entry) => entry.path)
    .filter((p) => memoryExists(p));

  return {
    ok: false,
    code: "not_found",
    requestedPath: requested,
    error: `Memory-bestand niet gevonden: ${requested}`,
    hint:
      suggestions.length > 0
        ? "Controleer het pad via read_memory_outline. Mogelijk bedoelde je een van de suggesties."
        : "Lees eerst read_memory_outline of maak het bestand met create_corpus_markdown.",
    suggestions,
  };
}

export function formatMemoryPathResolutionError(result) {
  if (!result || result.ok) return "";
  const parts = [result.error];
  if (result.hint) parts.push(result.hint);
  if (Array.isArray(result.suggestions) && result.suggestions.length) {
    parts.push(`Suggesties: ${result.suggestions.join(", ")}`);
  }
  if (Array.isArray(result.memorySuggestions) && result.memorySuggestions.length) {
    parts.push(`Mogelijke memory-doelen: ${result.memorySuggestions.join(", ")}`);
  }
  return parts.join(" ");
}
