import { resolveSourceConflicts, sourceTierForPath } from "./nexus-source-policy.mjs";

export function nexusStructuredEvidenceEnabled(mode = "ask") {
  const raw = process.env.NEXUS_STRUCTURED_EVIDENCE;
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return mode === "agent";
}

/**
 * @typedef {Object} EvidenceItem
 * @property {string} path
 * @property {string} [sectionId]
 * @property {"corpus"|"memory"|"email"|"kanban"|"outlook"|"confluence"|"web"|"activity"} sourceType
 * @property {string} excerpt
 * @property {number} [tier]
 * @property {boolean} [possiblyStale]
 */

/**
 * @param {unknown} raw
 */
export function normalizeEvidenceItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt.trim() : "";
  const sourceType = normalizeSourceType(raw.sourceType);
  if (!path && !excerpt) return null;
  const item = {
    path: path || "(onbekend pad)",
    sourceType,
    excerpt: excerpt.slice(0, 600),
    tier: sourceTierForPath(path || excerpt),
  };
  if (typeof raw.sectionId === "string" && raw.sectionId.trim()) item.sectionId = raw.sectionId.trim();
  if (typeof raw.claim === "string" && raw.claim.trim()) item.claim = raw.claim.trim().slice(0, 400);
  return item;
}

function normalizeSourceType(value) {
  const allowed = new Set(["corpus", "memory", "email", "kanban", "outlook", "confluence", "web", "activity"]);
  const v = String(value || "corpus").toLowerCase();
  return allowed.has(v) ? v : "corpus";
}

/**
 * @param {unknown} raw
 */
export function normalizeAssumption(raw) {
  if (!raw || typeof raw !== "object") return null;
  const claim = typeof raw.claim === "string" ? raw.claim.trim() : "";
  if (!claim) return null;
  const derivedFrom = Array.isArray(raw.derivedFrom)
    ? raw.derivedFrom.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  return { claim: claim.slice(0, 400), derivedFrom };
}

/**
 * @param {unknown} parsed
 */
export function extractStructuredToolContext(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const reply =
    typeof parsed.reply === "string"
      ? parsed.reply
      : typeof parsed.summary === "string"
        ? parsed.summary
        : "";
  const evidence = (Array.isArray(parsed.evidence) ? parsed.evidence : [])
    .map(normalizeEvidenceItem)
    .filter(Boolean);
  const assumptions = (Array.isArray(parsed.assumptions) ? parsed.assumptions : [])
    .map(normalizeAssumption)
    .filter(Boolean);
  const nextActions = Array.isArray(parsed.nextActions) ? parsed.nextActions.slice(0, 3) : [];
  const resolved = resolveSourceConflicts(evidence);
  return {
    reply,
    evidence: resolved.evidence,
    assumptions,
    sourceConflicts: resolved.conflicts,
    nextActions,
  };
}

export function formatEvidenceBlock(structured) {
  if (!structured) return "";
  const lines = [];
  if (structured.evidence?.length) {
    lines.push("### Gebruikte bronnen (evidence)");
    for (const item of structured.evidence.slice(0, 12)) {
      const stale = item.possiblyStale ? " *(mogelijk verouderd)*" : "";
      const section = item.sectionId ? ` §${item.sectionId}` : "";
      lines.push(`- [${item.sourceType}] \`${item.path}\`${section}${stale}: ${item.excerpt.slice(0, 180)}`);
    }
  }
  if (structured.assumptions?.length) {
    lines.push("", "### Belangrijkste aannames");
    for (const a of structured.assumptions.slice(0, 6)) {
      const derived = a.derivedFrom?.length ? ` (afgeleid uit ${a.derivedFrom.join(" + ")})` : "";
      lines.push(`- ${a.claim}${derived}`);
    }
  }
  if (structured.sourceConflicts?.length) {
    lines.push("", "### Bronconflicten");
    for (const c of structured.sourceConflicts.slice(0, 4)) {
      lines.push(`- ${c.summary}`);
    }
  }
  return lines.join("\n");
}

export function formatEvidenceFooter(structured) {
  if (!structured) return "";
  const block = formatEvidenceBlock(structured);
  if (!block) return "";
  const lines = block.split("\n").slice(0, 8);
  return `\n\n---\n\n${lines.join("\n")}`;
}

export function wrapToolError(fnName, error, fallbackUsed = "") {
  return {
    ok: false,
    tool: fnName,
    error: String(error?.message || error || "Onbekende toolfout"),
    fallbackUsed: fallbackUsed || null,
  };
}

export function wrapToolSuccess(payload) {
  if (payload && typeof payload === "object" && "ok" in payload) return payload;
  return { ok: true, ...(payload && typeof payload === "object" ? payload : { result: payload }) };
}
