/**
 * Server-side Nexus intent classification for retrieval and tool routing.
 */

const DOCUMENT_TARGET =
  /\b(dit|deze|huidige|geopende)?\s*(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina|passage|selectie)\b/;
const REVIEW_WORD = /\b(reviewvoorstel|wijzigingsvoorstel|redactievoorstel|aanpassing(?:en)?|wijziging(?:en)?)\b/;
const DIRECT_EDIT_VERB = /\b(pas|wijzig|verander|herschrijf|corrigeer|redigeer|vervang|vul|vullen|aanvul|aanvullen|werk\s+uit|uitwerken)\b/;
const INSERT_EDIT_VERB = /\b(voeg|plaats|zet|neem|verwerk|vul|vullen|aanvul|aanvullen)\b/;
const DOCUMENT_INSERT_PATTERN =
  /\b(voeg|plaats|zet|neem|verwerk|vul|vullen|aanvul|aanvullen)\b[\s\S]{0,160}\b(toe|in|op|aan|met)\b[\s\S]{0,120}\b(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina|passage|selectie)\b/;
const DOCUMENT_WRITE_PATTERN =
  /\b(schrijf|maak)\b[\s\S]{0,160}\b(in|voor)\b[\s\S]{0,120}\b(document|bestand|markdown|tekst|sectie|paragraaf|alinea|hoofdstuk|pagina)\b/;
const DOCUMENT_FILL_PATTERN =
  /\b(vul|vullen|aanvul|aanvullen|werk\s+uit|uitwerken)\b[\s\S]{0,160}\b(document|bestand|markdown|tekst|pagina)\b|\b(document|bestand|markdown|tekst|pagina)\b[\s\S]{0,120}\b(vullen|aanvullen|uitwerken|vul\s+aan)\b/;

const PLANNING_RE =
  /\b(wat moet ik|planning|deadline|deadlines|weekplan|dagplan|timesheet|uren|activiteiten|kanban|taken|to[- ]?do|deze week|vandaag|morgen|opvolging|follow[- ]?up)\b/i;

/** Externe Kanban-tools — alleen wanneer Joost die expliciet noemt. */
const EXTERNAL_KANBAN_RE =
  /\b(jira|azure\s+devops|devops|trello|asana|monday|clickup|linear)\b[\s\S]{0,40}\b(kanban|board|bord|taken?)\b|\b(kanban|board|bord)\b[\s\S]{0,40}\b(jira|azure\s+devops|devops|trello|asana|monday|clickup|linear)\b/i;

const INTERNAL_KANBAN_EXPLICIT_RE =
  /\b(actie[- ]?kanban|nexus\s+kanban|ioms\s+kanban|intern\s+kanban|nexus\s+bord)\b/i;

const INTERNAL_KANBAN_BOARD_RE =
  /\bkanban\s+(bord|board|taken?|taak|kaart(?:en|je)?|kolom(?:men)?|backlog|inbox|status)\b|\b(bord|board)\b[\s\S]{0,24}\bkanban\b|\bkanban\b[\s\S]{0,24}\b(bord|board)\b/i;

export const INTERNAL_KANBAN_DISAMBIGUATION_RULE =
  "Wanneer Joost «Kanban», «Kanban bord», «Nexus Kanban», «Actie-Kanban» of «Kanban taken» zegt, bedoelt hij **altijd** het interne iOMS Actie-Kanban (opslag in Files/.kanban/tasks.json via Nexus-tools). Gebruik search_kanban_tasks, read_kanban_task en verwante Kanban-tools. Ga **niet** uit van Jira, Azure DevOps, Trello of andere externe boards, tenzij Joost die tool expliciet noemt.";

export const INTERNAL_KANBAN_TOOL_PREFIX =
  "Intern iOMS Actie-Kanban (Nexus; niet Jira/Azure DevOps). ";

/**
 * Herken wanneer Joost het interne Nexus Actie-Kanban bedoelt.
 * @param {string} message
 * @param {{ activeView?: string }} [context]
 */
export function inferInternalKanbanIntent(message, context = {}) {
  const text = String(message || "").trim();
  const activeView = String(context.activeView || "").trim().toLowerCase();
  if (activeView === "kanban") return true;
  if (!text) return false;
  if (EXTERNAL_KANBAN_RE.test(text)) return false;
  if (INTERNAL_KANBAN_EXPLICIT_RE.test(text)) return true;
  if (INTERNAL_KANBAN_BOARD_RE.test(text)) return true;
  if (/\bkanban\b/i.test(text)) return true;
  if (/\b(op (?:het|mijn)\s+bord)\b/i.test(text) && /\b(taak|taken|kaart|status|kolom|inbox|backlog|open)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function formatInternalKanbanDisambiguationBlock(message = "", context = {}) {
  if (!inferInternalKanbanIntent(message, context)) return "";
  return (
    "**Kanban-disambiguatie (verplicht):** " +
    INTERNAL_KANBAN_DISAMBIGUATION_RULE +
    " Begin met search_kanban_tasks wanneer je taken of het bord moet ophalen.\n"
  );
}
const COMMUNICATION_RE =
  /\b(outlook|mailbox|inbox|mail|e-mail|email|agenda|afspraak|calendar|reply|antwoord|concept|draft|verzonden)\b/i;
const RESEARCH_RE =
  /\b(overzicht|inventarisatie|vergelijk|analyse|corpus|kennisbank|alles|hele|onderzoek|research|samenvatting|rapport)\b/i;

export function inferDocumentChangeIntent(message) {
  const text = String(message || "").toLowerCase();
  if (REVIEW_WORD.test(text)) return true;
  if (DOCUMENT_INSERT_PATTERN.test(text) || DOCUMENT_WRITE_PATTERN.test(text) || DOCUMENT_FILL_PATTERN.test(text)) return true;
  if (DIRECT_EDIT_VERB.test(text) && DOCUMENT_TARGET.test(text)) return true;
  if (
    /\b(pas|wijzig|verander|herschrijf|corrigeer|redigeer|vervang|vul|aanvul|werk\s+uit)\b[\s\S]{0,80}\b(dit|deze|hierboven|selectie|passage|document|bestand)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    INSERT_EDIT_VERB.test(text) &&
    /\b(toe aan dit document|in dit document|in de tekst|aan de tekst|met informatie|aan met informatie)\b/.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} message
 * @param {{ activeView?: string, hasDocument?: boolean, documentPath?: string, mode?: string, organicMemoryContext?: boolean }} [context]
 */
export function classifyNexusIntent(message, context = {}) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const hasDocument = context.hasDocument === true;
  const documentPath = String(context.documentPath || "");
  const internalKanbanIntent = inferInternalKanbanIntent(text, context);
  const documentEditIntent = hasDocument && (context.mode === "agent" || inferDocumentChangeIntent(text));

  let profile = "research";
  if (documentEditIntent && !internalKanbanIntent) {
    profile = "document-edit";
  } else if (internalKanbanIntent || PLANNING_RE.test(lower)) {
    profile = "planning";
  } else if (COMMUNICATION_RE.test(lower)) {
    profile = "communication";
  } else if (RESEARCH_RE.test(lower)) {
    profile = "research";
  } else if (hasDocument && text.length <= 120) {
    profile = "document-edit";
  }

  if (internalKanbanIntent && documentEditIntent && profile !== "planning") {
    profile = "planning";
  }

  const retrievalProfile =
    profile === "document-edit" ? "focused" : profile === "planning" ? "balanced" : profile === "communication" ? "balanced" : "broad";

  const enabledToolGroups = {
    corpus: profile !== "communication",
    emailMemory: profile === "planning" || profile === "communication" || profile === "research",
    kanban: profile === "planning" || profile === "research",
    webSearch: profile === "research" || profile === "communication",
    activityLogs: profile === "planning",
    confluence: profile === "research" || profile === "document-edit",
    jira:
      profile === "research" ||
      /\bjira\b/i.test(text) ||
      /\bjql\b/i.test(text) ||
      /\b[A-Z][A-Z0-9_]+-\d+\b/.test(text),
    outlook: profile === "communication" || profile === "planning",
    memoryWrite: profile === "research" || profile === "planning",
  };

  if (profile === "document-edit") {
    enabledToolGroups.kanban = false;
    enabledToolGroups.webSearch = false;
    enabledToolGroups.activityLogs = false;
    enabledToolGroups.outlook = false;
    enabledToolGroups.memoryWrite = context.organicMemoryContext === true;
  }

  if (internalKanbanIntent) {
    enabledToolGroups.kanban = true;
    enabledToolGroups.activityLogs = enabledToolGroups.activityLogs || profile === "planning";
  }

  return {
    profile,
    retrievalProfile,
    enabledToolGroups,
    documentPath,
    internalKanbanIntent,
    excludeExperimentPaths: shouldExcludeExperimentPaths(text, profile, documentPath),
  };
}

export function shouldExcludeExperimentPaths(message, profile, documentPath = "") {
  const doc = String(documentPath || "").replace(/\\/g, "/");
  if (doc.includes("90-experiments-en-test/")) return false;
  const text = String(message || "");
  if (/90-experiments-en-test/i.test(text)) return false;
  if (profile === "research" && /\b(experiment|testbestand|90-experiments)\b/i.test(text)) return false;
  return true;
}

export function toolGroupsToCorpusOpts(enabledToolGroups = {}) {
  return {
    enableCorpusTools: enabledToolGroups.corpus !== false,
    enableEmailMemory: enabledToolGroups.emailMemory !== false,
    enableKanban: enabledToolGroups.kanban !== false,
    enableWebSearch: enabledToolGroups.webSearch === true,
    enableActivityLogs: enabledToolGroups.activityLogs === true,
    enableConfluence: enabledToolGroups.confluence !== false,
    enableJira: enabledToolGroups.jira !== false,
    enableOutlook: enabledToolGroups.outlook === true,
    enableMemoryWriteTools: enabledToolGroups.memoryWrite === true,
  };
}

export function defaultExperimentPathPatterns() {
  const raw = process.env.NEXUS_EXPERIMENT_PATHS || "90-experiments-en-test";
  return raw
    .split(/[;,|]/)
    .map((p) => p.trim())
    .filter(Boolean);
}
