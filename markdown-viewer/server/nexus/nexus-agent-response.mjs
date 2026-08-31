/**
 * Herstel wanneer review-agent JSON in `reply` zet i.p.v. top-level `changes`.
 */

function decodeJsonLikeString(raw) {
  try {
    return JSON.parse(`"${String(raw).replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`);
  } catch {
    return String(raw)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
}

export function extractJsonLikeStringField(text, fieldName) {
  const source = String(text || "");
  const re = new RegExp(`"${fieldName}"\\s*:\\s*"`, "g");
  const match = re.exec(source);
  if (!match) return "";
  let raw = "";
  for (let i = match.index + match[0].length; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      raw += ch;
      if (i + 1 < source.length) {
        raw += source[i + 1];
        i += 1;
      }
      continue;
    }
    if (ch === '"') return decodeJsonLikeString(raw).trim();
    raw += ch;
  }
  return decodeJsonLikeString(raw).trim();
}

export function stripJsonLikeEnvelopeFromText(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const idx = source.search(/\{\s*"(reply|changes|viewerActions|pendingMemoryActions)"/);
  if (idx > 0) return source.slice(0, idx).trim();
  if (idx === 0 && /^\{\s*"(reply|changes)"/.test(source)) return "";
  return source;
}

function tryParseAgentJson(text, parseAgentJsonResponse) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return parseAgentJsonResponse(trimmed);
  } catch {
    return null;
  }
}

function extractEmptyFindReplaceFromJsonLike(text) {
  const source = String(text || "");
  if (!/"find"\s*:\s*""/.test(source)) return null;
  const replace = extractJsonLikeStringField(source, "replace");
  if (!replace.trim()) return null;
  return { find: "", replace, replaceAll: false };
}

function extractChangesFromJsonLikeText(text, parseAgentJsonResponse, normalizeParsed) {
  const source = String(text || "").trim();
  if (!source) return [];

  const candidates = [];
  if (source.startsWith("{")) candidates.push(source);
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenced?.[1]?.trim()) candidates.push(fenced[1].trim());
  const changesIdx = source.indexOf('{"changes"');
  if (changesIdx >= 0) candidates.push(source.slice(changesIdx));
  const braceIdx = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (braceIdx >= 0 && lastBrace > braceIdx) {
    candidates.push(source.slice(braceIdx, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParseAgentJson(candidate, parseAgentJsonResponse);
    if (parsed) {
      const normalized = normalizeParsed ? normalizeParsed(parsed) : parsed;
      const changes = Array.isArray(normalized?.changes) ? normalized.changes.filter(Boolean) : [];
      if (changes.length) return changes;
    }
    const emptyFind = extractEmptyFindReplaceFromJsonLike(candidate);
    if (emptyFind) return [emptyFind];
    const find = extractJsonLikeStringField(candidate, "find");
    const replace = extractJsonLikeStringField(candidate, "replace");
    if (replace && find !== undefined) {
      return [{ find: find || "", replace, replaceAll: false }];
    }
  }

  return [];
}

/**
 * @param {unknown} parsed
 * @param {string} [rawContentStr]
 * @param {{ parseAgentJsonResponse: (s: string) => unknown, normalizeParsedAgentJsonResponse?: (p: unknown) => unknown }} helpers
 */
export function recoverReviewAgentChanges(parsed, rawContentStr, helpers) {
  const { parseAgentJsonResponse, normalizeParsedAgentJsonResponse } = helpers;
  const normalizeParsed = normalizeParsedAgentJsonResponse || ((p) => p);

  const top = Array.isArray(parsed?.changes) ? parsed.changes.filter((c) => c && typeof c === "object") : [];
  if (top.length) return top;

  const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
  if (reply) {
    const fromReply = extractChangesFromJsonLikeText(reply, parseAgentJsonResponse, normalizeParsed);
    if (fromReply.length) return fromReply;
  }

  if (rawContentStr) {
    return extractChangesFromJsonLikeText(rawContentStr, parseAgentJsonResponse, normalizeParsed);
  }

  return [];
}

/**
 * @param {unknown} parsed
 * @param {string} [rawContentStr]
 * @param {{ parseAgentJsonResponse: (s: string) => unknown, normalizeParsedAgentJsonResponse?: (p: unknown) => unknown }} helpers
 */
export function normalizeReviewAgentLlmPayload(parsed, rawContentStr, helpers) {
  const base = parsed && typeof parsed === "object" ? { ...parsed } : { changes: [], reply: "" };
  const changes = recoverReviewAgentChanges(base, rawContentStr, helpers);
  let reply = typeof base.reply === "string" ? base.reply.trim() : "";

  if (changes.length && (reply.startsWith("{") || reply.includes('"changes"'))) {
    const prose = stripJsonLikeEnvelopeFromText(reply);
    reply = prose || "Documentvoorstel staat klaar ter beoordeling.";
  }

  if (reply.startsWith("{")) {
    try {
      const nested = helpers.normalizeParsedAgentJsonResponse
        ? helpers.normalizeParsedAgentJsonResponse(helpers.parseAgentJsonResponse(reply))
        : helpers.parseAgentJsonResponse(reply);
      const nestedReply = typeof nested?.reply === "string" ? nested.reply.trim() : "";
      if (nestedReply && !nestedReply.startsWith("{")) reply = nestedReply;
      else if (changes.length) reply = stripJsonLikeEnvelopeFromText(reply) || "Documentvoorstel staat klaar ter beoordeling.";
    } catch {
      if (changes.length) {
        reply = stripJsonLikeEnvelopeFromText(reply) || "Documentvoorstel staat klaar ter beoordeling.";
      }
    }
  }

  return { ...base, changes, reply };
}
