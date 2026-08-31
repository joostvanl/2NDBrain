import {
  ensureCorpusMetaComment,
  extractDocumentMetadata,
  extractMarkdownSections,
  stripCorpusMetaFromMarkdown,
} from "../corpus-index.mjs";

function normalizeForMatch(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + needle.length;
  }
  return count;
}

/** Typografische varianten die LLM's vaak anders typen dan het bronbestand. */
export function normalizePatchTypography(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--");
}

export function trimLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

export function stripTrailingLineWhitespace(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

function pushUnique(list, value) {
  if (!value || list.includes(value)) return;
  list.push(value);
}

/**
 * Varianten van `find` van strikt naar relaxter — eerste match in het document wint.
 * @param {string} find
 * @param {(s: string) => string} normalize
 */
export function patchFindCandidates(find, normalize = (s) => s) {
  const base = normalize(find);
  const candidates = [];
  const addVariants = (raw) => {
    pushUnique(candidates, raw);
    pushUnique(candidates, raw.trim());
    if (raw.endsWith("\n")) pushUnique(candidates, raw.slice(0, -1));
    else pushUnique(candidates, `${raw}\n`);
  };

  addVariants(base);
  addVariants(normalizePatchTypography(base));
  addVariants(trimLines(base));
  addVariants(normalizePatchTypography(trimLines(base)));
  addVariants(stripTrailingLineWhitespace(base));
  addVariants(stripTrailingLineWhitespace(normalizePatchTypography(base)));

  return candidates;
}

/**
 * @returns {{ count: number, needle: string | null }}
 */
export function locatePatchFind(haystack, find, normalize = (s) => s) {
  for (const needle of patchFindCandidates(find, normalize)) {
    const idx = haystack.indexOf(needle);
    if (idx !== -1) {
      return { start: idx, end: idx + needle.length, needle };
    }
  }
  return locatePatchFindByComparable(haystack, find, normalize);
}

function normalizeComparable(text, normalize) {
  return normalizePatchTypography(normalize(text));
}

function trimEndLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

/**
 * Match meerdere regels waarbij trailing whitespace per regel genegeerd wordt.
 * @returns {{ count: number, needle: string | null }}
 */
function countPatchFindByLineTrimEnd(haystack, find) {
  const findLines = find.split("\n");
  if (!findLines.length || !findLines[0]) return { count: 0, needle: null };
  const hayLines = haystack.split("\n");
  let count = 0;
  let firstNeedle = null;

  for (let i = 0; i <= hayLines.length - findLines.length; i++) {
    let matched = true;
    for (let j = 0; j < findLines.length; j++) {
      if (trimEndLines(hayLines[i + j]) !== trimEndLines(findLines[j])) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const needle = hayLines.slice(i, i + findLines.length).join("\n");
    count += 1;
    if (!firstNeedle) firstNeedle = needle;
  }

  return { count, needle: firstNeedle };
}

/**
 * Laatste redmiddel: vergelijk genormaliseerde tekst en gebruik de echte substring uit het document.
 */
function locatePatchFindByComparable(haystack, find, normalize) {
  const target = normalizeComparable(find, normalize).trim();
  if (!target) return null;

  const hits = [];
  let pos = 0;
  while (pos < haystack.length) {
    let matched = null;
    const maxLen = Math.min(haystack.length - pos, target.length + 8);
    for (let len = Math.max(1, target.length - 4); len <= maxLen; len++) {
      const slice = haystack.slice(pos, pos + len);
      if (normalizeComparable(slice, normalize).trim() === target) {
        matched = slice;
        break;
      }
    }
    if (!matched) {
      pos += 1;
      continue;
    }
    hits.push({ start: pos, end: pos + matched.length, needle: matched });
    pos += matched.length;
  }

  if (hits.length === 1) return hits[0];
  return null;
}

export function countPatchFindOccurrences(haystack, find, normalize = (s) => s) {
  for (const needle of patchFindCandidates(find, normalize)) {
    const count = countOccurrences(haystack, needle);
    if (count > 0) return { count, needle };
  }

  const lineTrim = countPatchFindByLineTrimEnd(haystack, normalize(find));
  if (lineTrim.count > 0) return lineTrim;

  const target = normalizeComparable(find, normalize).trim();
  if (!target) return { count: 0, needle: null };

  let count = 0;
  let firstNeedle = null;
  let pos = 0;
  while (pos < haystack.length) {
    let matched = null;
    const maxLen = Math.min(haystack.length - pos, target.length + 8);
    for (let len = Math.max(1, target.length - 4); len <= maxLen; len++) {
      const slice = haystack.slice(pos, pos + len);
      if (normalizeComparable(slice, normalize).trim() === target) {
        matched = slice;
        break;
      }
    }
    if (!matched) {
      pos += 1;
      continue;
    }
    count += 1;
    if (!firstNeedle) firstNeedle = matched;
    pos += matched.length;
  }

  return { count, needle: firstNeedle };
}

export function isPatchNoOp(change) {
  const find = change?.find;
  const replace = change?.replace;
  return typeof find === "string" && typeof replace === "string" && find === replace;
}

/**
 * True wanneer find niet meer voorkomt maar replace wel (bijv. eerdere patch in dezelfde batch).
 */
export function isPatchAlreadySatisfied(haystack, change, normalize = (s) => s) {
  if (!change || typeof change !== "object") return false;
  const find = typeof change.find === "string" ? normalize(change.find) : "";
  const replace = typeof change.replace === "string" ? normalize(change.replace) : "";
  if (!find || find === replace) return true;
  if (countPatchFindOccurrences(haystack, find, normalize).count > 0) return false;
  if (!replace) return false;
  return countPatchFindOccurrences(haystack, replace, normalize).count > 0;
}

/**
 * Verwijdert exacte duplicaten en latere patches met dezelfde find (behoud eerste).
 */
export function dedupePatchChanges(changes) {
  if (!Array.isArray(changes)) return [];
  const seenFind = new Set();
  const seenExact = new Set();
  const out = [];
  for (const raw of changes) {
    if (!raw || typeof raw !== "object") continue;
    const find = typeof raw.find === "string" ? raw.find : "";
    const exactKey = JSON.stringify({
      find: raw.find,
      replace: raw.replace,
      replaceAll: raw.replaceAll === true,
      sectionId: raw.sectionId || "",
    });
    if (seenExact.has(exactKey)) continue;
    seenExact.add(exactKey);
    if (find && seenFind.has(find)) continue;
    if (find) seenFind.add(find);
    out.push(raw);
  }
  return out;
}

/**
 * @param {string} haystack
 * @param {{ find: string, replace: string, replaceAll?: boolean }} change
 * @param {{ normalize?: (s: string) => string, coerceReplaceAll?: boolean, sectionLabel?: string }} [options]
 */
export function applySinglePatch(haystack, change, options = {}) {
  const normalize = options.normalize || ((s) => s);
  const find = normalize(change.find);
  const replace = normalize(change.replace);
  const sectionSuffix = options.sectionLabel ? ` in sectie ${options.sectionLabel}` : "";

  if (!find || replace === null || replace === undefined) {
    throw new Error("Elke change heeft find en replace als string nodig");
  }
  if (isPatchNoOp(change)) return haystack;

  let replaceAll = change.replaceAll === true;
  let { count, needle } = countPatchFindOccurrences(haystack, find, normalize);
  if (count === 0) {
    if (isPatchAlreadySatisfied(haystack, change, normalize)) return haystack;
    throw new Error(`Patch niet exact toepasbaar: find komt 0 keer voor${sectionSuffix}`);
  }

  if (!replaceAll && options.coerceReplaceAll !== false && count > 1) {
    replaceAll = true;
  }

  if (!replaceAll && count !== 1) {
    throw new Error(
      `Patch niet exact toepasbaar: find komt ${count} keer voor${sectionSuffix}. Gebruik replaceAll=true voor expliciete documentbrede vervangingen.`,
    );
  }

  return replaceAll ? haystack.split(needle).join(replace) : haystack.replace(needle, replace);
}

/**
 * Past patches sequentieel toe op de actuele documentstand (niet alles tegen het origineel valideren).
 */
export function applyExactPatchesResilient(markdown, changes, options = {}) {
  const normalize = options.normalizeForPatchMatch || ((s) => s);
  const coerceReplaceAll = options.coerceReplaceAll !== false;
  if (!Array.isArray(changes)) throw new Error("changes moet een array zijn");

  let doc = normalize(markdown);
  const list = dedupePatchChanges(changes);

  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (!raw || typeof raw !== "object") continue;

    const change = {
      ...raw,
      find: typeof raw.find === "string" ? normalize(raw.find) : "",
      replace: typeof raw.replace === "string" ? normalize(raw.replace) : null,
    };

    if (!change.find || change.replace === null) {
      throw new Error("Elke change heeft find en replace als string nodig");
    }

    if (isPatchAlreadySatisfied(doc, change, normalize)) {
      options.onSkip?.(i, "already_satisfied");
      continue;
    }

    const before = doc;
    doc = applySinglePatch(doc, change, { normalize, coerceReplaceAll });
    if (doc !== before) options.onApplied?.(i);
  }

  return doc;
}

/**
 * Resolve section by id, heading, headingPath or index string.
 */
export function resolveSectionRange(markdown, sectionId) {
  const md = normalizeForMatch(markdown);
  const sections = extractMarkdownSections(md);
  if (!sections.length) return null;
  const key = String(sectionId || "").trim();
  if (!key) return null;

  let match =
    sections.find((s) => s.id === key) ||
    sections.find((s) => String(s.index) === key) ||
    sections.find((s) => s.heading === key) ||
    sections.find((s) => Array.isArray(s.headingPath) && s.headingPath.join(" > ") === key);

  if (!match) {
    const lower = key.toLowerCase();
    match = sections.find((s) => String(s.heading || "").toLowerCase() === lower);
  }

  if (!match) return null;
  const lines = md.split("\n");
  const start = Math.max(0, (match.startLine || 1) - 1);
  const end = Math.min(lines.length, match.endLine || lines.length);
  return {
    section: match,
    start,
    end,
    text: lines.slice(start, end).join("\n"),
  };
}

export function normalizePatchChangeExtended(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  if (typeof out.sectionId === "string") out.sectionId = out.sectionId.trim();
  if (typeof out.beforeSnippet === "string") out.beforeSnippet = out.beforeSnippet.trim();
  if (typeof out.rationale === "string") out.rationale = out.rationale.trim();
  return out;
}

/**
 * Apply patches with optional section scoping and beforeSnippet validation.
 */
export function applySectionScopedPatches(markdown, changesRaw, helpers = {}) {
  const normalize = helpers.normalizeForPatchMatch || ((s) => s);
  const coerceReplaceAll = helpers.coerceReplaceAll !== false;

  if (!Array.isArray(changesRaw)) throw new Error("changes moet een array zijn");
  let doc = normalize(markdown);
  const changes = dedupePatchChanges(changesRaw.map(normalizePatchChangeExtended));

  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const find = typeof change.find === "string" ? normalize(change.find) : "";
    const replace = typeof change.replace === "string" ? normalize(change.replace) : null;
    if (!find || replace === null) {
      throw new Error("Elke change heeft find en replace als string nodig");
    }

    let scope = doc;
    if (change.sectionId) {
      const range = resolveSectionRange(doc, change.sectionId);
      if (!range) {
        throw new Error(`Sectie niet gevonden: ${change.sectionId}`);
      }
      scope = range.text;
    }

    if (change.beforeSnippet) {
      const before = normalize(change.beforeSnippet);
      if (!scope.includes(before) && !locatePatchFind(scope, before, normalize)) {
        throw new Error(`beforeSnippet komt niet voor in ${change.sectionId ? `sectie ${change.sectionId}` : "document"}`);
      }
    }

    if (isPatchAlreadySatisfied(scope, change, normalize)) continue;

    const nextScope = applySinglePatch(scope, change, {
      normalize,
      coerceReplaceAll,
      sectionLabel: change.sectionId || "",
    });

    if (change.sectionId) {
      const lines = doc.split("\n");
      const range = resolveSectionRange(doc, change.sectionId);
      lines.splice(range.start, range.end - range.start, ...nextScope.split("\n"));
      doc = lines.join("\n");
    } else {
      doc = nextScope;
    }
  }

  return doc;
}

/** Zichtbare body leeg (draft/inbox zonder inhoud). Metadata-comment telt niet mee. */
export function isEffectivelyEmptyDocumentMarkdown(markdown) {
  return stripCorpusMetaFromMarkdown(markdown).trim().length === 0;
}

/** Vul leeg document: behoud corpus-meta, zet replace als zichtbare body. */
export function fillEmptyDocumentMarkdown(markdown, replaceBody) {
  const meta = extractDocumentMetadata(markdown);
  const docId = meta.properties.doc_id || null;
  const extra = {};
  if (meta.properties.status) extra.status = meta.properties.status;
  const body = String(replaceBody || "").replace(/\r\n/g, "\n").trim();
  return ensureCorpusMetaComment(body, docId, extra).content;
}

/**
 * Schrijf naar leeg document via changes.
 * @returns {string | null} nieuwe markdown of null als niet van toepassing
 */
/** Reply lijkt op Markdown-inhoud voor een werkdocument (niet alleen chat-uitleg). */
export function looksLikeMarkdownDocumentBody(text) {
  const body = String(text || "").trim();
  if (body.length < 80) return false;
  if (/^#{1,3}\s+\S/m.test(body)) return true;
  if (/^-\s+\S/m.test(body) && body.length >= 120) return true;
  // Puur proza-verslag (meerdere alinea's, geen koppen): accepteer bij voldoende lengte.
  if (body.length >= 200 && /\n\s*\n/.test(body)) return true;
  return false;
}

/** Strip een (mogelijk afgebroken) JSON-/codeomhulsel dat modellen om de body zetten. */
function stripJsonWrapperFromReplyBody(text) {
  let body = String(text || "").trim();
  if (!body) return "";
  // Model zette het hele changes-JSON in de reply: haal de replace-string eruit.
  if (/^\{?\s*"?changes"?\s*:/.test(body) || /"replace"\s*:\s*"/.test(body)) {
    const m = /"replace"\s*:\s*"([\s\S]*?)(?:"\s*[},]|"\s*$|$)/.exec(body);
    if (m?.[1]) {
      try {
        return JSON.parse(`"${m[1].replace(/\n/g, "\\n").replace(/\r/g, "")}"`).trim();
      } catch {
        return m[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .trim();
      }
    }
  }
  return body;
}

/** Haal bruikbare Markdown-body uit agent-reply (koppen, fenced block, of proza). */
export function extractMarkdownBodyFromAgentReply(reply) {
  let text = String(reply || "").trim();
  if (!text) return "";

  // Verwijder een leidende ```json ...``` / ``` ... ``` codefence-omhulsel.
  const jsonFence = /```(?:json)?\s*\n?([\s\S]*?)(?:```|$)/i.exec(text);
  if (jsonFence?.[1] && /"(?:changes|replace|find)"\s*:/.test(jsonFence[1])) {
    const fromJson = stripJsonWrapperFromReplyBody(jsonFence[1].trim());
    if (looksLikeMarkdownDocumentBody(fromJson)) return fromJson.trim();
  }

  text = stripJsonWrapperFromReplyBody(text);

  // Markdown-codefence met de daadwerkelijke inhoud.
  const mdFence = /```(?:markdown|md)?\s*\n([\s\S]*?)```/i.exec(text);
  if (mdFence?.[1]?.trim() && !/"(?:changes|replace|find)"\s*:/.test(mdFence[1])) {
    text = mdFence[1].trim();
  }

  const headingIdx = text.search(/^#{1,3}\s/m);
  if (headingIdx > 0 && headingIdx < 500) text = text.slice(headingIdx);
  return looksLikeMarkdownDocumentBody(text) ? text.trim() : "";
}

/**
 * Leeg document + geen bruikbare patches: synthetiseer find "" uit replace-velden of reply.
 * Voorkomt dat gespreksverslagen alleen in het chatpaneel verschijnen.
 */
export function coerceAgentChangesForEmptyDocument(markdown, changes, reply) {
  if (!isEffectivelyEmptyDocumentMarkdown(markdown)) {
    return Array.isArray(changes) ? changes : [];
  }
  const list = Array.isArray(changes) ? changes.filter((c) => c && typeof c === "object") : [];
  const hasEmptyFind = list.some(
    (c) => typeof c.replace === "string" && String(c.replace || "").trim() && !String(c.find ?? "").trim(),
  );
  if (hasEmptyFind) return list;

  const combinedReplace = list
    .map((c) => (typeof c.replace === "string" ? c.replace : ""))
    .filter((s) => s.trim())
    .join("\n\n")
    .trim();
  if (combinedReplace && looksLikeMarkdownDocumentBody(combinedReplace)) {
    return [{ find: "", replace: combinedReplace, replaceAll: false }];
  }

  const fromReply = extractMarkdownBodyFromAgentReply(reply);
  if (fromReply) {
    return [{ find: "", replace: fromReply, replaceAll: false }];
  }
  return list;
}

export function resolveEmptyDocumentChanges(markdown, changes, { mode = "auto" } = {}) {
  if (!isEffectivelyEmptyDocumentMarkdown(markdown) || !Array.isArray(changes) || !changes.length) {
    return null;
  }

  const normalized = changes.filter((c) => c && typeof c === "object");
  const emptyFind = normalized.find(
    (c) => typeof c.replace === "string" && String(c.replace || "").trim() && !String(c.find ?? "").trim(),
  );
  if (emptyFind && (mode === "empty-find" || mode === "auto")) {
    return fillEmptyDocumentMarkdown(markdown, emptyFind.replace);
  }

  if (mode === "fallback" || mode === "auto") {
    const combined = normalized
      .map((c) => (typeof c.replace === "string" ? c.replace : ""))
      .filter((s) => s.trim())
      .join("\n\n")
      .trim();
    if (combined) return fillEmptyDocumentMarkdown(markdown, combined);
  }

  return null;
}
