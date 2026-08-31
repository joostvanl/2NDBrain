/**
 * Viewercontext: welk bestand/weergave Joost nu open heeft in iOMS.
 */

import { inferInternalKanbanIntent } from "./nexus-intent.mjs";
const OPEN_FILE_QUESTION =
  /\b(welk|wat\s+voor|welke)\s+(bestand|document|markdown)\b|\b(welk|wat)\s+.*\b(open|geopend)\b|\bdit\s+bestand\b|\bdit\s+document\b|\bhuidige\s+(bestand|document)\b/i;

/**
 * @param {{
 *   activeView?: string;
 *   documentPath?: string;
 *   documentLabel?: string;
 *   markdown?: string;
 *   question?: string;
 * }} [ctx]
 */
export function formatNexusViewerContextBlock(ctx = {}) {
  const activeView = String(ctx.activeView || "documents").trim() || "documents";
  const path = String(ctx.documentPath || "").trim();
  const label = String(ctx.documentLabel || "").trim();
  const md = String(ctx.markdown || "");
  const lines = [
    "### Viewercontext (verplicht — wat Joost nu open heeft)",
    `- Actieve viewer-weergave: **${activeView}**`,
  ];
  if (activeView === "kanban") {
    lines.push(
      "- **Actie-Kanban-weergave actief:** vragen over taken, het bord, statussen of «Kanban» gaan over het **interne iOMS Actie-Kanban** (`Files/.kanban/tasks.json`), niet over Jira, Azure DevOps of andere externe tooling.",
    );
  }
  if (path) {
    const display = label && label !== path ? `${path} (${label})` : path;
    lines.push(`- Geopend Markdown-bestand in de viewer: \`${display}\``);
    lines.push(`- Documentgrootte in viewer: ${md.length} tekens${md.length ? "" : " (leeg of nog niet geladen)"}`);
    lines.push(
      "- Vragen over \"dit document\", \"dit bestand\", \"wat heb ik open\" of \"welk bestand\" → antwoord met **dit pad** als het geopende bestand.",
    );
  } else {
    lines.push("- Geen Markdown-bestand open in de documentviewer (file picker leeg of geen selectie).");
    lines.push("- Antwoord eerlijk als er geen geopend werkdocument is; verwijs niet naar een bestand dat niet open staat.");
  }
  if (OPEN_FILE_QUESTION.test(String(ctx.question || ""))) {
    lines.push(
      "- **Meta-vraag herkend:** noem expliciet het pad hierboven (of dat er geen document open is) vóór je verder zoekt in corpus/tools.",
    );
  }
  if (inferInternalKanbanIntent(String(ctx.question || ""), { activeView })) {
    lines.push(
      "- **Kanban-vraag herkend:** gebruik uitsluitend Nexus Actie-Kanban-tools (search_kanban_tasks, read_kanban_task, …); noem geen externe Kanban-borden tenzij Joost Jira/Azure DevOps/etc. expliciet noemt.",
    );
  }
  return lines.join("\n");
}

/**
 * Houd viewercontext vast bij inkorting van de heuristische baseline.
 * @param {string} pinnedPrefix
 * @param {string} body
 * @param {number} maxChars
 */
export function truncateNexusHeuristicBlob(pinnedPrefix, body, maxChars) {
  const prefix = String(pinnedPrefix || "").trim();
  const rest = String(body || "").trim();
  if (!prefix) {
    if (rest.length <= maxChars) return rest;
    return `${rest.slice(0, maxChars)}\n\n*[Heuristische baseline ingekort; gebruik gerichte tools voor verdieping.]*\n`;
  }
  if (prefix.length >= maxChars) {
    return `${prefix.slice(0, maxChars)}\n\n*[Viewercontext ingekort.]*\n`;
  }
  const budget = maxChars - prefix.length - 80;
  if (budget <= 0) return prefix;
  if (rest.length <= budget) return `${prefix}\n\n${rest}`;
  return `${prefix}\n\n${rest.slice(0, budget)}\n\n*[Heuristische baseline ingekort; gebruik gerichte tools voor verdieping.]*\n`;
}

/**
 * @param {string} path
 */
export function isViewerMarkdownPath(path) {
  const s = String(path || "").trim();
  if (!s.endsWith(".md")) return false;
  if (s.startsWith("email-followup:") || s.startsWith("kanban-task:")) return false;
  return true;
}

/**
 * @param {string} name
 * @param {string} markdown
 * @param {string} openDocumentPath
 * @param {string} openDocumentMarkdown
 */
export function resolveViewerOpenDocument(name, markdown, openDocumentPath = "", openDocumentMarkdown = "") {
  if (isViewerMarkdownPath(name)) {
    return { documentPath: String(name).trim(), markdown: String(markdown || "") };
  }
  return resolveNexusViewerDocument("", "", openDocumentPath, openDocumentMarkdown);
}

/**
 * @param {string} name
 * @param {string} markdown
 * @param {string} openDocumentPath
 * @param {string} openDocumentMarkdown
 */
export function resolveNexusViewerDocument(name, markdown, openDocumentPath = "", openDocumentMarkdown = "") {
  const primaryPath = String(name || "").trim();
  const secondaryPath = String(openDocumentPath || "").trim();
  const primaryMd = String(markdown || "");
  const secondaryMd = String(openDocumentMarkdown || "");
  if (primaryPath) {
    return { documentPath: primaryPath, markdown: primaryMd };
  }
  if (secondaryPath) {
    return { documentPath: secondaryPath, markdown: secondaryMd };
  }
  return { documentPath: "", markdown: "" };
}
