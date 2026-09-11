import "./style.css";
import { defaultTemplate, mergeTemplate } from "./defaultTemplate";
import type { ViewerTemplate } from "./templateTypes";
import { applyCssVars, templateToCssVars } from "./applyTemplate";
import {
  agentChat,
  applyAgentMemoryActions,
  clearAgentLogs,
  cleanupAgentTranscript,
  createPromptMacro,
  createAgentChatSession,
  createMarkdownFolder,
  deleteAgentChatSession,
  deleteMarkdownFile,
  deletePromptMacro,
  fetchAgentConfig,
  fetchAgentChatSessions,
  fetchAgentInstructions,
  fetchAgentLogs,
  fetchAgentModels,
  fetchConfluencePage,
  fetchDocxTemplates,
  fetchDocxTemplatePlaceholders,
  fetchMemoryFile,
  fetchMemoryIndex,
  exportMarkdownToDocx,
  fetchAgentActivityLogs,
  fetchMarkdownBackupFile,
  fetchMarkdownFile,
  fetchMarkdownIndex,
  fetchReviewComments,
  fetchSecondBrainContext,
  fetchSecondBrainUnlinkedMentions,
  fetchPromptMacros,
  fetchTemplate,
  fetchTemplateFiles,
  importDocxToMarkdown,
  linkSecondBrainUnlinkedMentions,
  renameMarkdownPath,
  promoteAgentChatSession,
  promoteStaleAgentChats,
  rebuildCorpusIndex,
  revertAgentMemoryActions,
  revertMarkdownToLastBackup,
  runAgent,
  saveMarkdownFile,
  saveAgentConfig,
  saveConfluencePage,
  saveAgentInstructions,
  saveReviewComments,
  searchConfluencePages,
  type AgentChatMode,
  type AgentChatSession,
  type AgentChatTurn,
  type AgentMemoryAction,
  type AgentPerformanceMetrics,
  type ConfluenceSearchResult,
  type CorpusActivityEvent,
  type PromptMacro,
  type ViewerAgentAction,
  updatePromptMacro,
  updateAgentChatSession,
} from "./api";
import { destroyChartsInRoot, runChartJsInRoot } from "./chartJsBlocks";
import { htmlFragmentToMarkdown, markdownHtmlTablesToMarkdown } from "./htmlToMarkdown";
import { runMermaidInRoot } from "./mermaidDiagrams";
import { renderMarkdown, tocDisplayLabel, type TocEntry } from "./markdown";
import { MV_CHANGE_NEW_CLASS, MV_CHANGE_OLD_CLASS } from "./reviewChangeDom";
import {
  addTableColumnLeft,
  addTableColumnRight,
  addTableRowAbove,
  addTableRowBelow,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  focusAdjacentTableCell,
  getActiveTableCell,
  insertTableAtSelection,
} from "./tableEditor";
import {
  anchorFromSelection,
  applyReviewHighlights,
  lastReplyIsFromAgent,
  newReviewComment,
  REVIEW_HIGHLIGHT_CLASS,
  stripReviewHighlights,
  syncAnchorsFromDom,
  threadMessageCount,
  unwrapHighlightById,
  wrapRangeWithHighlight,
  type ReviewComment,
} from "./reviewComments";
import { shouldMergeDocumentChatIntoSession } from "./nexus-chat-session-policy.mjs";
import { buildProseSheets, type VisualSheetSplit } from "./visualPages";

/** Browservoorspraak (Web Speech API); niet overal in lib.dom aanwezig. */
type AgentSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: AgentSpeechRecognitionResultEvent) => void) | null;
  onerror: ((ev: AgentSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type AgentSpeechRecognitionResultEvent = {
  results: ArrayLike<{
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: { readonly transcript: string };
  }>;
};

type AgentSpeechRecognitionErrorEvent = { error: string };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const MV_AGENT_SNIPPET_HIGHLIGHT_CLASS = "mv-agent-snippet-highlight";

function clearAgentSnippetHighlights(root: HTMLElement): void {
  root.querySelectorAll(`mark.${MV_AGENT_SNIPPET_HIGHLIGHT_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function wrapTextNodeSubstring(textNode: Text, start: number, end: number): HTMLElement {
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const mark = document.createElement("mark");
  mark.className = MV_AGENT_SNIPPET_HIGHLIGHT_CLASS;
  range.surroundContents(mark);
  return mark;
}

/** Zoekt het eerste voorkomen van `snippet` in gerenderde `.mv-prose` en markeert het; retourneert false als niet gevonden. */
function highlightSnippetInProseHost(proseHostEl: HTMLElement, snippet: string): boolean {
  clearAgentSnippetHighlights(proseHostEl);
  const needle = snippet.trim();
  if (!needle) return false;
  const proseRoots = proseHostEl.querySelectorAll(".mv-prose");
  for (const prose of proseRoots) {
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const node = n as Text;
      const parentEl = node.parentElement;
      if (!parentEl || parentEl.closest("script, style, svg")) continue;
      const txt = node.textContent ?? "";
      const idx = txt.indexOf(needle);
      if (idx >= 0) {
        try {
          const mark = wrapTextNodeSubstring(node, idx, idx + needle.length);
          mark.scrollIntoView({ block: "center", behavior: "smooth" });
          return true;
        } catch {
          /* surroundContents faalt bij complexe DOM-splitsingen */
        }
      }
    }
  }
  return false;
}

function asTemplate(data: Record<string, unknown>): ViewerTemplate {
  return data as ViewerTemplate;
}

function getSpeechRecognitionCtor(): (new () => AgentSpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => AgentSpeechRecognition;
    webkitSpeechRecognition?: new () => AgentSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function joinTranscriptChunks(a: string, b: string): string {
  if (!b) return a;
  if (!a) return b;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  return `${a} ${b}`;
}

const AGENT_CHAT_MIC_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

function sheetSplit(screen: ViewerTemplate["screen"]): VisualSheetSplit {
  const mode = screen?.visualPageSplit;
  if (mode === "h2") return "h2";
  if (mode === "both") return "both";
  return "h1";
}

function mountProseArtifacts(merged: ViewerTemplate, html: string, proseHost: HTMLElement) {
  destroyChartsInRoot(proseHost);
  proseHost.replaceChildren();
  const screen = merged.screen || {};
  const useVisual = screen.visualPageBreaks !== false;

  if (!useVisual) {
    const art = el("article", "mv-page");
    const proseDiv = el("div", "mv-prose");
    proseDiv.innerHTML = html;
    art.append(proseDiv);
    proseHost.append(art);
    void Promise.all([runMermaidInRoot(proseHost), runChartJsInRoot(proseHost)]);
    return;
  }

  const sheets = buildProseSheets(html, sheetSplit(screen));
  for (const frag of sheets) {
    const art = el("article", "mv-page mv-page--sheet");
    const proseDiv = el("div", "mv-prose");
    proseDiv.appendChild(frag);
    art.append(proseDiv);
    proseHost.append(art);
  }
  void Promise.all([runMermaidInRoot(proseHost), runChartJsInRoot(proseHost)]);
}

/** Class op elk bewerk-“vel”; matcht flatten in htmlFromEditRootForMarkdown. */
const EDIT_SHEET_PAGE_CLASS = "mv-page--editing-sheet";

function lockConfluenceMacroPlaceholders(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".mv-confluence-macro[data-confluence-macro-b64]").forEach((node) => {
    node.contentEditable = "false";
    node.setAttribute("aria-readonly", "true");
    node.setAttribute("role", "note");
    node.title = "Confluence macro: niet bewerkbaar. Bij opslaan wordt de originele macro teruggezet.";
  });
}

function mountEditSheetPages(host: HTMLElement, html: string): void {
  destroyChartsInRoot(host);
  host.replaceChildren();
  const cleanHtml = html.trim() ? html : "<p><br></p>";
  const sheets = buildProseSheets(cleanHtml, "both");
  for (const frag of sheets) {
    const art = el("article", `mv-page mv-page--sheet ${EDIT_SHEET_PAGE_CLASS}`);
    const inner = el("div", "mv-prose");
    inner.appendChild(frag);
    art.append(inner);
    host.append(art);
  }
  lockConfluenceMacroPlaceholders(host);
  void Promise.all([runMermaidInRoot(host), runChartJsInRoot(host)]);
}

function flattenEditSheetHostToHtml(host: HTMLElement): string {
  const inners = host.querySelectorAll(`:scope > article.${EDIT_SHEET_PAGE_CLASS} > .mv-prose`);
  if (inners.length === 0) return host.innerHTML;
  return Array.from(inners)
    .map((n) => (n as HTMLElement).innerHTML)
    .join("");
}

function htmlFromEditRootForMarkdown(surface: HTMLElement): string {
  if (surface.classList.contains("mv-edit-sheet-stack")) {
    return flattenEditSheetHostToHtml(surface);
  }
  return surface.innerHTML;
}

function topLevelNodesFromHtml(html: string): HTMLElement[] {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return Array.from(tpl.content.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function comparableHtml(node: HTMLElement): string {
  return node.outerHTML.replace(/\s+/g, " ").trim();
}

function markChangeNode(node: HTMLElement, kind: "old" | "new"): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.classList.add(kind === "old" ? MV_CHANGE_OLD_CLASS : MV_CHANGE_NEW_CLASS);
  copy.dataset.changeKind = kind;
  if (kind === "old") {
    copy.contentEditable = "false";
    copy.setAttribute("aria-label", "Oude tekst");
  } else {
    copy.setAttribute("aria-label", "Nieuwe tekst");
  }
  return copy;
}

function buildChangeMarkedHtml(previousMarkdown: string, currentMarkdown: string): string {
  const oldNodes = topLevelNodesFromHtml(renderMarkdown(previousMarkdown).html);
  const newNodes = topLevelNodesFromHtml(renderMarkdown(currentMarkdown).html);
  const oldKeys = oldNodes.map(comparableHtml);
  const newKeys = newNodes.map(comparableHtml);
  const dp: number[][] = Array.from({ length: oldKeys.length + 1 }, () =>
    Array(newKeys.length + 1).fill(0),
  );

  for (let i = oldKeys.length - 1; i >= 0; i--) {
    for (let j = newKeys.length - 1; j >= 0; j--) {
      dp[i][j] = oldKeys[i] === newKeys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = document.createElement("div");
  let i = 0;
  let j = 0;
  while (i < oldNodes.length || j < newNodes.length) {
    if (i < oldNodes.length && j < newNodes.length && oldKeys[i] === newKeys[j]) {
      out.append(newNodes[j].cloneNode(true));
      i++;
      j++;
    } else if (j < newNodes.length && (i === oldNodes.length || dp[i][j + 1] >= dp[i + 1][j])) {
      out.append(markChangeNode(newNodes[j], "new"));
      j++;
    } else if (i < oldNodes.length) {
      out.append(markChangeNode(oldNodes[i], "old"));
      i++;
    }
  }
  return out.innerHTML;
}

function stripChangeMarkers(root: HTMLElement) {
  root.classList.remove("mv-prose--change-review");
  root.querySelectorAll<HTMLElement>(`.${MV_CHANGE_OLD_CLASS}`).forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>(`.${MV_CHANGE_NEW_CLASS}`).forEach((node) => {
    node.classList.remove(MV_CHANGE_NEW_CLASS);
    delete node.dataset.changeKind;
    node.removeAttribute("aria-label");
  });
}

function hasChangeMarkers(root: HTMLElement): boolean {
  return !!root.querySelector(`.${MV_CHANGE_OLD_CLASS}, .${MV_CHANGE_NEW_CLASS}`);
}

const TEMPLATE_STORAGE_KEY = "markdown-viewer.selectedTemplate.json";

/** `fileSelect.value` when the document is the file chosen via Openen… (File System Access API). */
const EXTERNAL_MARKDOWN_VALUE = "__mv_external__";

const EXTERNAL_AGENT_VIRTUAL_PREFIX = "_mv_external/";

const AGENT_DEBUG_LLM_STORAGE_KEY = "mv.agentDebugLlm";

const AGENT_REPLY_MARKDOWN_STORAGE_KEY = "mv.agentReplyMarkdown";

function readStoredAgentReplyMarkdown(): boolean {
  try {
    const v = localStorage.getItem(AGENT_REPLY_MARKDOWN_STORAGE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* private mode / storage disabled */
  }
  return true;
}

function readAgentDebugLlm(): boolean {
  try {
    return localStorage.getItem(AGENT_DEBUG_LLM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAgentDebugLlm(enabled: boolean): void {
  try {
    localStorage.setItem(AGENT_DEBUG_LLM_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

export async function bootstrap() {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app ontbreekt");

  let currentMd = "";
  let currentMerged: ViewerTemplate = defaultTemplate;
  let templatesAvailable = false;

  let isEditing = false;
  let isDirty = false;
  /** Welk document bij `editRoot` hoort (gelijk aan `fileSelect.value` behalve tijdens een net gestarte file-change). */
  let editorBoundDoc: string | null = null;
  let autoSaveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let editorTocDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAutoSaveOkAt = 0;
  let persistChain: Promise<void> = Promise.resolve();
  let editRoot: HTMLElement | null = null;
  let ribbonRaf = 0;
  let reviewComments: ReviewComment[] = [];
  let reviewDraftRange: Range | null = null;
  let selectedFolder = "";
  let externalDocumentKind: "none" | "disk" | "confluence" = "none";
  let externalFileHandle: FileSystemFileHandle | null = null;
  let externalFileLabel = "";
  let externalConfluencePage: {
    id: string;
    title: string;
    version: number;
    url: string;
  } | null = null;
  let agentChatMode: AgentChatMode = "agent";
  let agentChatSessions: AgentChatSession[] = [];
  let activeAgentChatId = "";
  let agentChatHistory: AgentChatTurn[] = [];
  let promptMacros: PromptMacro[] = [];
  let agentChatRequestBusy = false;
  let pendingMemoryActions: AgentMemoryAction[] = [];
  let revertibleMemoryActions: AgentMemoryAction[] = [];
  let memoryPanelVisible = false;
  let memoryMarkdownPaths: string[] = [];
  let agentChatSpeechRec: AgentSpeechRecognition | null = null;
  let agentChatSpeechPrefix = "";
  let agentChatSpeechTranscript = "";
  let agentChatSpeechStopTranscript = "";
  let agentChatSpeechShouldCleanup = false;
  let agentChatTranscriptCleanupBusy = false;
  /** `runAgent` / review-batch bezig; deelt dezelfde disable-regels als chat. */
  let sidebarReviewBusy = false;
  /** Paden uit Files/ voor de linker boom (zonder externe sessie-optie). */
  let corpusMarkdownPaths: string[] = [];
  /** Alle mappen onder Files/ (ook zonder .md), voor lege mappen in de boom. */
  let corpusMarkdownFolders: string[] = [];
  /** Welke mappen (relatief pad, bv. `01-managed-services/handouts`) zijn uitgeklapt. Standaard leeg = alles ingeklapt. */
  const fileTreeExpandedPaths = new Set<string>();
  /** Pad van een .md dat uit de boom gesleept wordt (HTML5 drag); drop → `renameMarkdownPath`. */
  let treeDragMarkdownPath: string | null = null;
  /** `visual` = WYSIWYG; `code` = ruwe markdown in textarea. */
  let editorSurfaceMode: "visual" | "code" = "visual";
  let editorCodeTextarea: HTMLTextAreaElement | null = null;
  let editorVisualWrap: HTMLElement | null = null;
  let editorCodeWrap: HTMLElement | null = null;
  const MAX_AGENT_CHAT_HISTORY = 40;
  const shell = el("div", "mv-app");
  const toolbar = el("header", "mv-toolbar");

  const fileField = el("div", "mv-field mv-sr-only");
  fileField.append(el("label", "", "Markdown-bestand"), document.createElement("select"));
  const fileSelect = fileField.querySelector("select")!;

  const tplField = el("div", "mv-field mv-field--toolbar");
  tplField.append(el("label", "", "Template"), document.createElement("select"));
  tplField.querySelector("label")!.classList.add("mv-sr-only");
  const tplSelect = tplField.querySelector("select")!;

  const toolbarDocName = el("span", "mv-toolbar__doc-name", "—");
  const toolbarDocRow = el("div", "mv-toolbar__doc-row");
  toolbarDocRow.append(toolbarDocName);
  const toolbarDoc = el("div", "mv-toolbar__doc");
  toolbarDoc.append(el("span", "mv-toolbar__doc-eyebrow", "Document"), toolbarDocRow);

  const mobileTopbar = el("div", "mv-mobile-topbar");
  const mobileFileTreeBtn = el("button", "mv-mobile-icon-btn", "Bestanden");
  mobileFileTreeBtn.type = "button";
  mobileFileTreeBtn.setAttribute("aria-label", "Bestandsboom openen");
  const mobileDocName = el("span", "mv-mobile-doc-name", "—");
  const mobileChatBtn = el("button", "mv-mobile-icon-btn", "Agent");
  mobileChatBtn.type = "button";
  mobileChatBtn.setAttribute("aria-label", "Agent-chat openen");
  const mobileMenuBtn = el("button", "mv-mobile-icon-btn mv-mobile-icon-btn--menu", "Menu");
  mobileMenuBtn.type = "button";
  mobileMenuBtn.setAttribute("aria-label", "Menu openen");
  mobileTopbar.append(mobileFileTreeBtn, mobileDocName, mobileChatBtn, mobileMenuBtn);

  const actions = el("div", "mv-toolbar__actions");
  const browseFilesBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Openen…");
  browseFilesBtn.type = "button";
  browseFilesBtn.title =
    "Open een .md-bestand op je schijf (Edge of Chrome). Geen kopie in Files/: opslaan schrijft terug naar dat bestand.";
  const pasteMdBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Plakken");
  pasteMdBtn.type = "button";
  pasteMdBtn.title =
    "Nieuw of aangepast Markdown: plakken, of een .md-bestand als start laden; wordt opgeslagen in de werkmap.";
  const settingsBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Instellingen");
  settingsBtn.type = "button";
  settingsBtn.title = "Template (JSON) en LLM-agentconfiguratie";
  const wordExportBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Word");
  wordExportBtn.type = "button";
  wordExportBtn.title =
    "Exporteer Markdown naar Word (.docx) via LLM2DOCX-templates (huidige tekst in de editor, inclusief laatste automatische opslag).";
  const docxImportBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Word → MD");
  docxImportBtn.type = "button";
  docxImportBtn.title =
    "Importeer een Word-bestand (.docx): omzetten naar Markdown en opslaan in de werkmap (Files/).";
  const confluenceImportBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Confluence");
  confluenceImportBtn.type = "button";
  confluenceImportBtn.title =
    "Importeer een Confluence-pagina tijdelijk in de editor en sla wijzigingen later terug naar Confluence.";
  const confluenceSearchBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Zoek Confluence");
  confluenceSearchBtn.type = "button";
  confluenceSearchBtn.title = "Zoek Confluence-pagina's via de server-side PAT en importeer een gevonden pagina.";
  const printBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Afdruk");
  printBtn.type = "button";
  printBtn.title =
    "Echte nieuwe papier-/PDF-pagina’s bij # en ## zie je in het afdrukvoorbeeld of PDF; op het scherm tonen witte blokken tussen hoofdstukken.";
  actions.append(
    browseFilesBtn,
    pasteMdBtn,
    settingsBtn,
    wordExportBtn,
    docxImportBtn,
    confluenceImportBtn,
    confluenceSearchBtn,
    printBtn,
  );

  const status = el("div", "mv-status");
  const toolbarStatus = el("div", "mv-toolbar__status");
  toolbarStatus.append(status);

  const toolbarPrimary = el("div", "mv-toolbar__primary");
  toolbarPrimary.append(toolbarDoc);

  const toolbarTop = el("div", "mv-toolbar__top");
  toolbarTop.append(toolbarPrimary, actions);

  const toolbarInner = el("div", "mv-toolbar__inner");
  toolbarInner.append(fileField, mobileTopbar, toolbarTop, toolbarStatus);
  toolbar.append(toolbarInner);

  const ribbon = el("aside", "mv-ribbon");
  ribbon.setAttribute("aria-label", "Bewerkbalk");
  ribbon.hidden = true; /* na eerste documentload altijd zichtbaar */

  const ribbonInner = el("div", "mv-ribbon-inner");
  const ribbonBody = el("div", "mv-ribbon-body");

  const groupStyle = el("div", "mv-ribbon-group");
  groupStyle.append(el("span", "mv-ribbon-group-label", "Opmaak"));
  const styleTools = el("div", "mv-ribbon-tools");

  const boldBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--strong", "B");
  boldBtn.type = "button";
  boldBtn.title = "Vet — Ctrl+B";

  const italicBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--em", "I");
  italicBtn.type = "button";
  italicBtn.title = "Cursief — Ctrl+I";

  const inlineCodeBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--code", "Code");
  inlineCodeBtn.type = "button";
  inlineCodeBtn.title = "Inline code op selectie";

  const h1Btn = el("button", "mv-ribbon-btn mv-ribbon-btn--heading", "Kop 1");
  h1Btn.type = "button";
  h1Btn.title = "Kopniveau 1";

  const h2Btn = el("button", "mv-ribbon-btn mv-ribbon-btn--heading", "Kop 2");
  h2Btn.type = "button";
  h2Btn.title = "Kopniveau 2";

  const h3Btn = el("button", "mv-ribbon-btn mv-ribbon-btn--heading", "Kop 3");
  h3Btn.type = "button";
  h3Btn.title = "Kopniveau 3";

  const h4Btn = el("button", "mv-ribbon-btn mv-ribbon-btn--heading", "Kop 4");
  h4Btn.type = "button";
  h4Btn.title = "Kopniveau 4";

  const quoteBtn = el("button", "mv-ribbon-btn", "Citaat");
  quoteBtn.type = "button";
  quoteBtn.title = "Blockquote op huidige alinea";

  styleTools.append(
    boldBtn,
    italicBtn,
    inlineCodeBtn,
    el("span", "mv-ribbon-sep"),
    h1Btn,
    h2Btn,
    h3Btn,
    h4Btn,
    quoteBtn,
  );
  groupStyle.append(styleTools);

  const groupLists = el("div", "mv-ribbon-group");
  groupLists.append(el("span", "mv-ribbon-group-label", "Lijsten"));
  const listTools = el("div", "mv-ribbon-tools");

  const ulBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--list", "Bolletjes");
  ulBtn.type = "button";
  ulBtn.title = "Opsommingslijst. Geneste niveaus: Inspringen of Tab in een regel.";

  const olBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--list", "Nummering");
  olBtn.type = "button";
  olBtn.title = "Genummerde lijst. Geneste niveaus: Inspringen of Tab in een regel.";

  const outdentBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--list", "Uitspringen");
  outdentBtn.type = "button";
  outdentBtn.title = "Lijstniveau verlagen — Shift+Tab";

  const indentBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--list", "Inspringen");
  indentBtn.type = "button";
  indentBtn.title = "Lijstniveau verhogen — Tab (in een lijstregel)";

  listTools.append(ulBtn, olBtn, el("span", "mv-ribbon-sep"), outdentBtn, indentBtn);
  groupLists.append(listTools);

  const groupTable = el("div", "mv-ribbon-group");
  groupTable.append(el("span", "mv-ribbon-group-label", "Tabel"));
  const tableTools = el("div", "mv-ribbon-tools");

  const tableInsertBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Invoegen");
  tableInsertBtn.type = "button";
  tableInsertBtn.title = "Nieuwe tabel (3 kolommen, kop + 2 rijen) op de cursorplaats";

  const rowAboveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Rij ↑");
  rowAboveBtn.type = "button";
  rowAboveBtn.title = "Rij boven de huidige invoegen";

  const rowBelowBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Rij ↓");
  rowBelowBtn.type = "button";
  rowBelowBtn.title = "Rij onder de huidige invoegen";

  const rowDelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Rij ×");
  rowDelBtn.type = "button";
  rowDelBtn.title = "Huidige rij verwijderen (minimaal één rij blijft)";

  const colLeftBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Kolom ←");
  colLeftBtn.type = "button";
  colLeftBtn.title = "Kolom links van de cursor invoegen";

  const colRightBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Kolom →");
  colRightBtn.type = "button";
  colRightBtn.title = "Kolom rechts van de cursor invoegen";

  const colDelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Kolom ×");
  colDelBtn.type = "button";
  colDelBtn.title = "Huidige kolom verwijderen (minimaal één kolom blijft)";

  const tableDelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Tabel ×");
  tableDelBtn.type = "button";
  tableDelBtn.title = "Hele tabel verwijderen";

  tableTools.append(
    tableInsertBtn,
    el("span", "mv-ribbon-sep"),
    rowAboveBtn,
    rowBelowBtn,
    rowDelBtn,
    el("span", "mv-ribbon-sep"),
    colLeftBtn,
    colRightBtn,
    colDelBtn,
    el("span", "mv-ribbon-sep"),
    tableDelBtn,
  );
  groupTable.append(tableTools);

  const groupInsert = el("div", "mv-ribbon-group");
  groupInsert.append(el("span", "mv-ribbon-group-label", "Markdown"));
  const insertTools = el("div", "mv-ribbon-tools");
  const codeBlockBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--code", "Codeblok");
  codeBlockBtn.type = "button";
  codeBlockBtn.title = "Codeblok invoegen van selectie of voorbeeldtekst";
  const linkBtn = el("button", "mv-ribbon-btn", "Link");
  linkBtn.type = "button";
  linkBtn.title = "Link maken van selectie";
  const hrBtn = el("button", "mv-ribbon-btn", "Lijn");
  hrBtn.type = "button";
  hrBtn.title = "Horizontale lijn invoegen";
  insertTools.append(codeBlockBtn, linkBtn, hrBtn);
  groupInsert.append(insertTools);

  const groupReview = el("div", "mv-ribbon-group");
  groupReview.append(el("span", "mv-ribbon-group-label", "Review"));
  const reviewTools = el("div", "mv-ribbon-tools");
  const commentAddBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--review", "Commentaar");
  commentAddBtn.type = "button";
  commentAddBtn.title =
    "Selecteer tekst, klik hier: de selectie verschijnt boven het chatveld. Typ je opmerking en druk op Verzend — de agent verwerkt direct. Sneltoets: Ctrl+Q start direct inspreken (alleen Ctrl, niet Cmd op macOS).";
  reviewTools.append(commentAddBtn);
  groupReview.append(reviewTools);

  const groupDoc = el("div", "mv-ribbon-group");
  groupDoc.append(el("span", "mv-ribbon-group-label", "Document"));
  const docTools = el("div", "mv-ribbon-tools");
  const saveDocBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan");
  saveDocBtn.type = "button";
  saveDocBtn.title =
    "Sla het geopende document handmatig op. Bij Confluence schrijft dit een nieuwe Confluence-versie; autosave naar Confluence staat uit.";
  const discardBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Herstellen");
  discardBtn.type = "button";
  discardBtn.title =
    "Tekst terugzetten naar de laatst opgeslagen of geïmporteerde versie.";
  const sourceToggleBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Markdown");
  sourceToggleBtn.type = "button";
  sourceToggleBtn.title = "Ruwe markdown tonen en bewerken. Keer terug met Weergave.";
  sourceToggleBtn.setAttribute("aria-pressed", "false");
  docTools.append(saveDocBtn, discardBtn, el("span", "mv-ribbon-sep"), sourceToggleBtn);
  groupDoc.append(docTools);

  ribbonBody.append(groupStyle, groupLists, groupTable, groupInsert, groupReview, groupDoc);
  ribbonInner.append(ribbonBody);
  ribbon.append(ribbonInner);

  const main = el("main", "mv-main");
  const root = el("div", "mv-root");
  const stack = el("div", "mv-stack");

  root.append(stack);
  main.append(root);

  const bodyWrap = el("div", "mv-body-wrap");
  const agentChatPanel = el("aside", "mv-agent-chat");
  agentChatPanel.setAttribute("aria-label", "Agent-chat");
  const agentChatHead = el("div", "mv-agent-chat-head");
  const agentChatTitleRow = el("div", "mv-agent-chat-title-row");
  const agentChatTitle = el("h2", "mv-agent-chat-title", "Agent");
  const agentChatClearBtn = el("button", "mv-agent-chat-clear mv-ribbon-btn mv-ribbon-btn--ghost", "Wissen");
  agentChatClearBtn.type = "button";
  agentChatClearBtn.title = "Chatgeschiedenis in dit paneel leegmaken";
  const agentChatCloseBtn = el("button", "mv-agent-chat-close", "Sluiten");
  agentChatCloseBtn.type = "button";
  agentChatCloseBtn.setAttribute("aria-label", "Agent-overlay sluiten");
  agentChatTitleRow.append(agentChatTitle, agentChatClearBtn, agentChatCloseBtn);
  const agentChatSessionRow = el("div", "mv-agent-chat-session-row");
  const agentChatSessionSelect = document.createElement("select");
  agentChatSessionSelect.className = "mv-agent-chat-session-select";
  agentChatSessionSelect.setAttribute("aria-label", "Actieve chat");
  const agentChatNewBtn = el("button", "mv-agent-chat-session-btn", "Nieuw");
  agentChatNewBtn.type = "button";
  agentChatNewBtn.title = "Nieuwe documentonafhankelijke chat starten";
  const agentChatRenameBtn = el("button", "mv-agent-chat-session-btn", "Hernoemen");
  agentChatRenameBtn.type = "button";
  agentChatRenameBtn.title = "Actieve chat hernoemen";
  const agentChatDeleteBtn = el("button", "mv-agent-chat-session-btn mv-agent-chat-session-btn--danger", "Verwijderen");
  agentChatDeleteBtn.type = "button";
  agentChatDeleteBtn.title = "Actieve chat verwijderen";
  agentChatSessionRow.append(agentChatSessionSelect, agentChatNewBtn, agentChatRenameBtn, agentChatDeleteBtn);
  const agentChatModes = el("div", "mv-agent-chat-modes");
  agentChatModes.setAttribute("role", "group");
  agentChatModes.setAttribute("aria-label", "Chatmodus");
  const agentModeAgentBtn = el("button", "mv-agent-chat-mode mv-agent-chat-mode--active", "Agent");
  agentModeAgentBtn.type = "button";
  agentModeAgentBtn.setAttribute("aria-pressed", "true");
  agentModeAgentBtn.title =
    "Laat de LLM het document aanpassen (find/replace-patches). Optioneel: selecteer eerst tekst voor context. Akkoord / Niet akkoord verschijnen onder het agentantwoord in het chatvenster.";
  const agentModeAskBtn = el("button", "mv-agent-chat-mode", "Ask");
  agentModeAskBtn.type = "button";
  agentModeAskBtn.setAttribute("aria-pressed", "false");
  agentModeAskBtn.title = "Alleen vragen en uitleg; het document wordt niet automatisch aangepast.";
  agentChatModes.append(agentModeAgentBtn, agentModeAskBtn);
  const agentCorpusWideRow = el("label", "mv-agent-corpus-row");
  agentCorpusWideRow.setAttribute("for", "mv-agent-corpus-wide");
  agentCorpusWideRow.title =
    "Alleen bij Ask: antwoord op basis van alle Markdown-bestanden in Files via een automatische index (.mv-index).";
  const agentCorpusWideCheckbox = document.createElement("input");
  agentCorpusWideCheckbox.type = "checkbox";
  agentCorpusWideCheckbox.id = "mv-agent-corpus-wide";
  const agentCorpusWideText = el("span", "mv-agent-corpus-row-text", "Hele bibliotheek (corpus)");
  agentCorpusWideRow.append(agentCorpusWideCheckbox, agentCorpusWideText);
  agentCorpusWideRow.hidden = true;
  const agentWebSearchRow = el("label", "mv-agent-corpus-row");
  agentWebSearchRow.setAttribute("for", "mv-agent-web-search");
  agentWebSearchRow.title =
    "Alleen bij Ask: laat de server via Tavily actuele informatie op internet zoeken. Vereist TAVILY_API_KEY in .env/.env.local.";
  const agentWebSearchCheckbox = document.createElement("input");
  agentWebSearchCheckbox.type = "checkbox";
  agentWebSearchCheckbox.id = "mv-agent-web-search";
  const agentWebSearchText = el("span", "mv-agent-corpus-row-text", "Internet zoeken (Tavily)");
  agentWebSearchRow.append(agentWebSearchCheckbox, agentWebSearchText);
  agentWebSearchRow.hidden = true;
  const agentReplyMarkdownRow = el("label", "mv-agent-markdown-row");
  agentReplyMarkdownRow.setAttribute("for", "mv-agent-reply-markdown");
  agentReplyMarkdownRow.title =
    "Aan: het model mag Markdown in chat-antwoorden gebruiken en de viewer toont ze opgemaakt. Uit: het model moet platte tekst antwoorden (geen koppen, lijsten of code-opmaak).";
  const agentReplyMarkdownCheckbox = document.createElement("input");
  agentReplyMarkdownCheckbox.type = "checkbox";
  agentReplyMarkdownCheckbox.id = "mv-agent-reply-markdown";
  agentReplyMarkdownCheckbox.checked = readStoredAgentReplyMarkdown();
  const agentReplyMarkdownText = el("span", "mv-agent-markdown-row-text", "Markdown in antwoorden");
  agentReplyMarkdownRow.append(agentReplyMarkdownCheckbox, agentReplyMarkdownText);
  const agentMemoryToolsRow = el("div", "mv-agent-memory-tools-row");
  const agentChatPromoteBtn = el("button", "mv-agent-chat-session-btn", "Promoveer chat");
  agentChatPromoteBtn.type = "button";
  agentChatPromoteBtn.title = "Verwerk de actieve chat naar long-term memory";
  const agentChatPromoteStaleBtn = el("button", "mv-agent-chat-session-btn", "Verwerk stale");
  agentChatPromoteStaleBtn.type = "button";
  agentChatPromoteStaleBtn.title = "Promoveer chats die stale zijn naar long-term memory";
  const agentMemoryToggleBtn = el("button", "mv-agent-chat-session-btn", "Memory");
  agentMemoryToggleBtn.type = "button";
  agentMemoryToggleBtn.title = "Toon of verberg inspecteerbare agent-memory";
  const agentCorpusRefreshBtn = el("button", "mv-agent-chat-session-btn", "Ververs corpus");
  agentCorpusRefreshBtn.type = "button";
  agentCorpusRefreshBtn.title = "Herbouw de werkdocument- en memory-index en ververs de corpusinformatie";
  const agentSecondBrainBtn = el("button", "mv-agent-chat-session-btn", "Second brain");
  agentSecondBrainBtn.type = "button";
  agentSecondBrainBtn.title = "Toon metadata-, backlink- en mention-samenvatting van de second-brain index";
  const agentAskToAgentBtn = el("button", "mv-agent-chat-session-btn", "Ask → Agent");
  agentAskToAgentBtn.type = "button";
  agentAskToAgentBtn.title =
    "Gebruik het laatste Ask-antwoord als basis voor een Agent-instructie om het open document reviewbaar aan te passen";
  agentMemoryToolsRow.append(
    agentChatPromoteBtn,
    agentChatPromoteStaleBtn,
    agentMemoryToggleBtn,
    agentCorpusRefreshBtn,
    agentSecondBrainBtn,
    agentAskToAgentBtn,
  );
  agentChatHead.append(
    agentChatTitleRow,
    agentChatSessionRow,
    agentChatModes,
    agentCorpusWideRow,
    agentWebSearchRow,
    agentReplyMarkdownRow,
    agentMemoryToolsRow,
  );

  agentReplyMarkdownCheckbox.addEventListener("change", () => {
    try {
      localStorage.setItem(AGENT_REPLY_MARKDOWN_STORAGE_KEY, agentReplyMarkdownCheckbox.checked ? "1" : "0");
    } catch {
      /* */
    }
    rerenderAgentChatMessages();
  });

  const agentSidebarBusy = el("div", "mv-agent-sidebar-busy");
  agentSidebarBusy.hidden = true;
  agentSidebarBusy.setAttribute("role", "status");
  agentSidebarBusy.setAttribute("aria-live", "polite");
  const agentSidebarBusyText = el("span", "mv-agent-sidebar-busy-text", "Even geduld…");
  agentSidebarBusy.append(el("span", "mv-agent-sidebar-busy-dot", ""), agentSidebarBusyText);

  const agentSidebarScroll = el("div", "mv-agent-sidebar-scroll");
  const agentMemoryPanel = el("div", "mv-agent-memory-panel");
  agentMemoryPanel.hidden = true;
  const agentChatActivityStrip = el("div", "mv-agent-chat-activity");
  agentChatActivityStrip.setAttribute("aria-live", "polite");
  agentChatActivityStrip.setAttribute("aria-label", "Activiteit corpus-chat");
  agentChatActivityStrip.hidden = true;
  const agentChatMessages = el("div", "mv-agent-chat-messages");
  agentSidebarScroll.append(agentMemoryPanel, agentChatActivityStrip, agentChatMessages);

  function formatCorpusActivityLine(ev: CorpusActivityEvent): string {
    if (ev.phase === "read_file" && ev.path) {
      let s = `Bestand lezen: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "read_outline" && ev.path) {
      let s = `Koppen lezen: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "read_section" && ev.path) {
      let s = `Sectie lezen: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "read_memory_outline" && ev.path) {
      let s = `Memory-koppen lezen: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "read_memory_section" && ev.path) {
      let s = `Memory-sectie lezen: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "create_file" && ev.path) {
      let s = `Bestand aanmaken: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "update_file" && ev.path) {
      let s = `Bestand bijwerken: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "memory_suggestion" && ev.path) {
      let s = `Geheugensuggestie: ${ev.path}`;
      if (ev.detail) s += ` — ${ev.detail}`;
      return s;
    }
    if (ev.phase === "web_search") {
      return ev.detail ? `Internet zoeken: ${ev.detail}` : "Internet zoeken…";
    }
    if (ev.phase === "fetching") return ev.label || "Volledige bestanden ophalen…";
    if (ev.phase === "digest") return ev.label || "Gelezen inhoud verwerken…";
    if (ev.phase === "thinking") return ev.label || "Model denkt na…";
    if (ev.phase === "done") return ev.label || "Antwoord gereed.";
    return ev.label || ev.phase || "Bezig…";
  }

  function clearAgentChatActivityStrip(): void {
    agentChatActivityStrip.replaceChildren();
    agentChatActivityStrip.hidden = true;
  }

  function pushCorpusActivityRow(ev: CorpusActivityEvent): void {
    agentChatActivityStrip.hidden = false;
    const line = formatCorpusActivityLine(ev);
    const row = el("div", "mv-agent-chat-activity-row");
    const dot = el("span", "mv-agent-chat-activity-dot");
    const tx = el("span", "mv-agent-chat-activity-text", line);
    row.append(dot, tx);
    agentChatActivityStrip.append(row);
    while (agentChatActivityStrip.childElementCount > 14) {
      agentChatActivityStrip.removeChild(agentChatActivityStrip.firstChild!);
    }
    agentSidebarScroll.scrollTop = agentSidebarScroll.scrollHeight;
  }

  function formatMetricNumber(n: number | undefined): string {
    return typeof n === "number" && Number.isFinite(n) ? new Intl.NumberFormat("nl-NL").format(Math.round(n)) : "n/a";
  }

  function formatDurationMs(ms: number | undefined): string {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return "n/a";
    return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${Math.round(ms)}ms`;
  }

  function formatAgentPerformanceMetrics(metrics?: AgentPerformanceMetrics): string {
    if (!metrics) return "";
    const totalTokens = metrics.tokenUsage?.totalTokens;
    const tokenPart =
      typeof totalTokens === "number" && totalTokens > 0
        ? `${formatMetricNumber(totalTokens)} tokens`
        : `~${formatMetricNumber(metrics.approxContextTokens)} contexttokens`;
    const retrievedPart =
      typeof metrics.approxRetrievedTokens === "number" && metrics.approxRetrievedTokens > 0
        ? `~${formatMetricNumber(metrics.approxRetrievedTokens)} opgehaalde tokens`
        : "geen extra documenttokens";
    return [
      `Totaal ${formatDurationMs(metrics.durationMs)}`,
      `LLM ${formatDurationMs(metrics.llmMs)} (${formatMetricNumber(metrics.llmCallCount)} call(s))`,
      `${formatMetricNumber(metrics.toolCallCount)} toolactie(s)`,
      tokenPart,
      retrievedPart,
    ].join(" · ");
  }

  function pushPerformanceMetricsRow(metrics?: AgentPerformanceMetrics): void {
    const line = formatAgentPerformanceMetrics(metrics);
    if (!line) return;
    agentChatActivityStrip.hidden = false;
    const row = el("div", "mv-agent-chat-activity-row mv-agent-chat-activity-row--metrics");
    const dot = el("span", "mv-agent-chat-activity-dot");
    const tx = el("span", "mv-agent-chat-activity-text", `Metrics: ${line}`);
    row.append(dot, tx);
    agentChatActivityStrip.append(row);
    while (agentChatActivityStrip.childElementCount > 14) {
      agentChatActivityStrip.removeChild(agentChatActivityStrip.firstChild!);
    }
  }

  const agentChatLlmDebug = el("div", "mv-agent-llm-debug");
  agentChatLlmDebug.hidden = true;
  agentChatLlmDebug.setAttribute("aria-label", "Ruwe LLM-respons (debug)");
  const agentChatLlmDebugHead = el("div", "mv-agent-llm-debug-head");
  const agentChatLlmDebugTitle = el("span", "mv-agent-llm-debug-title", "LLM-debug");
  const agentChatLlmDebugCopyBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Kopiëren");
  agentChatLlmDebugCopyBtn.type = "button";
  agentChatLlmDebugCopyBtn.title = "JSON naar klembord";
  const agentChatLlmDebugCloseBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Verbergen");
  agentChatLlmDebugCloseBtn.type = "button";
  agentChatLlmDebugHead.append(agentChatLlmDebugTitle, agentChatLlmDebugCopyBtn, agentChatLlmDebugCloseBtn);
  const agentChatLlmDebugPre = el("pre", "mv-agent-llm-debug-pre");
  agentChatLlmDebugPre.setAttribute("tabindex", "0");
  agentChatLlmDebug.append(agentChatLlmDebugHead, agentChatLlmDebugPre);

  const commentSelectionHost = el("div", "mv-agent-comment-selection");
  commentSelectionHost.hidden = true;
  const commentSelectionHead = el("div", "mv-agent-comment-selection-head");
  const commentSelectionLabel = el("div", "mv-agent-comment-selection-label", "Opmerking op selectie");
  const commentSelectionActions = el("div", "mv-agent-comment-selection-actions");
  const commentSelectionCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  commentSelectionCancelBtn.type = "button";
  commentSelectionCancelBtn.title = "Selectie en concept annuleren";
  commentSelectionActions.append(commentSelectionCancelBtn);
  commentSelectionHead.append(commentSelectionLabel, commentSelectionActions);
  const commentSelectionQuote = el("div", "mv-agent-comment-selection-quote");
  commentSelectionHost.append(commentSelectionHead, commentSelectionQuote);

  const agentChatComposer = el("div", "mv-agent-chat-composer");
  const agentChatInputWrap = el("div", "mv-agent-chat-input-wrap");
  const agentChatInput = document.createElement("textarea");
  agentChatInput.className = "mv-agent-chat-input";
  agentChatInput.rows = 3;
  agentChatInput.placeholder = "Beschrijf wat de agent in het document moet aanpassen…";
  const agentSpeechRecognitionAvailable = !!getSpeechRecognitionCtor();
  const agentChatMicBtn = el("button", "mv-agent-chat-mic mv-ribbon-btn mv-ribbon-btn--ghost");
  agentChatMicBtn.type = "button";
  agentChatMicBtn.setAttribute("aria-label", "Inspreken");
  agentChatMicBtn.setAttribute("aria-pressed", "false");
  agentChatMicBtn.title =
    "Inspreken (Nederlands). Klik opnieuw om te stoppen. Werkt het beste in Chrome of Edge.";
  agentChatMicBtn.innerHTML = AGENT_CHAT_MIC_SVG;
  if (!agentSpeechRecognitionAvailable) {
    agentChatMicBtn.hidden = true;
  }
  agentChatInputWrap.append(agentChatInput, agentChatMicBtn);
  const agentChatActions = el("div", "mv-agent-chat-actions");
  const meetingReportBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Gespreksverslag");
  meetingReportBtn.type = "button";
  meetingReportBtn.title =
    "Plak een transcript en laat de Agent een gespreksverslag in het geopende document plaatsen.";
  const promptMacroBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Macro");
  promptMacroBtn.type = "button";
  promptMacroBtn.title = "Kies, maak of beheer een herbruikbare promptmacro.";
  const agentChatSendBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Verzend");
  agentChatSendBtn.type = "button";
  agentChatActions.append(promptMacroBtn, meetingReportBtn, agentChatSendBtn);
  agentChatComposer.append(agentChatInputWrap, agentChatActions);

  async function cleanupAgentChatSpeechTranscript(prefix: string, rawSpeech: string): Promise<void> {
    const rawTranscript = rawSpeech.trim();
    if (!rawTranscript) return;
    agentChatTranscriptCleanupBusy = true;
    syncAgentSidebarBusyUi();
    syncAgentChatDisabled();
    status.textContent = "Transcript opschonen…";
    try {
      const result = await cleanupAgentTranscript(rawTranscript);
      const cleaned = result.text.trim();
      if (!cleaned) return;
      agentChatInput.value = joinTranscriptChunks(prefix, cleaned);
      agentChatInput.focus();
      agentChatInput.setSelectionRange(agentChatInput.value.length, agentChatInput.value.length);
      status.textContent = "Transcript opgeschoond.";
    } catch (e) {
      status.textContent = `Transcript opschonen mislukt: ${String((e as Error).message || e)}`;
    } finally {
      agentChatTranscriptCleanupBusy = false;
      syncAgentSidebarBusyUi();
      syncAgentChatDisabled();
    }
  }

  function stopAgentChatSpeech(options: { cleanup?: boolean; abort?: boolean } = {}): void {
    const r = agentChatSpeechRec;
    const cleanup = options.cleanup === true;
    const abort = options.abort === true;
    agentChatSpeechShouldCleanup = cleanup && !!r;
    if (cleanup && agentChatInput.value.startsWith(agentChatSpeechPrefix)) {
      agentChatSpeechStopTranscript = agentChatInput.value.slice(agentChatSpeechPrefix.length);
    }
    agentChatSpeechRec = null;
    if (r) {
      try {
        if (abort) r.abort();
        else r.stop();
      } catch {
        /* recognition may already be stopped */
      }
    }
    agentChatMicBtn.classList.remove("is-listening");
    agentChatMicBtn.setAttribute("aria-pressed", "false");
  }

  function startAgentChatSpeech(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      status.textContent =
        "Spraakherkenning wordt niet ondersteund in deze browser. Probeer Chrome of Edge.";
      return;
    }
    stopAgentChatSpeech({ abort: true });
    const prefix = agentChatInput.value;
    agentChatSpeechPrefix = prefix;
    agentChatSpeechTranscript = "";
    agentChatSpeechStopTranscript = "";
    agentChatSpeechShouldCleanup = false;
    const rec = new Ctor();
    agentChatSpeechRec = rec;
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event: AgentSpeechRecognitionResultEvent) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finals += t;
        else interim += t;
      }
      const speechTranscript = joinTranscriptChunks(finals, interim);
      agentChatSpeechTranscript = speechTranscript;
      agentChatInput.value = joinTranscriptChunks(prefix, speechTranscript);
    };
    rec.onerror = (event: AgentSpeechRecognitionErrorEvent) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      status.textContent =
        event.error === "not-allowed"
          ? "Microfoontoegang geweigerd — controleer de site-instellingen van de browser."
          : `Spraakherkenning: ${event.error}`;
      stopAgentChatSpeech({ abort: true });
    };
    rec.onend = () => {
      const shouldCleanup = agentChatSpeechShouldCleanup;
      const cleanupPrefix = agentChatSpeechPrefix;
      const cleanupTranscript = agentChatSpeechStopTranscript || agentChatSpeechTranscript;
      if (agentChatSpeechRec === rec) agentChatSpeechRec = null;
      agentChatSpeechShouldCleanup = false;
      agentChatSpeechPrefix = "";
      agentChatSpeechTranscript = "";
      agentChatSpeechStopTranscript = "";
      agentChatMicBtn.classList.remove("is-listening");
      agentChatMicBtn.setAttribute("aria-pressed", "false");
      if (shouldCleanup) void cleanupAgentChatSpeechTranscript(cleanupPrefix, cleanupTranscript);
    };
    try {
      rec.start();
      agentChatMicBtn.classList.add("is-listening");
      agentChatMicBtn.setAttribute("aria-pressed", "true");
    } catch (e) {
      status.textContent = `Spraak starten mislukt: ${String((e as Error).message)}`;
      stopAgentChatSpeech({ abort: true });
    }
  }

  agentChatMicBtn.addEventListener("click", () => {
    if (agentChatMicBtn.disabled || agentChatMicBtn.hidden) return;
    if (agentChatSpeechRec) {
      stopAgentChatSpeech({ cleanup: true });
      return;
    }
    startAgentChatSpeech();
  });

  function hideAgentChatLlmDebug(): void {
    agentChatLlmDebug.hidden = true;
    agentChatLlmDebugPre.textContent = "";
  }

  function showAgentChatLlmDebug(payload: Record<string, unknown>): void {
    try {
      agentChatLlmDebugPre.textContent = JSON.stringify(payload, null, 2);
    } catch {
      agentChatLlmDebugPre.textContent = String(payload);
    }
    agentChatLlmDebug.hidden = false;
  }

  agentChatLlmDebugCloseBtn.addEventListener("click", () => hideAgentChatLlmDebug());
  agentChatLlmDebugCopyBtn.addEventListener("click", () => {
    const t = agentChatLlmDebugPre.textContent ?? "";
    if (!t) return;
    void navigator.clipboard.writeText(t).then(
      () => {
        status.textContent = "LLM-debug gekopieerd naar klembord.";
      },
      () => {
        status.textContent = "Kopiëren naar klembord mislukt.";
      },
    );
  });

  agentChatPanel.append(
    agentChatHead,
    agentSidebarBusy,
    agentSidebarScroll,
    agentChatLlmDebug,
    commentSelectionHost,
    agentChatComposer,
  );

  const mobileBackdrop = el("button", "mv-mobile-backdrop");
  mobileBackdrop.type = "button";
  mobileBackdrop.setAttribute("aria-label", "Mobiele overlay sluiten");
  mobileBackdrop.hidden = true;

  const mobileMenu = el("nav", "mv-mobile-menu");
  mobileMenu.hidden = true;
  mobileMenu.setAttribute("aria-label", "Mobiel menu");
  const mobileMenuHead = el("div", "mv-mobile-menu-head");
  mobileMenuHead.append(el("strong", "", "Menu"));
  const mobileMenuCloseBtn = el("button", "mv-mobile-menu-close", "Sluiten");
  mobileMenuCloseBtn.type = "button";
  mobileMenuHead.append(mobileMenuCloseBtn);
  const mobileMenuActions = el("div", "mv-mobile-menu-actions");
  const makeMobileMenuButton = (label: string, run: () => void) => {
    const btn = el("button", "mv-mobile-menu-action", label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      closeMobileOverlays();
      run();
    });
    return btn;
  };
  mobileMenuActions.append(
    makeMobileMenuButton("Openen…", () => browseFilesBtn.click()),
    makeMobileMenuButton("Plakken", () => pasteMdBtn.click()),
    makeMobileMenuButton("Instellingen", () => settingsBtn.click()),
    makeMobileMenuButton("Word export", () => wordExportBtn.click()),
    makeMobileMenuButton("Word naar Markdown", () => docxImportBtn.click()),
    makeMobileMenuButton("Confluence importeren", () => confluenceImportBtn.click()),
    makeMobileMenuButton("Zoek Confluence", () => confluenceSearchBtn.click()),
    makeMobileMenuButton("Afdrukken", () => printBtn.click()),
    makeMobileMenuButton("Opslaan", () => saveDocBtn.click()),
    makeMobileMenuButton("Herstellen", () => discardBtn.click()),
    makeMobileMenuButton("Markdown-bron", () => sourceToggleBtn.click()),
  );
  mobileMenu.append(mobileMenuHead, mobileMenuActions);

  const mobileChatLauncher = el("button", "mv-mobile-chat-launcher", "Agent");
  mobileChatLauncher.type = "button";
  mobileChatLauncher.setAttribute("aria-label", "Agent-chat openen");

  const fileTreePanel = el("aside", "mv-file-tree");
  fileTreePanel.setAttribute("aria-label", "Markdown-bestanden");
  const fileTreeHead = el("div", "mv-file-tree-head");
  const fileTreeTitleRow = el("div", "mv-file-tree-title-row");
  const fileTreeTitle = el("h2", "mv-file-tree-title", "Bestanden");
  const fileTreeCloseBtn = el("button", "mv-file-tree-close", "Sluiten");
  fileTreeCloseBtn.type = "button";
  fileTreeCloseBtn.setAttribute("aria-label", "Bestandsboom sluiten");
  const fileTreeFilter = document.createElement("input");
  fileTreeFilter.type = "search";
  fileTreeFilter.className = "mv-file-tree-filter";
  fileTreeFilter.placeholder = "Filter…";
  fileTreeFilter.setAttribute("aria-label", "Filter bestandslijst");
  fileTreeTitleRow.append(fileTreeTitle, fileTreeCloseBtn);
  fileTreeHead.append(fileTreeTitleRow, fileTreeFilter);
  const fileTreeScroll = el("div", "mv-file-tree-scroll");
  fileTreePanel.append(fileTreeHead, fileTreeScroll);

  const treePaneResizer = el("div", "mv-body-pane-resizer mv-body-pane-resizer--tree");
  treePaneResizer.setAttribute("role", "separator");
  treePaneResizer.setAttribute("aria-orientation", "vertical");
  treePaneResizer.setAttribute(
    "aria-label",
    "Sleep om de breedte van de bestandsboom en het document aan te passen",
  );
  treePaneResizer.tabIndex = 0;

  const agentPaneResizer = el("div", "mv-body-pane-resizer mv-body-pane-resizer--agent");
  agentPaneResizer.setAttribute("role", "separator");
  agentPaneResizer.setAttribute("aria-orientation", "vertical");
  agentPaneResizer.setAttribute(
    "aria-label",
    "Sleep om de breedte van het Agent-paneel en het document aan te passen",
  );
  agentPaneResizer.tabIndex = 0;

  bodyWrap.append(fileTreePanel, treePaneResizer, main, agentPaneResizer, agentChatPanel);

  shell.append(toolbar, ribbon, bodyWrap, mobileBackdrop, mobileMenu, mobileChatLauncher);
  app.append(shell);

  const AGENT_PANE_WIDTH_STORAGE_KEY = "mv.agentPaneWidthPx";
  const TREE_PANE_WIDTH_STORAGE_KEY = "mv.treePaneWidthPx";
  const AGENT_PANE_DEFAULT_PX = 380;
  const TREE_PANE_DEFAULT_PX = 260;
  const AGENT_PANE_MIN_PX = 260;
  const TREE_PANE_MIN_PX = 180;
  const AGENT_PANE_DOC_MIN_PX = 280;
  const BODY_PANE_RESIZER_WIDTH = 6;
  const MOBILE_LAYOUT_QUERY = "(max-width: 760px)";
  const mobileLayoutMq = window.matchMedia(MOBILE_LAYOUT_QUERY);

  function setMobileBackdropVisible(visible: boolean): void {
    mobileBackdrop.hidden = !visible;
  }

  function syncMobileOverlayState(): void {
    const anyOpen =
      shell.classList.contains("is-mobile-menu-open") ||
      shell.classList.contains("is-mobile-file-tree-open") ||
      shell.classList.contains("is-mobile-chat-open");
    setMobileBackdropVisible(mobileLayoutMq.matches && anyOpen);
    mobileMenu.hidden = !shell.classList.contains("is-mobile-menu-open");
    mobileFileTreeBtn.setAttribute("aria-expanded", shell.classList.contains("is-mobile-file-tree-open") ? "true" : "false");
    mobileChatBtn.setAttribute("aria-expanded", shell.classList.contains("is-mobile-chat-open") ? "true" : "false");
    mobileChatLauncher.setAttribute("aria-expanded", shell.classList.contains("is-mobile-chat-open") ? "true" : "false");
    mobileMenuBtn.setAttribute("aria-expanded", shell.classList.contains("is-mobile-menu-open") ? "true" : "false");
  }

  function closeMobileOverlays(): void {
    shell.classList.remove("is-mobile-menu-open", "is-mobile-file-tree-open", "is-mobile-chat-open");
    syncMobileOverlayState();
  }

  function openMobileMenu(): void {
    shell.classList.remove("is-mobile-file-tree-open", "is-mobile-chat-open");
    shell.classList.add("is-mobile-menu-open");
    syncMobileOverlayState();
  }

  function openMobileFileTree(): void {
    shell.classList.remove("is-mobile-menu-open", "is-mobile-chat-open");
    shell.classList.add("is-mobile-file-tree-open");
    syncMobileOverlayState();
    requestAnimationFrame(() => fileTreeFilter.focus());
  }

  function toggleMobileChat(): void {
    shell.classList.remove("is-mobile-menu-open", "is-mobile-file-tree-open");
    shell.classList.toggle("is-mobile-chat-open");
    syncMobileOverlayState();
    if (shell.classList.contains("is-mobile-chat-open")) {
      requestAnimationFrame(() => agentChatInput.focus());
    }
  }

  syncMobileOverlayState();

  function readStoredAgentPaneWidth(): number {
    try {
      const v = localStorage.getItem(AGENT_PANE_WIDTH_STORAGE_KEY);
      const n = v ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= AGENT_PANE_MIN_PX) return Math.round(n);
    } catch {
      /* storage disabled */
    }
    return AGENT_PANE_DEFAULT_PX;
  }

  function readStoredTreePaneWidth(): number {
    try {
      const v = localStorage.getItem(TREE_PANE_WIDTH_STORAGE_KEY);
      const n = v ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= TREE_PANE_MIN_PX) return Math.round(n);
    } catch {
      /* storage disabled */
    }
    return TREE_PANE_DEFAULT_PX;
  }

  let agentPaneWidthPx = readStoredAgentPaneWidth();
  let treePaneWidthPx = readStoredTreePaneWidth();

  function maxAgentPaneWidthPx(): number {
    return Math.max(
      AGENT_PANE_MIN_PX,
      bodyWrap.clientWidth -
        treePaneWidthPx -
        AGENT_PANE_DOC_MIN_PX -
        2 * BODY_PANE_RESIZER_WIDTH,
    );
  }

  function maxTreePaneWidthPx(): number {
    return Math.max(
      TREE_PANE_MIN_PX,
      bodyWrap.clientWidth -
        agentPaneWidthPx -
        AGENT_PANE_DOC_MIN_PX -
        2 * BODY_PANE_RESIZER_WIDTH,
    );
  }

  function applyAgentPaneWidth(px: number, persistToStorage: boolean): void {
    const max = maxAgentPaneWidthPx();
    agentPaneWidthPx = Math.min(max, Math.max(AGENT_PANE_MIN_PX, Math.round(px)));
    bodyWrap.style.setProperty("--mv-agent-pane-width", `${agentPaneWidthPx}px`);
    if (persistToStorage) {
      try {
        localStorage.setItem(AGENT_PANE_WIDTH_STORAGE_KEY, String(agentPaneWidthPx));
      } catch {
        /* storage disabled */
      }
    }
  }

  function applyTreePaneWidth(px: number, persistToStorage: boolean): void {
    const max = maxTreePaneWidthPx();
    treePaneWidthPx = Math.min(max, Math.max(TREE_PANE_MIN_PX, Math.round(px)));
    bodyWrap.style.setProperty("--mv-tree-pane-width", `${treePaneWidthPx}px`);
    if (persistToStorage) {
      try {
        localStorage.setItem(TREE_PANE_WIDTH_STORAGE_KEY, String(treePaneWidthPx));
      } catch {
        /* storage disabled */
      }
    }
  }

  function applySidePaneWidthsAfterResize(): void {
    applyTreePaneWidth(treePaneWidthPx, false);
    applyAgentPaneWidth(agentPaneWidthPx, false);
    applyTreePaneWidth(treePaneWidthPx, false);
  }

  applyTreePaneWidth(treePaneWidthPx, false);
  applyAgentPaneWidth(agentPaneWidthPx, false);
  window.addEventListener("resize", () => applySidePaneWidthsAfterResize());

  let treePaneResizePointerId: number | null = null;
  let treePaneResizeStartX = 0;
  let treePaneResizeStartW = 0;

  treePaneResizer.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    treePaneResizePointerId = e.pointerId;
    treePaneResizeStartX = e.clientX;
    treePaneResizeStartW = treePaneWidthPx;
    treePaneResizer.classList.add("is-dragging");
    try {
      treePaneResizer.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
  });
  treePaneResizer.addEventListener("pointermove", (e) => {
    if (treePaneResizePointerId !== e.pointerId) return;
    applyTreePaneWidth(treePaneResizeStartW + (e.clientX - treePaneResizeStartX), false);
  });
  function endTreePaneResize(e: PointerEvent): void {
    if (treePaneResizePointerId !== e.pointerId) return;
    if (treePaneResizer.hasPointerCapture(e.pointerId)) {
      try {
        treePaneResizer.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }
    treePaneResizePointerId = null;
    treePaneResizer.classList.remove("is-dragging");
    applyTreePaneWidth(treePaneWidthPx, true);
  }
  treePaneResizer.addEventListener("pointerup", endTreePaneResize);
  treePaneResizer.addEventListener("pointercancel", endTreePaneResize);
  treePaneResizer.addEventListener("lostpointercapture", () => {
    treePaneResizePointerId = null;
    treePaneResizer.classList.remove("is-dragging");
  });

  treePaneResizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyTreePaneWidth(treePaneWidthPx - step, true);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyTreePaneWidth(treePaneWidthPx + step, true);
    }
  });

  let agentPaneResizePointerId: number | null = null;
  let agentPaneResizeStartX = 0;
  let agentPaneResizeStartW = 0;

  agentPaneResizer.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    agentPaneResizePointerId = e.pointerId;
    agentPaneResizeStartX = e.clientX;
    agentPaneResizeStartW = agentPaneWidthPx;
    agentPaneResizer.classList.add("is-dragging");
    try {
      agentPaneResizer.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
  });
  agentPaneResizer.addEventListener("pointermove", (e) => {
    if (agentPaneResizePointerId !== e.pointerId) return;
    applyAgentPaneWidth(agentPaneResizeStartW - (e.clientX - agentPaneResizeStartX), false);
  });
  function endAgentPaneResize(e: PointerEvent): void {
    if (agentPaneResizePointerId !== e.pointerId) return;
    if (agentPaneResizer.hasPointerCapture(e.pointerId)) {
      try {
        agentPaneResizer.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }
    agentPaneResizePointerId = null;
    agentPaneResizer.classList.remove("is-dragging");
    applyAgentPaneWidth(agentPaneWidthPx, true);
  }
  agentPaneResizer.addEventListener("pointerup", endAgentPaneResize);
  agentPaneResizer.addEventListener("pointercancel", endAgentPaneResize);
  agentPaneResizer.addEventListener("lostpointercapture", () => {
    agentPaneResizePointerId = null;
    agentPaneResizer.classList.remove("is-dragging");
  });

  agentPaneResizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyAgentPaneWidth(agentPaneWidthPx + step, true);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyAgentPaneWidth(agentPaneWidthPx - step, true);
    }
  });

  const reviewPopover = el("div", "mv-review-popover");
  reviewPopover.hidden = true;
  reviewPopover.setAttribute("role", "tooltip");
  document.body.append(reviewPopover);

  const mdStringDialog = el("div", "mv-md-dialog");
  mdStringDialog.hidden = true;
  mdStringDialog.setAttribute("role", "dialog");
  mdStringDialog.setAttribute("aria-modal", "true");
  mdStringDialog.setAttribute("aria-label", "Plakken of .md als start");
  const mdStringCard = el("div", "mv-md-dialog-card");
  const mdStringTitle = el("h2", "mv-md-dialog-title", "Plakken of .md als start");
  const mdStringHint = el(
    "div",
    "mv-md-dialog-hint",
    "Plak Markdown in het veld, of laad een bestaand .md-bestand als starttekst. De bestandsnaam is de locatie onder Files/ (relatief ten opzichte van de map van het huidige document).",
  );
  const mdStringNameLabel = el("label", "mv-md-dialog-label", "Bestandsnaam");
  mdStringNameLabel.setAttribute("for", "mv-md-string-name");
  const mdStringName = document.createElement("input");
  mdStringName.id = "mv-md-string-name";
  mdStringName.className = "mv-md-dialog-input";
  mdStringName.type = "text";
  mdStringName.placeholder = "bestandsnaam.md";
  const mdStringLoadRow = el("div", "mv-md-dialog-paste-load-row");
  const mdStringLoadBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", ".md-bestand laden…");
  mdStringLoadBtn.type = "button";
  mdStringLoadBtn.title = "Kies een .md-bestand; de inhoud verschijnt in het tekstveld (optioneel: vult de bestandsnaam in als die nog leeg is).";
  const mdStringTemplateInput = document.createElement("input");
  mdStringTemplateInput.type = "file";
  mdStringTemplateInput.accept = ".md,.markdown,text/markdown,text/plain";
  mdStringTemplateInput.hidden = true;
  app.append(mdStringTemplateInput);
  mdStringLoadRow.append(mdStringLoadBtn);
  const mdStringTextLabel = el("label", "mv-md-dialog-label", "Markdown-inhoud");
  mdStringTextLabel.setAttribute("for", "mv-md-string-text");
  const mdStringText = document.createElement("textarea");
  mdStringText.id = "mv-md-string-text";
  mdStringText.className = "mv-md-dialog-textarea";
  mdStringText.placeholder = "# Titel\n\nPlak hier Markdown, of laad een .md-bestand met de knop hierboven.";
  const mdStringActions = el("div", "mv-md-dialog-actions");
  const mdStringSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan als .md");
  mdStringSaveBtn.type = "button";
  const mdStringCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  mdStringCancelBtn.type = "button";
  mdStringActions.append(mdStringCancelBtn, mdStringSaveBtn);
  mdStringCard.append(
    mdStringTitle,
    mdStringHint,
    mdStringNameLabel,
    mdStringName,
    mdStringLoadRow,
    mdStringTextLabel,
    mdStringText,
    mdStringActions,
  );
  mdStringDialog.append(mdStringCard);
  document.body.append(mdStringDialog);

  const renameDialog = el("div", "mv-md-dialog");
  renameDialog.hidden = true;
  renameDialog.setAttribute("role", "dialog");
  renameDialog.setAttribute("aria-modal", "true");
  renameDialog.setAttribute("aria-label", "Document hernoemen");
  const renameCard = el("div", "mv-md-dialog-card");
  const renameTitle = el("h2", "mv-md-dialog-title", "Document hernoemen");
  const renameHintPath = el("div", "mv-md-dialog-hint", "");
  const renameNameLabel = el("label", "mv-md-dialog-label", "Nieuwe naam");
  renameNameLabel.setAttribute("for", "mv-md-rename-name");
  const renameInput = document.createElement("input");
  renameInput.id = "mv-md-rename-name";
  renameInput.className = "mv-md-dialog-input";
  renameInput.type = "text";
  renameInput.autocomplete = "off";
  renameInput.placeholder = "bestandsnaam.md";
  const renameActions = el("div", "mv-md-dialog-actions");
  const renameCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  renameCancelBtn.type = "button";
  const renameOkBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Hernoemen");
  renameOkBtn.type = "button";
  renameActions.append(renameCancelBtn, renameOkBtn);
  renameCard.append(renameTitle, renameHintPath, renameNameLabel, renameInput, renameActions);
  renameDialog.append(renameCard);
  document.body.append(renameDialog);
  let renameSourcePath: string | null = null;
  let renameIsExternal = false;

  const meetingReportDialog = el("div", "mv-md-dialog");
  meetingReportDialog.hidden = true;
  meetingReportDialog.setAttribute("role", "dialog");
  meetingReportDialog.setAttribute("aria-modal", "true");
  meetingReportDialog.setAttribute("aria-label", "Gespreksverslag maken");
  const meetingReportCard = el("div", "mv-md-dialog-card");
  const meetingReportTitle = el("h2", "mv-md-dialog-title", "Gespreksverslag maken");
  const meetingReportHint = el(
    "div",
    "mv-md-dialog-hint",
    "Plak hieronder het transcript. Na bevestigen stuurt de Agent een opdracht om het gespreksverslag in het geopende document te plaatsen.",
  );
  const meetingReportTranscriptLabel = el("label", "mv-md-dialog-label", "Transcript");
  meetingReportTranscriptLabel.setAttribute("for", "mv-meeting-report-transcript");
  const meetingReportTranscript = document.createElement("textarea");
  meetingReportTranscript.id = "mv-meeting-report-transcript";
  meetingReportTranscript.className = "mv-md-dialog-textarea";
  meetingReportTranscript.placeholder = "Plak hier het transcript van het gesprek...";
  const meetingReportActions = el("div", "mv-md-dialog-actions");
  const meetingReportCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  meetingReportCancelBtn.type = "button";
  const meetingReportSubmitBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Gespreksverslag maken");
  meetingReportSubmitBtn.type = "button";
  meetingReportActions.append(meetingReportCancelBtn, meetingReportSubmitBtn);
  meetingReportCard.append(
    meetingReportTitle,
    meetingReportHint,
    meetingReportTranscriptLabel,
    meetingReportTranscript,
    meetingReportActions,
  );
  meetingReportDialog.append(meetingReportCard);
  document.body.append(meetingReportDialog);

  const promptMacroDialog = el("div", "mv-md-dialog mv-prompt-macro-dialog");
  promptMacroDialog.hidden = true;
  promptMacroDialog.setAttribute("role", "dialog");
  promptMacroDialog.setAttribute("aria-modal", "true");
  promptMacroDialog.setAttribute("aria-label", "Promptmacro's");
  const promptMacroCard = el("div", "mv-md-dialog-card mv-prompt-macro-card");
  const promptMacroTitle = el("h2", "mv-md-dialog-title", "Promptmacro's");
  const promptMacroHint = el(
    "div",
    "mv-md-dialog-hint",
    "Maak herbruikbare opdrachten voor Agent of Ask. Een macro bestaat uit een vaste prompt en kan optioneel aanvullende inhoud vragen, zoals een transcript.",
  );
  const promptMacroSelectLabel = el("label", "mv-md-dialog-label", "Macro");
  promptMacroSelectLabel.setAttribute("for", "mv-prompt-macro-select");
  const promptMacroSelect = document.createElement("select");
  promptMacroSelect.id = "mv-prompt-macro-select";
  promptMacroSelect.className = "mv-md-dialog-input";
  const promptMacroManageActions = el("div", "mv-md-dialog-actions mv-prompt-macro-top-actions");
  const promptMacroNewBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Nieuw");
  promptMacroNewBtn.type = "button";
  const promptMacroDeleteBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--danger", "Verwijderen");
  promptMacroDeleteBtn.type = "button";
  promptMacroManageActions.append(promptMacroNewBtn, promptMacroDeleteBtn);
  const promptMacroNameLabel = el("label", "mv-md-dialog-label", "Naam");
  promptMacroNameLabel.setAttribute("for", "mv-prompt-macro-name");
  const promptMacroName = document.createElement("input");
  promptMacroName.id = "mv-prompt-macro-name";
  promptMacroName.className = "mv-md-dialog-input";
  promptMacroName.type = "text";
  promptMacroName.placeholder = "Bijv. Markdown pagina opschonen";
  const promptMacroDescriptionLabel = el("label", "mv-md-dialog-label", "Omschrijving");
  promptMacroDescriptionLabel.setAttribute("for", "mv-prompt-macro-description");
  const promptMacroDescription = document.createElement("input");
  promptMacroDescription.id = "mv-prompt-macro-description";
  promptMacroDescription.className = "mv-md-dialog-input";
  promptMacroDescription.type = "text";
  promptMacroDescription.placeholder = "Korte omschrijving voor jezelf";
  const promptMacroModeLabel = el("label", "mv-md-dialog-label", "Modus");
  promptMacroModeLabel.setAttribute("for", "mv-prompt-macro-mode");
  const promptMacroMode = document.createElement("select");
  promptMacroMode.id = "mv-prompt-macro-mode";
  promptMacroMode.className = "mv-md-dialog-input";
  for (const [value, label] of [
    ["agent", "Agent - past het document aan"],
    ["ask", "Ask - beantwoordt alleen in chat"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    promptMacroMode.append(opt);
  }
  const promptMacroRequiresContentLabel = el("label", "mv-md-dialog-label mv-agent-debug-llm-label");
  const promptMacroRequiresContent = document.createElement("input");
  promptMacroRequiresContent.type = "checkbox";
  promptMacroRequiresContent.id = "mv-prompt-macro-requires-content";
  promptMacroRequiresContentLabel.htmlFor = promptMacroRequiresContent.id;
  promptMacroRequiresContentLabel.append(
    promptMacroRequiresContent,
    document.createTextNode(" Macro vraagt aanvullende inhoud bij uitvoeren"),
  );
  const promptMacroContentLabelLabel = el("label", "mv-md-dialog-label", "Label aanvullende inhoud");
  promptMacroContentLabelLabel.setAttribute("for", "mv-prompt-macro-content-label");
  const promptMacroContentLabel = document.createElement("input");
  promptMacroContentLabel.id = "mv-prompt-macro-content-label";
  promptMacroContentLabel.className = "mv-md-dialog-input";
  promptMacroContentLabel.type = "text";
  promptMacroContentLabel.placeholder = "Bijv. Transcript";
  const promptMacroContentPrefixLabel = el("label", "mv-md-dialog-label", "Kopje voor aanvullende inhoud in prompt");
  promptMacroContentPrefixLabel.setAttribute("for", "mv-prompt-macro-content-prefix");
  const promptMacroContentPrefix = document.createElement("input");
  promptMacroContentPrefix.id = "mv-prompt-macro-content-prefix";
  promptMacroContentPrefix.className = "mv-md-dialog-input";
  promptMacroContentPrefix.type = "text";
  promptMacroContentPrefix.placeholder = "Bijv. Transcript:";
  const promptMacroPromptLabel = el("label", "mv-md-dialog-label", "Vaste prompt");
  promptMacroPromptLabel.setAttribute("for", "mv-prompt-macro-prompt");
  const promptMacroPrompt = document.createElement("textarea");
  promptMacroPrompt.id = "mv-prompt-macro-prompt";
  promptMacroPrompt.className = "mv-md-dialog-textarea mv-prompt-macro-prompt";
  promptMacroPrompt.rows = 10;
  promptMacroPrompt.placeholder = "Beschrijf hier de vaste opdracht...";
  const promptMacroRunContentLabel = el("label", "mv-md-dialog-label", "Aanvullende inhoud voor deze uitvoering");
  promptMacroRunContentLabel.setAttribute("for", "mv-prompt-macro-run-content");
  const promptMacroRunContent = document.createElement("textarea");
  promptMacroRunContent.id = "mv-prompt-macro-run-content";
  promptMacroRunContent.className = "mv-md-dialog-textarea mv-prompt-macro-run-content";
  promptMacroRunContent.rows = 6;
  promptMacroRunContent.placeholder = "Optioneel of verplicht, afhankelijk van de macro...";
  const promptMacroActions = el("div", "mv-md-dialog-actions");
  const promptMacroCloseBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Sluiten");
  promptMacroCloseBtn.type = "button";
  const promptMacroSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Macro opslaan");
  promptMacroSaveBtn.type = "button";
  const promptMacroRunBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Uitvoeren");
  promptMacroRunBtn.type = "button";
  promptMacroActions.append(promptMacroCloseBtn, promptMacroSaveBtn, promptMacroRunBtn);
  promptMacroCard.append(
    promptMacroTitle,
    promptMacroHint,
    promptMacroSelectLabel,
    promptMacroSelect,
    promptMacroManageActions,
    promptMacroNameLabel,
    promptMacroName,
    promptMacroDescriptionLabel,
    promptMacroDescription,
    promptMacroModeLabel,
    promptMacroMode,
    promptMacroRequiresContentLabel,
    promptMacroContentLabelLabel,
    promptMacroContentLabel,
    promptMacroContentPrefixLabel,
    promptMacroContentPrefix,
    promptMacroPromptLabel,
    promptMacroPrompt,
    promptMacroRunContentLabel,
    promptMacroRunContent,
    promptMacroActions,
  );
  promptMacroDialog.append(promptMacroCard);
  document.body.append(promptMacroDialog);
  let promptMacroEditingId = "";

  const confluenceImportDialog = el("div", "mv-md-dialog");
  confluenceImportDialog.hidden = true;
  confluenceImportDialog.setAttribute("role", "dialog");
  confluenceImportDialog.setAttribute("aria-modal", "true");
  confluenceImportDialog.setAttribute("aria-label", "Confluence-pagina importeren");
  const confluenceImportCard = el("div", "mv-md-dialog-card");
  const confluenceImportTitle = el("h2", "mv-md-dialog-title", "Confluence-pagina importeren");
  const confluenceImportHint = el(
    "div",
    "mv-md-dialog-hint",
    "Plak een Confluence URL of numerieke pageId. De pagina wordt tijdelijk als Markdown geopend; handmatig opslaan schrijft een nieuwe versie terug naar Confluence.",
  );
  const confluenceImportLabel = el("label", "mv-md-dialog-label", "Confluence URL of pageId");
  confluenceImportLabel.setAttribute("for", "mv-confluence-import-input");
  const confluenceImportInput = document.createElement("input");
  confluenceImportInput.id = "mv-confluence-import-input";
  confluenceImportInput.className = "mv-md-dialog-input";
  confluenceImportInput.type = "text";
  confluenceImportInput.placeholder = "https://confluence.../display/SPACE/Page+Title of 123456";
  const confluenceImportActions = el("div", "mv-md-dialog-actions");
  const confluenceImportCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  confluenceImportCancelBtn.type = "button";
  const confluenceImportRunBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Importeren");
  confluenceImportRunBtn.type = "button";
  confluenceImportActions.append(confluenceImportCancelBtn, confluenceImportRunBtn);
  confluenceImportCard.append(
    confluenceImportTitle,
    confluenceImportHint,
    confluenceImportLabel,
    confluenceImportInput,
    confluenceImportActions,
  );
  confluenceImportDialog.append(confluenceImportCard);
  document.body.append(confluenceImportDialog);

  const confluenceSearchDialog = el("div", "mv-md-dialog");
  confluenceSearchDialog.hidden = true;
  confluenceSearchDialog.setAttribute("role", "dialog");
  confluenceSearchDialog.setAttribute("aria-modal", "true");
  confluenceSearchDialog.setAttribute("aria-label", "Zoek in Confluence");
  const confluenceSearchCard = el("div", "mv-md-dialog-card mv-confluence-search-card");
  const confluenceSearchTitle = el("h2", "mv-md-dialog-title", "Zoek in Confluence");
  const confluenceSearchHint = el(
    "div",
    "mv-md-dialog-hint",
    "Zoek op titel of inhoud. Kies een resultaat om de pagina tijdelijk in de editor te importeren.",
  );
  const confluenceSearchQueryLabel = el("label", "mv-md-dialog-label", "Zoekterm");
  confluenceSearchQueryLabel.setAttribute("for", "mv-confluence-search-query");
  const confluenceSearchQueryInput = document.createElement("input");
  confluenceSearchQueryInput.id = "mv-confluence-search-query";
  confluenceSearchQueryInput.className = "mv-md-dialog-input";
  confluenceSearchQueryInput.type = "search";
  confluenceSearchQueryInput.placeholder = "Bijvoorbeeld: Problem Management";
  const confluenceSearchOptions = el("div", "mv-confluence-search-options");
  const confluenceSearchSpaceInput = document.createElement("input");
  confluenceSearchSpaceInput.className = "mv-md-dialog-input";
  confluenceSearchSpaceInput.type = "text";
  confluenceSearchSpaceInput.placeholder = "Space key optioneel";
  confluenceSearchSpaceInput.setAttribute("aria-label", "Confluence space key");
  const confluenceSearchLimitInput = document.createElement("input");
  confluenceSearchLimitInput.className = "mv-md-dialog-input";
  confluenceSearchLimitInput.type = "number";
  confluenceSearchLimitInput.min = "1";
  confluenceSearchLimitInput.max = "50";
  confluenceSearchLimitInput.value = "10";
  confluenceSearchLimitInput.setAttribute("aria-label", "Aantal resultaten");
  confluenceSearchOptions.append(confluenceSearchSpaceInput, confluenceSearchLimitInput);
  const confluenceSearchResults = el("div", "mv-confluence-search-results");
  const confluenceSearchActions = el("div", "mv-md-dialog-actions");
  const confluenceSearchCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Sluiten");
  confluenceSearchCancelBtn.type = "button";
  const confluenceSearchRunBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Zoeken");
  confluenceSearchRunBtn.type = "button";
  confluenceSearchActions.append(confluenceSearchCancelBtn, confluenceSearchRunBtn);
  confluenceSearchCard.append(
    confluenceSearchTitle,
    confluenceSearchHint,
    confluenceSearchQueryLabel,
    confluenceSearchQueryInput,
    confluenceSearchOptions,
    confluenceSearchResults,
    confluenceSearchActions,
  );
  confluenceSearchDialog.append(confluenceSearchCard);
  document.body.append(confluenceSearchDialog);

  const settingsDialog = el("div", "mv-md-dialog mv-settings-dialog");
  settingsDialog.hidden = true;
  settingsDialog.setAttribute("role", "dialog");
  settingsDialog.setAttribute("aria-modal", "true");
  settingsDialog.setAttribute("aria-label", "Instellingen");
  const settingsCard = el("div", "mv-md-dialog-card mv-settings-card");
  const settingsTitle = el("h2", "mv-md-dialog-title", "Instellingen");
  const settingsSectionTpl = el("div", "mv-settings-section");
  settingsSectionTpl.append(el("h3", "mv-settings-section-title", "Template (JSON)"), tplField);
  const settingsSectionAgent = el("div", "mv-settings-section");
  const agentEndpoint = document.createElement("input");
  agentEndpoint.className = "mv-md-dialog-input";
  /** `type="url"` laat in sommige browsers de waarde leeg ogen wegens validity; endpoint is vrije tekst. */
  agentEndpoint.type = "text";
  agentEndpoint.setAttribute("inputmode", "url");
  agentEndpoint.placeholder = "https://api.openai.com/v1";
  const agentModel = document.createElement("select");
  agentModel.className = "mv-md-dialog-input";
  const agentModelRefreshBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table", "Modellen laden");
  agentModelRefreshBtn.type = "button";
  const agentModelRow = el("div", "mv-agent-config-model-row");
  agentModelRow.append(agentModel, agentModelRefreshBtn);
  const agentApiKey = document.createElement("input");
  agentApiKey.className = "mv-md-dialog-input";
  agentApiKey.type = "password";
  agentApiKey.placeholder = "API key (leeg laten om bestaande key te behouden)";
  const agentDebugLlmCb = document.createElement("input");
  agentDebugLlmCb.type = "checkbox";
  agentDebugLlmCb.id = "mv-agent-debug-llm-cb";
  const agentDebugLlmLabel = el("label", "mv-md-dialog-label mv-agent-debug-llm-label");
  agentDebugLlmLabel.htmlFor = "mv-agent-debug-llm-cb";
  agentDebugLlmLabel.append(
    agentDebugLlmCb,
    document.createTextNode(
      " Ruwe LLM-output tonen na chat (debug): volledige assistant-message, tool_calls, parse-fout.",
    ),
  );
  agentDebugLlmCb.addEventListener("change", () => writeAgentDebugLlm(agentDebugLlmCb.checked));
  agentModelRefreshBtn.addEventListener("click", () => void loadAgentModelOptions(agentModel.value));
  const agentConfigHint = el(
    "div",
    "mv-md-dialog-hint",
    "De API key wordt alleen server-side opgeslagen en niet teruggestuurd naar de browser.",
  );
  settingsSectionAgent.append(
    el("h3", "mv-settings-section-title", "LLM-agent"),
    el("label", "mv-md-dialog-label", "Endpoint"),
    agentEndpoint,
    el("label", "mv-md-dialog-label", "Model"),
    agentModelRow,
    el("label", "mv-md-dialog-label", "API key"),
    agentApiKey,
    agentDebugLlmLabel,
    agentConfigHint,
  );
  const settingsSectionInstructions = el("div", "mv-settings-section");
  const agentInstructionsHint = el(
    "div",
    "mv-md-dialog-hint",
    "Apart Markdown-bestand buiten Files/: zichtbaar voor jou, niet opgenomen in de second-brain corpus-index. De agent werkt dit autonoom bij met duurzame voorkeuren en verwachtingen.",
  );
  const agentInstructionsPath = el("div", "mv-md-dialog-hint", "");
  const agentInstructionsText = document.createElement("textarea");
  agentInstructionsText.className = "mv-md-dialog-textarea";
  agentInstructionsText.rows = 12;
  agentInstructionsText.spellcheck = false;
  agentInstructionsText.setAttribute("aria-label", "Agent-instructies Markdown");
  const agentInstructionsToolbar = el("div", "mv-settings-log-toolbar");
  const agentInstructionsRefreshBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Verversen");
  agentInstructionsRefreshBtn.type = "button";
  const agentInstructionsSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Instructies opslaan");
  agentInstructionsSaveBtn.type = "button";
  agentInstructionsToolbar.append(agentInstructionsRefreshBtn, agentInstructionsSaveBtn);
  settingsSectionInstructions.append(
    el("h3", "mv-settings-section-title", "Agent-instructies"),
    agentInstructionsHint,
    agentInstructionsPath,
    agentInstructionsText,
    agentInstructionsToolbar,
  );
  const settingsSectionLogs = el("div", "mv-settings-section");
  const settingsLogsHint = el(
    "div",
    "mv-md-dialog-hint",
    "Server-consolelog van agent-runs (in geheugen, ringbuffer). Na serverherstart leeg.",
  );
  const settingsLogsToolbar = el("div", "mv-settings-log-toolbar");
  const settingsLogsRefreshBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Verversen");
  settingsLogsRefreshBtn.type = "button";
  const settingsActivityLogsBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Activity logs");
  settingsActivityLogsBtn.type = "button";
  const settingsLogsClearBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Wissen");
  settingsLogsClearBtn.type = "button";
  settingsLogsToolbar.append(settingsLogsRefreshBtn, settingsActivityLogsBtn, settingsLogsClearBtn);
  const settingsLogsPre = el("pre", "mv-settings-log-pre");
  settingsLogsPre.setAttribute("tabindex", "0");
  settingsLogsPre.setAttribute("aria-label", "Agentlog");
  settingsSectionLogs.append(
    el("h3", "mv-settings-section-title", "Agentlog"),
    settingsLogsHint,
    settingsLogsToolbar,
    settingsLogsPre,
  );
  const settingsActions = el("div", "mv-md-dialog-actions");
  const settingsCloseBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Sluiten");
  settingsCloseBtn.type = "button";
  const settingsAgentSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Agentconfig opslaan");
  settingsAgentSaveBtn.type = "button";
  settingsActions.append(settingsCloseBtn, settingsAgentSaveBtn);
  const settingsScroll = el("div", "mv-settings-scroll");
  settingsScroll.append(
    settingsSectionTpl,
    settingsSectionAgent,
    settingsSectionInstructions,
    settingsSectionLogs,
  );
  settingsCard.append(settingsTitle, settingsScroll, settingsActions);
  settingsDialog.append(settingsCard);
  document.body.append(settingsDialog);

  const docxExportDialog = el("div", "mv-md-dialog mv-docx-export-dialog");
  docxExportDialog.hidden = true;
  docxExportDialog.setAttribute("role", "dialog");
  docxExportDialog.setAttribute("aria-modal", "true");
  docxExportDialog.setAttribute("aria-label", "Exporteren naar Word");
  const docxExportCard = el("div", "mv-md-dialog-card");
  const docxExportTitle = el("h2", "mv-md-dialog-title", "Word-export (.docx)");
  const docxExportHint = el(
    "div",
    "mv-md-dialog-hint",
    "Lokaal: Python + LLM2DOCX; met Docker compose: templates uit de docx-export container (zie docker-compose.yml).",
  );
  const docxTplSelect = document.createElement("select");
  docxTplSelect.className = "mv-md-dialog-input";
  docxTplSelect.setAttribute("aria-label", "Word-template");
  const docxFilenameLabel = el("label", "mv-md-dialog-label", "Bestandsnaam");
  const docxFilenameInput = document.createElement("input");
  docxFilenameInput.type = "text";
  docxFilenameInput.className = "mv-md-dialog-input";
  docxFilenameInput.setAttribute("spellcheck", "false");
  docxFilenameInput.setAttribute("aria-label", "Bestandsnaam voor het .docx-bestand");
  docxFilenameInput.placeholder = "bijv. Offerte_Acme.docx";
  const docxPlaceholdersLabel = el("label", "mv-md-dialog-label", "Velden uit template (Jinja {{ … }})");
  const docxPlaceholdersHost = el("div", "mv-docx-placeholders");
  const docxMetaLabel = el("label", "mv-md-dialog-label", "Extra metadata (JSON, optioneel)");
  const docxMetadataTa = document.createElement("textarea");
  docxMetadataTa.className = "mv-md-dialog-textarea mv-docx-extra-meta";
  docxMetadataTa.rows = 3;
  docxMetadataTa.placeholder = '{ "extra_sleutel": "…" } — vult aan naast de velden hierboven; overlappende sleutels worden overschreven door de velden.';
  docxMetadataTa.setAttribute("spellcheck", "false");
  const docxExportActions = el("div", "mv-md-dialog-actions");
  const docxExportCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  docxExportCancelBtn.type = "button";
  const docxExportRunBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Downloaden");
  docxExportRunBtn.type = "button";
  docxExportActions.append(docxExportCancelBtn, docxExportRunBtn);
  docxExportCard.append(
    docxExportTitle,
    docxExportHint,
    el("label", "mv-md-dialog-label", "Template"),
    docxTplSelect,
    docxFilenameLabel,
    docxFilenameInput,
    docxPlaceholdersLabel,
    docxPlaceholdersHost,
    docxMetaLabel,
    docxMetadataTa,
    docxExportActions,
  );
  docxExportDialog.append(docxExportCard);
  document.body.append(docxExportDialog);

  const coverSection = el("section", "mv-cover");
  coverSection.hidden = true;
  const tocHost = el("div", "mv-toc-host");
  const proseHost = el("div", "mv-prose-host");
  attachLocalMarkdownLinkHandler(proseHost);

  const endSection = el("section", "mv-end");
  endSection.hidden = true;

  function layoutPages() {
    stack.replaceChildren();
    stack.append(coverSection, tocHost, proseHost, endSection);
  }

  layoutPages();

  function formatReviewTs(iso: string): string {
    try {
      return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  function hideReviewPopover() {
    reviewPopover.hidden = true;
    reviewPopover.replaceChildren();
  }

  function markdownFileNames(): string[] {
    return Array.from(fileSelect.options)
      .map((o) => o.value)
      .filter((v) => v && v !== EXTERNAL_MARKDOWN_VALUE);
  }

  function normalizeMarkdownFileName(raw: string): string | null {
    const name = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name) return null;
    const withExt = name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
    if (withExt.includes("..")) return null;
    const parts = withExt.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
    if (!parts.at(-1)?.endsWith(".md")) return null;
    return parts.join("/");
  }

  /** Relatief mappad onder Files/; zelfde regels als server `safeFolderPath` (geen .., verborgen segmenten of illegale tekens). */
  function normalizeMarkdownFolderPath(rawJoined: string): string | null {
    const normalized = rawJoined.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!normalized || normalized.includes("\0") || normalized.includes("..")) return null;
    const parts = normalized.split("/").filter(Boolean);
    if (parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
    return parts.join("/");
  }

  function immediateParentFolderOfRelPath(relPath: string): string {
    const norm = relPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const i = norm.lastIndexOf("/");
    return i >= 0 ? norm.slice(0, i) : "";
  }

  /** Consistent vergelijken van map-prefix (boom / prompts). */
  function normalizeFolderPrefix(p: string): string {
    return p.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function clearExternalMarkdownSession() {
    try {
      const label = externalFileLabel.trim();
      if (label) sessionStorage.removeItem(`mv-ext-agent:${label}`);
    } catch {
      /* private mode */
    }
    externalDocumentKind = "none";
    externalFileHandle = null;
    externalFileLabel = "";
    externalConfluencePage = null;
  }

  function getOrCreateExternalAgentVirtualName(): string {
    const label = externalFileLabel.trim();
    if (!label) {
      return `${EXTERNAL_AGENT_VIRTUAL_PREFIX}${crypto.randomUUID()}.md`;
    }
    const storageKey = `mv-ext-agent:${label}`;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (
        typeof raw === "string" &&
        raw.startsWith(EXTERNAL_AGENT_VIRTUAL_PREFIX) &&
        raw.endsWith(".md")
      ) {
        return raw;
      }
    } catch {
      /* private mode */
    }
    const v = `${EXTERNAL_AGENT_VIRTUAL_PREFIX}${crypto.randomUUID()}.md`;
    try {
      sessionStorage.setItem(storageKey, v);
    } catch {
      /* */
    }
    return v;
  }

  async function readExternalMarkdownDisk(): Promise<string> {
    if (!externalFileHandle) throw new Error("Geen extern bestand");
    const file = await externalFileHandle.getFile();
    return await file.text();
  }

  function externalDocumentSourceLabel(): string {
    if (externalDocumentKind === "confluence") return "Confluence";
    if (externalDocumentKind === "disk") return "schijf";
    return "extern";
  }

  async function writeExternalMarkdownDisk(content: string): Promise<void> {
    if (!externalFileHandle) throw new Error("Geen extern bestand");
    const fh = externalFileHandle as FileSystemFileHandle & {
      queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
      requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
    };
    const opts = { mode: "readwrite" as const };
    let canWrite = true;
    try {
      if (typeof fh.queryPermission === "function") {
        if ((await fh.queryPermission(opts)) !== "granted") {
          canWrite =
            typeof fh.requestPermission === "function"
              ? (await fh.requestPermission(opts)) === "granted"
              : false;
        }
      }
    } catch {
      canWrite = true;
    }
    if (!canWrite) throw new Error("Geen schrijfrecht op dit bestand");
    const w = await externalFileHandle.createWritable();
    await w.write(content);
    await w.close();
  }

  async function writeExternalMarkdown(content: string): Promise<void> {
    if (externalDocumentKind === "confluence") {
      if (!externalConfluencePage) throw new Error("Geen Confluence-pagina gekoppeld");
      const saved = await saveConfluencePage({
        pageId: externalConfluencePage.id,
        title: externalConfluencePage.title,
        baseVersion: externalConfluencePage.version,
        markdown: content,
      });
      externalConfluencePage = {
        ...externalConfluencePage,
        title: saved.title || externalConfluencePage.title,
        version: saved.version,
        url: saved.url || externalConfluencePage.url,
      };
      externalFileLabel = externalConfluencePage.title;
      const opt = Array.from(fileSelect.options).find((o) => o.value === EXTERNAL_MARKDOWN_VALUE);
      if (opt) opt.textContent = `☁ ${externalFileLabel} (Confluence v${externalConfluencePage.version})`;
      syncToolbarDocTitle();
      return;
    }
    await writeExternalMarkdownDisk(content);
  }

  async function confirmLeaveEditModeForImport(): Promise<boolean> {
    await saveCurrentEditorToBoundDoc();
    if (
      isDirty &&
      !confirm(
        "Niet alle wijzigingen zijn naar schijf geschreven (bijv. net voor het importeren). Toch doorgaan?",
      )
    ) {
      return false;
    }
    return true;
  }

  async function createOrReplaceMarkdownFile(name: string, content: string): Promise<boolean> {
    const requested = name.includes("/") || name.includes("\\") ? name : joinMarkdownPath(selectedFolder, name);
    const normalized = normalizeMarkdownFileName(requested);
    if (!normalized) {
      status.textContent = "Ongeldige bestandsnaam. Gebruik bijvoorbeeld nieuw-document.md.";
      return false;
    }
    if (!(await confirmLeaveEditModeForImport())) return false;
    if (markdownFileNames().includes(normalized) && !confirm(`${normalized} bestaat al. Overschrijven?`)) {
      return false;
    }
    clearExternalMarkdownSession();
    await saveMarkdownFile(normalized, markdownHtmlTablesToMarkdown(content));
    selectedFolder = folderOfMarkdownPath(normalized);
    status.textContent = `${normalized} aangemaakt.`;
    await loadLists(normalized);
    return true;
  }

  function showMarkdownStringDialog() {
    mdStringName.value = "";
    mdStringText.value = "";
    mdStringTemplateInput.value = "";
    mdStringDialog.hidden = false;
    mdStringName.focus();
  }

  function hideMarkdownStringDialog() {
    mdStringDialog.hidden = true;
  }

  function showMeetingReportDialog() {
    if (!getAgentChatDocumentName()) {
      status.textContent = "Selecteer of open eerst een document voor het gespreksverslag.";
      return;
    }
    meetingReportTranscript.value = "";
    meetingReportDialog.hidden = false;
    meetingReportTranscript.focus();
  }

  function hideMeetingReportDialog() {
    meetingReportDialog.hidden = true;
  }

  function buildMeetingReportPrompt(transcript: string): string {
    return `Maak op basis van onderstaand transcript een gespreksverslag en plaats dit in het huidige Markdown-document.

Vereisten:
- Begin met een korte samenvatting.
- Maak een kopje per besproken onderwerp.
- Leg duidelijke afspraken en acties vast, inclusief eigenaar/personen en data.
- Formuleer acties zo SMART mogelijk: Specifiek, Meetbaar, Aanwijsbaar, Realistisch en Tijdsgebonden.
- Gebruik Markdown die past bij de stijl van het huidige document.
- Herhaal het transcript niet letterlijk; verwerk alleen de relevante inhoud in het verslag.
- Voeg het verslag logisch in het document in. Vervang bestaande inhoud alleen als dat duidelijk de bedoeling is.

Transcript:
${transcript}`;
  }

  async function submitMeetingReportTranscript() {
    const transcript = meetingReportTranscript.value.trim();
    if (!transcript) {
      status.textContent = "Plak eerst een transcript voor het gespreksverslag.";
      meetingReportTranscript.focus();
      return;
    }
    hideMeetingReportDialog();
    agentChatMode = "agent";
    refreshAgentChatModeUi();
    agentChatInput.value = buildMeetingReportPrompt(transcript);
    await submitAgentChat();
  }

  function renderPromptMacroOptions(selectedId = promptMacroEditingId): void {
    promptMacroSelect.replaceChildren();
    for (const macro of promptMacros) {
      const opt = document.createElement("option");
      opt.value = macro.id;
      opt.textContent = macro.name;
      promptMacroSelect.append(opt);
    }
    if (selectedId && promptMacros.some((m) => m.id === selectedId)) {
      promptMacroSelect.value = selectedId;
    } else if (promptMacros[0]) {
      promptMacroSelect.value = promptMacros[0].id;
    }
  }

  function selectedPromptMacro(): PromptMacro | null {
    return promptMacros.find((m) => m.id === promptMacroSelect.value) || null;
  }

  function fillPromptMacroForm(macro: PromptMacro | null): void {
    promptMacroEditingId = macro?.id || "";
    promptMacroName.value = macro?.name || "";
    promptMacroDescription.value = macro?.description || "";
    promptMacroMode.value = macro?.mode || "agent";
    promptMacroRequiresContent.checked = macro?.requiresContent === true;
    promptMacroContentLabel.value = macro?.contentLabel || "Aanvullende inhoud";
    promptMacroContentPrefix.value = macro?.contentPrefix || "Aanvullende inhoud:";
    promptMacroPrompt.value = macro?.prompt || "";
    promptMacroRunContent.value = "";
    promptMacroRunContentLabel.textContent = macro?.contentLabel
      ? `${macro.contentLabel} voor deze uitvoering`
      : "Aanvullende inhoud voor deze uitvoering";
    promptMacroRunContent.placeholder = macro?.contentPlaceholder || "Optioneel of verplicht, afhankelijk van de macro...";
    promptMacroDeleteBtn.disabled = !macro;
  }

  async function reloadPromptMacros(selectedId = promptMacroEditingId): Promise<void> {
    const payload = await fetchPromptMacros();
    promptMacros = payload.macros;
    renderPromptMacroOptions(selectedId);
    fillPromptMacroForm(selectedPromptMacro());
  }

  async function showPromptMacroDialog(): Promise<void> {
    promptMacroDialog.hidden = false;
    try {
      await reloadPromptMacros();
      promptMacroSelect.focus();
      status.textContent = promptMacros.length
        ? `${promptMacros.length} promptmacro('s) geladen.`
        : "Nog geen promptmacro's gevonden.";
    } catch (e) {
      status.textContent = `Promptmacro's laden mislukt: ${String((e as Error).message)}`;
    }
  }

  function hidePromptMacroDialog(): void {
    promptMacroDialog.hidden = true;
  }

  function promptMacroFormPayload(): Partial<PromptMacro> {
    return {
      name: promptMacroName.value.trim(),
      description: promptMacroDescription.value.trim(),
      mode: promptMacroMode.value === "ask" ? "ask" : "agent",
      prompt: promptMacroPrompt.value.trim(),
      requiresContent: promptMacroRequiresContent.checked,
      contentLabel: promptMacroContentLabel.value.trim() || "Aanvullende inhoud",
      contentPlaceholder: promptMacroRunContent.placeholder.trim(),
      contentPrefix: promptMacroContentPrefix.value.trim() || "Aanvullende inhoud:",
    };
  }

  async function savePromptMacroFromForm(): Promise<void> {
    const payload = promptMacroFormPayload();
    if (!payload.name || !payload.prompt) {
      status.textContent = "Macro opslaan mislukt: naam en vaste prompt zijn verplicht.";
      return;
    }
    promptMacroSaveBtn.disabled = true;
    try {
      const result = promptMacroEditingId
        ? await updatePromptMacro(promptMacroEditingId, payload)
        : await createPromptMacro(payload);
      promptMacros = result.macros;
      const nextId = promptMacroEditingId || promptMacros.at(-1)?.id || "";
      renderPromptMacroOptions(nextId);
      fillPromptMacroForm(selectedPromptMacro());
      status.textContent = "Promptmacro opgeslagen.";
    } catch (e) {
      status.textContent = `Promptmacro opslaan mislukt: ${String((e as Error).message)}`;
    } finally {
      promptMacroSaveBtn.disabled = false;
    }
  }

  async function deleteSelectedPromptMacro(): Promise<void> {
    const macro = selectedPromptMacro();
    if (!macro) return;
    if (!confirm(`Promptmacro "${macro.name}" verwijderen?`)) return;
    promptMacroDeleteBtn.disabled = true;
    try {
      const result = await deletePromptMacro(macro.id);
      promptMacros = result.macros;
      renderPromptMacroOptions();
      fillPromptMacroForm(selectedPromptMacro());
      status.textContent = "Promptmacro verwijderd.";
    } catch (e) {
      status.textContent = `Promptmacro verwijderen mislukt: ${String((e as Error).message)}`;
    } finally {
      promptMacroDeleteBtn.disabled = false;
    }
  }

  function buildPromptMacroMessage(macro: PromptMacro, content: string): string {
    const base = macro.prompt.trim();
    const extra = content.trim();
    if (!extra) return base;
    const prefix = macro.contentPrefix.trim() || macro.contentLabel.trim() || "Aanvullende inhoud:";
    return `${base}\n\n${prefix}\n${extra}`;
  }

  async function runSelectedPromptMacro(): Promise<void> {
    const macro = selectedPromptMacro();
    if (!macro) {
      status.textContent = "Kies eerst een promptmacro.";
      return;
    }
    const content = promptMacroRunContent.value.trim();
    if (macro.requiresContent && !content) {
      status.textContent = `Vul eerst ${macro.contentLabel || "aanvullende inhoud"} in.`;
      promptMacroRunContent.focus();
      return;
    }
    hidePromptMacroDialog();
    agentChatMode = macro.mode;
    refreshAgentChatModeUi();
    agentChatInput.value = buildPromptMacroMessage(macro, content);
    await submitAgentChat();
  }

  async function refreshSettingsAgentLogs() {
    settingsLogsPre.textContent = "Laden…";
    try {
      const { entries, total, max } = await fetchAgentLogs(300);
      settingsLogsHint.textContent = `${entries.length} regels getoond, ${total} in buffer (max. ${max}). Ringbuffer op de server; na herstart leeg.`;
      settingsLogsPre.textContent = entries.map((e) => JSON.stringify(e)).join("\n");
      settingsLogsPre.scrollTop = settingsLogsPre.scrollHeight;
    } catch (e) {
      settingsLogsPre.textContent = "";
      settingsLogsHint.textContent = `Agentlog ophalen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function refreshSettingsActivityLogs() {
    settingsLogsPre.textContent = "Laden…";
    try {
      const { entries, path } = await fetchAgentActivityLogs(300);
      settingsLogsHint.textContent = `${entries.length} activity logs getoond. Persistent JSONL-bestand: ${path}`;
      settingsLogsPre.textContent = entries
        .map((e) =>
          JSON.stringify({
            date: `${e.localDate} ${e.localTime}`,
            mode: e.mode,
            status: e.status,
            chat: e.chatTitle || e.chatId,
            document: e.documentPath,
            request: e.request,
            changed: e.changed,
            wroteFile: e.wroteFile,
            memoryActions: e.memoryActionCount,
            durationMs: e.durationMs,
            error: e.error || undefined,
          }),
        )
        .join("\n");
      settingsLogsPre.scrollTop = 0;
    } catch (e) {
      settingsLogsPre.textContent = "";
      settingsLogsHint.textContent = `Activity logs ophalen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function refreshSettingsAgentInstructions() {
    try {
      const payload = await fetchAgentInstructions();
      agentInstructionsText.value = payload.content;
      agentInstructionsPath.textContent = payload.path ? `Bestand: ${payload.path}` : "";
    } catch (e) {
      status.textContent = `Agent-instructies lezen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function saveSettingsAgentInstructions() {
    agentInstructionsSaveBtn.disabled = true;
    try {
      const payload = await saveAgentInstructions(agentInstructionsText.value);
      agentInstructionsText.value = payload.content;
      agentInstructionsPath.textContent = payload.path ? `Bestand: ${payload.path}` : "";
      status.textContent = "Agent-instructies opgeslagen.";
    } catch (e) {
      status.textContent = `Agent-instructies opslaan mislukt: ${String((e as Error).message)}`;
    } finally {
      agentInstructionsSaveBtn.disabled = false;
    }
  }

  function populateAgentModelOptions(models: string[], selectedModel: string): void {
    const selected = selectedModel.trim();
    const unique = Array.from(new Set(models.map((m) => m.trim()).filter(Boolean)));
    if (selected && !unique.includes(selected)) unique.unshift(selected);
    agentModel.replaceChildren();
    if (!unique.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Geen modellen geladen";
      agentModel.append(opt);
      agentModel.value = "";
      return;
    }
    for (const model of unique) {
      const opt = document.createElement("option");
      opt.value = model;
      opt.textContent = model;
      agentModel.append(opt);
    }
    agentModel.value = selected && unique.includes(selected) ? selected : unique[0] || "";
  }

  async function loadAgentModelOptions(selectedModel = agentModel.value): Promise<void> {
    const previousText = agentModelRefreshBtn.textContent || "Modellen laden";
    agentModelRefreshBtn.disabled = true;
    agentModelRefreshBtn.textContent = "Laden…";
    try {
      const payload = await fetchAgentModels({
        endpoint: agentEndpoint.value,
        apiKey: agentApiKey.value,
      });
      populateAgentModelOptions(payload.models, selectedModel);
      status.textContent = `Modellen geladen: ${payload.models.length}.`;
    } catch (e) {
      populateAgentModelOptions(selectedModel ? [selectedModel] : [], selectedModel);
      status.textContent = `Modellen laden mislukt: ${String((e as Error).message)}`;
    } finally {
      agentModelRefreshBtn.disabled = false;
      agentModelRefreshBtn.textContent = previousText;
    }
  }

  async function showSettingsDialog() {
    try {
      const cfg = await fetchAgentConfig();
      agentEndpoint.value = cfg.endpoint;
      populateAgentModelOptions(cfg.model ? [cfg.model] : [], cfg.model);
      agentApiKey.value = "";
      agentApiKey.placeholder = cfg.hasApiKey
        ? "API key aanwezig (leeg laten om te behouden)"
        : "API key";
      void loadAgentModelOptions(cfg.model);
    } catch (e) {
      status.textContent = `Agentconfig lezen mislukt: ${String((e as Error).message)}`;
    }
    void refreshSettingsAgentLogs();
    void refreshSettingsAgentInstructions();
    agentDebugLlmCb.checked = readAgentDebugLlm();
    settingsDialog.hidden = false;
    agentEndpoint.focus();
  }

  function hideSettingsDialog() {
    settingsDialog.hidden = true;
  }

  function hideDocxExportDialog() {
    docxExportDialog.hidden = true;
  }

  function suggestedDocxDownloadName(mdRelativePath: string): string {
    const base =
      mdRelativePath === EXTERNAL_MARKDOWN_VALUE
        ? externalFileLabel || "document.md"
        : mdRelativePath.replace(/\\/g, "/").split("/").pop() || "document.md";
    let stem = base.replace(/\.md$/i, "");
    stem = stem
      .replace(/[^a-zA-Z0-9. _-]+/g, "_")
      .replace(/_+/g, "_")
      .trim();
    if (!stem) stem = "document";
    if (stem.length > 100) stem = stem.slice(0, 100);
    return `${stem}.docx`;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function refreshDocxPlaceholdersUi() {
    docxPlaceholdersHost.replaceChildren();
    const tpl = docxTplSelect.value.trim();
    if (!tpl) {
      docxPlaceholdersHost.append(el("div", "mv-docx-placeholders-hint", "Kies eerst een template."));
      return;
    }
    docxPlaceholdersHost.append(el("div", "mv-docx-placeholders-hint", "Jinja-velden laden…"));
    try {
      const { placeholders, hint } = await fetchDocxTemplatePlaceholders(tpl);
      docxPlaceholdersHost.replaceChildren();
      if (hint) {
        docxPlaceholdersHost.append(el("div", "mv-docx-placeholders-hint", hint));
      }
      if (placeholders.length === 0) {
        docxPlaceholdersHost.append(
          el(
            "div",
            "mv-docx-placeholders-empty",
            "Geen {{ … }}-expressies gevonden in word/*.xml van dit template. Gebruik eventueel extra JSON hieronder.",
          ),
        );
        return;
      }
      placeholders.forEach((fieldName, idx) => {
        const row = el("div", "mv-docx-ph-row");
        const id = `mv-docx-ph-${idx}`;
        const lab = el("label", "mv-docx-ph-label");
        lab.textContent = fieldName;
        lab.setAttribute("for", id);
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "mv-md-dialog-input mv-docx-ph-input";
        inp.id = id;
        inp.dataset.placeholderKey = fieldName;
        inp.setAttribute("aria-label", `Waarde voor ${fieldName}`);
        row.append(lab, inp);
        docxPlaceholdersHost.append(row);
      });
    } catch (e) {
      docxPlaceholdersHost.replaceChildren();
      docxPlaceholdersHost.append(
        el("div", "mv-docx-placeholders-err", `Velden laden mislukt: ${String((e as Error).message)}`),
      );
    }
  }

  docxTplSelect.addEventListener("change", () => void refreshDocxPlaceholdersUi());

  async function showDocxExportDialog() {
    if (!fileSelect.value.trim()) {
      status.textContent = "Open eerst een markdownbestand.";
      return;
    }
    docxExportHint.textContent = "Templates laden…";
    docxTplSelect.replaceChildren();
    try {
      const { templates, directory, hint, mode } = await fetchDocxTemplates();
      const extra = hint ? ` ${hint}` : "";
      const modeNote = mode === "docker" ? " (DOCX via Docker-service)" : "";
      docxExportHint.textContent = templates.length
        ? `${templates.length} Word-template(s) in ${directory}.${modeNote}${extra} Export gebruikt de huidige Markdown van de editor.`
        : `Geen .docx in ${directory}.${modeNote}${extra}`;
      for (const t of templates) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        docxTplSelect.append(o);
      }
    } catch (e) {
      docxExportHint.textContent = `Templates laden mislukt: ${String((e as Error).message)}`;
    }
    docxFilenameInput.value = suggestedDocxDownloadName(fileSelect.value.trim());
    docxMetadataTa.value = "{}";
    docxExportDialog.hidden = false;
    docxTplSelect.focus();
    void refreshDocxPlaceholdersUi();
  }

  async function saveAgentConfigFromSettings() {
    try {
      const saved = await saveAgentConfig({
        endpoint: agentEndpoint.value,
        model: agentModel.value,
        apiKey: agentApiKey.value,
      });
      agentApiKey.value = "";
      agentApiKey.placeholder = saved.hasApiKey
        ? "API key aanwezig (leeg laten om te behouden)"
        : "API key";
      status.textContent = `Agentconfig opgeslagen (${saved.model}).`;
      hideSettingsDialog();
    } catch (e) {
      status.textContent = `Agentconfig opslaan mislukt: ${String((e as Error).message)}`;
    }
  }

  function folderOfMarkdownPath(filePath: string): string {
    const norm = filePath.replace(/\\/g, "/");
    const i = norm.lastIndexOf("/");
    return i >= 0 ? norm.slice(0, i) : "";
  }

  function joinMarkdownPath(folder: string, fileName: string): string {
    return folder ? `${folder}/${fileName}` : fileName;
  }

  function baseNameMd(relPath: string): string {
    const i = relPath.lastIndexOf("/");
    return i >= 0 ? relPath.slice(i + 1) : relPath;
  }

  function syncToolbarDocTitle() {
    const v = fileSelect.value.trim();
    if (!v) {
      toolbarDocName.textContent = "—";
      mobileDocName.textContent = "—";
      toolbarDocName.removeAttribute("title");
      mobileDocName.removeAttribute("title");
      return;
    }
    if (v === EXTERNAL_MARKDOWN_VALUE) {
      toolbarDocName.textContent = externalFileLabel || "Extern";
      mobileDocName.textContent = externalFileLabel || "Extern";
      toolbarDocName.title =
        externalDocumentKind === "confluence" && externalConfluencePage?.url
          ? `Confluence: ${externalConfluencePage.url}`
          : externalFileLabel
            ? `Extern: ${externalFileLabel}`
            : "Extern bestand op schijf";
      mobileDocName.title = toolbarDocName.title;
      return;
    }
    toolbarDocName.textContent = baseNameMd(v);
    mobileDocName.textContent = baseNameMd(v);
    toolbarDocName.title = v;
    mobileDocName.title = v;
  }

  function computeRenameTarget(from: string, rawInput: string): string | null {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;
    const folder = folderOfMarkdownPath(from);
    const hasPathSep = trimmed.includes("/") || trimmed.includes("\\");
    const combined = hasPathSep ? trimmed.replace(/\\/g, "/") : joinMarkdownPath(folder, trimmed);
    return normalizeMarkdownFileName(combined);
  }

  /** Alleen bestandsnaam (geen pad); voor externe schijfbestanden via File System Access API. */
  function normalizeExternalMarkdownBaseName(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    if (t.includes("/") || t.includes("\\") || t.includes("..")) return null;
    const withExt = t.toLowerCase().endsWith(".md") ? t : `${t}.md`;
    if (withExt.startsWith(".")) return null;
    if (/[<>:"|?*\x00-\x1f]/.test(withExt)) return null;
    return withExt;
  }

  function migrateExternalAgentSessionKey(oldName: string, newName: string): void {
    if (oldName === newName) return;
    try {
      const keyOld = `mv-ext-agent:${oldName}`;
      const keyNew = `mv-ext-agent:${newName}`;
      const val = sessionStorage.getItem(keyOld);
      if (val) {
        sessionStorage.setItem(keyNew, val);
        sessionStorage.removeItem(keyOld);
      }
    } catch {
      /* */
    }
  }

  function showRenameMarkdownDialog(sourcePath?: string) {
    const v = (sourcePath || fileSelect.value).trim();
    if (!v) {
      status.textContent = "Geen document geselecteerd.";
      return;
    }
    if (v === EXTERNAL_MARKDOWN_VALUE) {
      if (externalDocumentKind === "confluence") {
        status.textContent = "Confluence-pagina's hernoemen kan hier niet; alleen de inhoud wordt teruggeschreven.";
        return;
      }
      if (!externalFileHandle) {
        status.textContent = "Geen extern bestand gekoppeld — open opnieuw via Openen….";
        return;
      }
      renameIsExternal = true;
      renameSourcePath = v;
      renameHintPath.textContent =
        "Dit bestand staat buiten de werkmap Files/ op de server. Hernoemen gebeurt op jouw schijf (zelfde map). Ondersteunt de browser `move()` niet, dan volgt ‘Opslaan als’ — het bestand met de oude naam blijft dan staan tot je het zelf verwijdert.";
      renameInput.value = externalFileLabel;
      renameDialog.hidden = false;
      renameInput.focus();
      renameInput.select();
      return;
    }
    renameIsExternal = false;
    renameSourcePath = v;
    const folder = folderOfMarkdownPath(v);
    renameHintPath.textContent = folder
      ? `Locatie: ${v}. Typ een nieuwe bestandsnaam (zelfde map) of een relatief pad onder Files/, bijv. ${folder}/nieuw.md.`
      : `Locatie: ${v}. Typ een nieuwe bestandsnaam of een pad zoals submap/bestand.md.`;
    renameInput.value = baseNameMd(v);
    renameDialog.hidden = false;
    renameInput.focus();
    renameInput.select();
  }

  function hideRenameMarkdownDialog() {
    renameDialog.hidden = true;
    renameSourcePath = null;
    renameIsExternal = false;
  }

  function showReviewPopover(span: HTMLElement) {
    const id = span.dataset.reviewId;
    const c = reviewComments.find((x) => x.id === id);
    if (!c) return;
    reviewPopover.replaceChildren();
    const nMsg = threadMessageCount(c);
    const titleText =
      nMsg >= 2 ? `Discussie (${nMsg} berichten)` : "Commentaar";
    reviewPopover.append(el("div", "mv-review-popover-title", titleText));
    const thread = el("div", "mv-review-popover-thread");
    const rootRow = el("div", "mv-review-popover-msg");
    const rootMeta = el("div", "mv-review-popover-meta");
    rootMeta.textContent = [c.author || "Auteur onbekend", formatReviewTs(c.createdAt)]
      .filter(Boolean)
      .join(" · ");
    const rootBody = el("div", "mv-review-popover-body-text");
    rootBody.textContent = c.body.trim() || "(Leeg)";
    rootRow.append(rootMeta, rootBody);
    thread.append(rootRow);
    for (const r of c.replies) {
      const row = el("div", "mv-review-popover-msg mv-review-popover-msg--reply");
      const rm = el("div", "mv-review-popover-meta");
      rm.textContent = [r.author || "Auteur onbekend", formatReviewTs(r.createdAt)].filter(Boolean).join(" · ");
      const rb = el("div", "mv-review-popover-body-text");
      rb.textContent = r.body.trim() || "(Leeg)";
      row.append(rm, rb);
      thread.append(row);
    }
    reviewPopover.append(thread);
    const rect = span.getBoundingClientRect();
    const maxW = Math.min(360, window.innerWidth - 24);
    reviewPopover.style.width = `${maxW}px`;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - maxW - 8));
    reviewPopover.style.left = `${left}px`;
    reviewPopover.style.top = `${rect.bottom + 6}px`;
    reviewPopover.hidden = false;
  }

  function selectionForNewComment(): boolean {
    if (!isEditing || !editRoot || editorSurfaceMode === "code") return false;
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return false;
    if (!editRoot.contains(sel.anchorNode) || !editRoot.contains(sel.focusNode)) return false;
    if (!sel.toString().trim()) return false;
    const anc = sel.anchorNode;
    const foc = sel.focusNode;
    const startEl = anc?.nodeType === Node.TEXT_NODE ? anc.parentElement : (anc as Element);
    const endEl = foc?.nodeType === Node.TEXT_NODE ? foc.parentElement : (foc as Element);
    if (startEl?.closest(`.${REVIEW_HIGHLIGHT_CLASS}`)) return false;
    if (endEl?.closest(`.${REVIEW_HIGHLIGHT_CLASS}`)) return false;
    return true;
  }

  async function persistReviewCommentsToServer(): Promise<boolean> {
    const name = editorBoundDoc ?? fileSelect.value;
    if (!name) return false;
    const serverName = name === EXTERNAL_MARKDOWN_VALUE ? getOrCreateExternalAgentVirtualName() : name;
    try {
      const { reviewRelativePath } = await saveReviewComments(serverName, reviewComments);
      status.textContent = `Commentaren opgeslagen → ${reviewRelativePath}`;
      return true;
    } catch (e) {
      status.textContent = `Commentaar opslaan mislukt: ${String((e as Error).message)}`;
      return false;
    }
  }

  async function acceptAllPendingAgentReviews() {
    const pending = reviewComments.filter(lastReplyIsFromAgent);
    if (pending.length === 0 || !editRoot) return;
    if (editorSurfaceMode === "code") await switchEditorToVisualMode();
    try {
      if (hasChangeMarkers(editRoot)) {
        stripChangeMarkers(editRoot);
      }
      const pendingIds = new Set(pending.map((c) => c.id));
      for (const id of pendingIds) {
        unwrapHighlightById(editRoot, id);
      }
      reviewComments = reviewComments.filter((c) => !pendingIds.has(c.id));
      hideReviewPopover();
      await persistReviewCommentsToServer();
      refreshAgentPendingDecisionUi();
      editRoot.dispatchEvent(new Event("input", { bubbles: true }));
      status.textContent =
        pending.length === 1
          ? "Akkoord: agentwijziging definitief."
          : `Akkoord: ${pending.length} agentwijzigingen definitief.`;
    } catch (e) {
      status.textContent = `Akkoord verwerken mislukt: ${String((e as Error).message)}`;
    }
  }

  async function rejectAllPendingAgentReviews() {
    const pending = reviewComments.filter(lastReplyIsFromAgent);
    if (pending.length === 0) return;
    const name = fileSelect.value;
    if (!name) return;
    if (
      !confirm(
        "Niet akkoord: het document wordt teruggezet naar vóór deze agentwijziging(en). Open agent-threads worden verwijderd. Doorgaan?",
      )
    ) {
      return;
    }
    try {
      const serverName = name === EXTERNAL_MARKDOWN_VALUE ? getOrCreateExternalAgentVirtualName() : name;
      const restored = await revertMarkdownToLastBackup(serverName, {
        external: name === EXTERNAL_MARKDOWN_VALUE,
      });
      currentMd = restored.content;
      if (name === EXTERNAL_MARKDOWN_VALUE) {
        try {
          await writeExternalMarkdown(restored.content);
        } catch (e) {
          status.textContent = `Terugzetten naar ${externalDocumentSourceLabel()} mislukt: ${String((e as Error).message)}`;
          return;
        }
      }
      const pendingIds = new Set(pending.map((c) => c.id));
      if (editRoot) {
        for (const id of pendingIds) {
          unwrapHighlightById(editRoot, id);
        }
      }
      reviewComments = reviewComments.filter((c) => !pendingIds.has(c.id));
      hideReviewPopover();
      await persistReviewCommentsToServer();
      const { html } = renderMarkdown(currentMd);
      if (editRoot) {
        if (editorSurfaceMode === "code" && editorCodeTextarea) {
          editorCodeTextarea.value = currentMd;
          const { toc } = renderMarkdown(currentMd);
          mountEditorTocFromEntries(toc);
        } else {
          mountEditSheetPages(editRoot, html);
          applyReviewHighlights(editRoot, reviewComments);
          syncEditorTocFromCurrentMd(editRoot);
        }
        isDirty = false;
      } else if (fileSelect.value) {
        await mountEditorSurface();
      }
      refreshAgentPendingDecisionUi();
      status.textContent = "Niet akkoord: vorige versie teruggezet.";
    } catch (e) {
      status.textContent = `Niet akkoord verwerken mislukt: ${String((e as Error).message)}`;
    }
  }

  function refreshAgentPendingDecisionUi() {
    syncAgentChatDisabled();
    rerenderAgentChatMessages();
  }

  document.addEventListener("mousedown", (e) => {
    if (reviewPopover.hidden) return;
    const t = e.target as Node;
    if (reviewPopover.contains(t)) return;
    hideReviewPopover();
  });

  function openCommentFromEditorSelection(options?: { startMic?: boolean }): void {
    if (!editRoot || !isEditing) return;
    if (!selectionForNewComment()) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!anchorFromSelection(editRoot, r)) return;
    reviewDraftRange = r.cloneRange();
    const full = reviewDraftRange.toString();
    commentSelectionQuote.textContent = full.length > 400 ? `${full.slice(0, 400)}…` : full;
    commentSelectionHost.hidden = false;
    refreshAgentChatModeUi();
    syncAgentChatDisabled();
    agentChatInput.focus();
    commentSelectionHost.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (
      options?.startMic &&
      agentSpeechRecognitionAvailable &&
      !agentChatMicBtn.hidden &&
      !agentChatMicBtn.disabled &&
      !agentChatSpeechRec
    ) {
      startAgentChatSpeech();
    }
  }

  commentAddBtn.addEventListener("mousedown", (e) => e.preventDefault());
  commentAddBtn.addEventListener("click", () => openCommentFromEditorSelection());

  /** Alleen Ctrl+Q (geen Cmd), zodat macOS Cmd+Q de app niet sluit. */
  document.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || e.metaKey) return;
    if (e.key.toLowerCase() !== "q") return;
    if (e.altKey || e.shiftKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
      return;
    }
    if (commentAddBtn.disabled) return;
    e.preventDefault();
    openCommentFromEditorSelection({ startMic: true });
  });

  commentSelectionCancelBtn.addEventListener("click", () => {
    reviewDraftRange = null;
    commentSelectionHost.hidden = true;
    refreshAgentChatModeUi();
  });

  function refreshTemplateVars() {
    applyCssVars(root, templateToCssVars(mergeTemplate(defaultTemplate, currentMerged)));
  }

  function selectionInsideEditor(): boolean {
    if (!editRoot) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const n = sel.anchorNode;
    const elNode = n?.nodeType === Node.TEXT_NODE ? (n.parentElement as Node | null) : (n as Node | null);
    if (!elNode) return false;
    return editRoot.contains(elNode);
  }

  function normalizeFormatBlockTag(raw: string): string {
    return raw.replace(/[<>]/g, "").toLowerCase();
  }

  function listAncestor(): HTMLUListElement | HTMLOListElement | null {
    if (!editRoot) return null;
    const sel = window.getSelection();
    if (!sel?.anchorNode) return null;
    let n: Node | null = sel.anchorNode;
    if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    let elNode = n as Element | null;
    while (elNode && editRoot.contains(elNode)) {
      const tag = elNode.tagName;
      if (tag === "UL") return elNode as HTMLUListElement;
      if (tag === "OL") return elNode as HTMLOListElement;
      elNode = elNode.parentElement;
    }
    return null;
  }

  function caretInListItem(): boolean {
    if (!editRoot) return false;
    const sel = window.getSelection();
    if (!sel?.anchorNode) return false;
    let n: Node | null = sel.anchorNode;
    if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    let elNode = n as Element | null;
    while (elNode && editRoot.contains(elNode)) {
      if (elNode.tagName === "LI") return true;
      elNode = elNode.parentElement;
    }
    return false;
  }

  function refreshEditorSourceToggleUi(): void {
    const code = editorSurfaceMode === "code";
    sourceToggleBtn.textContent = code ? "Weergave" : "Markdown";
    sourceToggleBtn.setAttribute("aria-pressed", code ? "true" : "false");
    sourceToggleBtn.disabled = externalDocumentKind === "confluence";
    sourceToggleBtn.title =
      externalDocumentKind === "confluence"
        ? "Ruwe Markdown is uitgeschakeld voor Confluence-pagina's, zodat macro-placeholders niet bewerkt worden."
        : code
          ? "Terug naar opgemaakte weergave."
          : "Ruwe markdown tonen en bewerken.";
  }

  function refreshRibbonState() {
    refreshEditorSourceToggleUi();
    if (!isEditing || !editRoot) return;
    if (editorSurfaceMode === "code") {
      boldBtn.classList.remove("is-active");
      italicBtn.classList.remove("is-active");
      inlineCodeBtn.classList.remove("is-active");
      h1Btn.classList.remove("is-active");
      h2Btn.classList.remove("is-active");
      h3Btn.classList.remove("is-active");
      h4Btn.classList.remove("is-active");
      quoteBtn.classList.remove("is-active");
      ulBtn.classList.remove("is-active");
      olBtn.classList.remove("is-active");
      tableInsertBtn.disabled = true;
      rowAboveBtn.disabled = true;
      rowBelowBtn.disabled = true;
      rowDelBtn.disabled = true;
      colLeftBtn.disabled = true;
      colRightBtn.disabled = true;
      colDelBtn.disabled = true;
      tableDelBtn.disabled = true;
      commentAddBtn.disabled = true;
      try {
        indentBtn.disabled = true;
        outdentBtn.disabled = true;
      } catch {
        /* */
      }
      return;
    }
    const canInspect =
      selectionInsideEditor() || (!!editRoot && editRoot.contains(document.activeElement));
    if (!canInspect) {
      boldBtn.classList.remove("is-active");
      italicBtn.classList.remove("is-active");
      inlineCodeBtn.classList.remove("is-active");
      h1Btn.classList.remove("is-active");
      h2Btn.classList.remove("is-active");
      h3Btn.classList.remove("is-active");
      h4Btn.classList.remove("is-active");
      quoteBtn.classList.remove("is-active");
      ulBtn.classList.remove("is-active");
      olBtn.classList.remove("is-active");
      tableInsertBtn.disabled = true;
      rowAboveBtn.disabled = true;
      rowBelowBtn.disabled = true;
      rowDelBtn.disabled = true;
      colLeftBtn.disabled = true;
      colRightBtn.disabled = true;
      colDelBtn.disabled = true;
      tableDelBtn.disabled = true;
      commentAddBtn.disabled = true;
      return;
    }
    try {
      boldBtn.classList.toggle("is-active", document.queryCommandState("bold"));
      italicBtn.classList.toggle("is-active", document.queryCommandState("italic"));
      const block = normalizeFormatBlockTag(String(document.queryCommandValue("formatBlock") || ""));
      h1Btn.classList.toggle("is-active", block === "h1");
      h2Btn.classList.toggle("is-active", block === "h2");
      h3Btn.classList.toggle("is-active", block === "h3");
      h4Btn.classList.toggle("is-active", block === "h4");
      quoteBtn.classList.toggle("is-active", block === "blockquote");
      const sel = window.getSelection();
      const anchorEl =
        sel?.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : (sel?.anchorNode as Element | null);
      inlineCodeBtn.classList.toggle("is-active", !!anchorEl?.closest("code") && !anchorEl.closest("pre"));
      const listEl = listAncestor();
      ulBtn.classList.toggle("is-active", listEl?.tagName === "UL");
      olBtn.classList.toggle("is-active", listEl?.tagName === "OL");
      try {
        indentBtn.disabled = !document.queryCommandEnabled("indent");
        outdentBtn.disabled = !document.queryCommandEnabled("outdent");
      } catch {
        indentBtn.disabled = false;
        outdentBtn.disabled = false;
      }
      tableInsertBtn.disabled = false;
      const tCell = getActiveTableCell(editRoot);
      const inTable = !!tCell;
      rowAboveBtn.disabled = !inTable;
      rowBelowBtn.disabled = !inTable;
      rowDelBtn.disabled = !inTable;
      colLeftBtn.disabled = !inTable;
      colRightBtn.disabled = !inTable;
      colDelBtn.disabled = !inTable;
      tableDelBtn.disabled = !inTable;
      commentAddBtn.disabled = !selectionForNewComment();
    } catch {
      boldBtn.classList.remove("is-active");
      italicBtn.classList.remove("is-active");
      inlineCodeBtn.classList.remove("is-active");
      h1Btn.classList.remove("is-active");
      h2Btn.classList.remove("is-active");
      h3Btn.classList.remove("is-active");
      h4Btn.classList.remove("is-active");
      quoteBtn.classList.remove("is-active");
      ulBtn.classList.remove("is-active");
      olBtn.classList.remove("is-active");
      tableInsertBtn.disabled = true;
      rowAboveBtn.disabled = true;
      rowBelowBtn.disabled = true;
      rowDelBtn.disabled = true;
      colLeftBtn.disabled = true;
      colRightBtn.disabled = true;
      colDelBtn.disabled = true;
      tableDelBtn.disabled = true;
      commentAddBtn.disabled = true;
    }
  }

  function scheduleRibbonRefresh() {
    if (!editRoot) return;
    if (ribbonRaf) return;
    ribbonRaf = requestAnimationFrame(() => {
      ribbonRaf = 0;
      refreshRibbonState();
    });
  }

  document.addEventListener("selectionchange", () => scheduleRibbonRefresh());

  function editorSelectionRange(): Range | null {
    if (!editRoot) return null;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!editRoot.contains(range.commonAncestorContainer)) return null;
    return range;
  }

  function placeCaretAfter(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertNodeAtEditorSelection(node: Node) {
    const range = editorSelectionRange();
    if (!range) return;
    range.deleteContents();
    range.insertNode(node);
    placeCaretAfter(node);
    editRoot?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function toggleInlineCode() {
    const range = editorSelectionRange();
    if (!range) return;
    const selected = range.toString();
    const code = document.createElement("code");
    code.textContent = selected || "code";
    range.deleteContents();
    range.insertNode(code);
    placeCaretAfter(code);
    editRoot?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insertCodeBlock() {
    const range = editorSelectionRange();
    if (!range) return;
    const selected = range.toString();
    const language = prompt("Taal voor codeblok (optioneel, bijv. javascript)", "")?.trim();
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (language) code.className = `language-${language.replace(/[^a-z0-9_-]/gi, "")}`;
    code.textContent = selected || "code";
    pre.append(code);
    const after = document.createElement("p");
    after.append(document.createElement("br"));
    range.deleteContents();
    range.insertNode(after);
    range.insertNode(pre);
    placeCaretAfter(after);
    editRoot?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function createLinkFromSelection() {
    const range = editorSelectionRange();
    if (!range) return;
    const selected = range.toString().trim();
    const href = prompt("Link URL", selected.startsWith("http") ? selected : "https://");
    if (!href) return;
    const text = selected || prompt("Linktekst", href) || href;
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    range.deleteContents();
    range.insertNode(a);
    placeCaretAfter(a);
    editRoot?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wireExec(btn: HTMLButtonElement, run: () => void) {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (!editRoot || !isEditing) return;
      editRoot.focus();
      run();
      refreshRibbonState();
    });
  }

  function wireTableEdit(btn: HTMLButtonElement, run: () => void) {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      if (!editRoot || !isEditing) return;
      editRoot.focus();
      run();
      editRoot.dispatchEvent(new Event("input", { bubbles: true }));
      refreshRibbonState();
    });
  }

  wireExec(boldBtn, () => {
    document.execCommand("bold");
  });
  wireExec(italicBtn, () => {
    document.execCommand("italic");
  });
  wireExec(inlineCodeBtn, () => {
    toggleInlineCode();
  });
  wireExec(h1Btn, () => {
    document.execCommand("formatBlock", false, "h1");
  });
  wireExec(h2Btn, () => {
    document.execCommand("formatBlock", false, "h2");
  });
  wireExec(h3Btn, () => {
    document.execCommand("formatBlock", false, "h3");
  });
  wireExec(h4Btn, () => {
    document.execCommand("formatBlock", false, "h4");
  });
  wireExec(quoteBtn, () => {
    document.execCommand("formatBlock", false, "blockquote");
  });

  wireExec(ulBtn, () => {
    document.execCommand("insertUnorderedList");
  });
  wireExec(olBtn, () => {
    document.execCommand("insertOrderedList");
  });
  wireExec(indentBtn, () => {
    document.execCommand("indent");
  });
  wireExec(outdentBtn, () => {
    document.execCommand("outdent");
  });
  wireExec(codeBlockBtn, () => {
    insertCodeBlock();
  });
  wireExec(linkBtn, () => {
    createLinkFromSelection();
  });
  wireExec(hrBtn, () => {
    insertNodeAtEditorSelection(document.createElement("hr"));
  });

  wireTableEdit(tableInsertBtn, () => {
    insertTableAtSelection(editRoot!, { cols: 3, headerRows: 1, bodyRows: 2 });
  });
  wireTableEdit(rowAboveBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) addTableRowAbove(c);
  });
  wireTableEdit(rowBelowBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) addTableRowBelow(c);
  });
  wireTableEdit(rowDelBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) deleteTableRow(c);
  });
  wireTableEdit(colLeftBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) addTableColumnLeft(c);
  });
  wireTableEdit(colRightBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) addTableColumnRight(c);
  });
  wireTableEdit(colDelBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) deleteTableColumn(c);
  });
  wireTableEdit(tableDelBtn, () => {
    const c = getActiveTableCell(editRoot);
    if (c) deleteTable(c);
  });

  function runPersistOp(op: () => Promise<void>): Promise<void> {
    const next = persistChain.then(op, op);
    persistChain = next.catch(() => {});
    return next;
  }

  function clearAutoSaveDebounce(): void {
    if (autoSaveDebounceTimer) {
      clearTimeout(autoSaveDebounceTimer);
      autoSaveDebounceTimer = null;
    }
  }

  function teardownEditor(): void {
    clearAutoSaveDebounce();
    if (editorTocDebounceTimer) {
      clearTimeout(editorTocDebounceTimer);
      editorTocDebounceTimer = null;
    }
    tocHost.replaceChildren();
    tocHost.hidden = true;
    isEditing = false;
    isDirty = false;
    editorBoundDoc = null;
    editRoot = null;
    editorSurfaceMode = "visual";
    editorCodeTextarea = null;
    editorVisualWrap = null;
    editorCodeWrap = null;
    ribbon.hidden = true;
    hideReviewPopover();
    reviewDraftRange = null;
    commentSelectionHost.hidden = true;
    stack.classList.remove("mv-stack--editing");
    fileSelect.disabled = false;
    tplSelect.disabled = !templatesAvailable;
    printBtn.disabled = false;
  }

  async function persistEditorToFile(
    targetName: string,
    reason: "manual" | "auto" = "manual",
  ): Promise<void> {
    if (!editRoot || !isEditing) return;
    if (!targetName) return;
    await runPersistOp(async () => {
      try {
        if (editorSurfaceMode === "code" && editorCodeTextarea) {
          const md = editorCodeTextarea.value;
          if (targetName === EXTERNAL_MARKDOWN_VALUE) {
            await writeExternalMarkdown(md);
            currentMd = md;
            isDirty = false;
            const { reviewRelativePath } = await saveReviewComments(
              getOrCreateExternalAgentVirtualName(),
              reviewComments,
            );
            const tplPart = templatesAvailable ? tplSelect.value : "geen templatebestanden";
            if (reason === "manual") {
              status.textContent =
                `${externalFileLabel} — opgeslagen naar ${externalDocumentSourceLabel()} — commentaren: ${reviewRelativePath} — ${tplPart}`;
            } else {
              const now = Date.now();
              if (now - lastAutoSaveOkAt > 2800) {
                lastAutoSaveOkAt = now;
                status.textContent = `${externalFileLabel} — automatisch opgeslagen — ${reviewRelativePath}`;
              }
            }
            refreshRibbonState();
            return;
          }
          await saveMarkdownFile(targetName, md);
          const { reviewRelativePath } = await saveReviewComments(targetName, reviewComments);
          currentMd = md;
          isDirty = false;
          const tplPart = templatesAvailable ? tplSelect.value : "geen templatebestanden";
          if (reason === "manual") {
            status.textContent = `${targetName} — opgeslagen — commentaren: ${reviewRelativePath} — ${tplPart}`;
          } else {
            const now = Date.now();
            if (now - lastAutoSaveOkAt > 2800) {
              lastAutoSaveOkAt = now;
              status.textContent = `${targetName} — automatisch opgeslagen — ${reviewRelativePath}`;
            }
          }
          refreshRibbonState();
          return;
        }
        if (hasChangeMarkers(editRoot!)) {
          stripChangeMarkers(editRoot!);
        }
        syncAnchorsFromDom(editRoot!, reviewComments);
        const clone = editRoot!.cloneNode(true) as HTMLElement;
        stripChangeMarkers(clone);
        stripReviewHighlights(clone);
        const md = htmlFragmentToMarkdown(htmlFromEditRootForMarkdown(clone));
        if (targetName === EXTERNAL_MARKDOWN_VALUE) {
            await writeExternalMarkdown(md);
          currentMd = md;
          isDirty = false;
          const { reviewRelativePath } = await saveReviewComments(
            getOrCreateExternalAgentVirtualName(),
            reviewComments,
          );
          const tplPart = templatesAvailable ? tplSelect.value : "geen templatebestanden";
          if (reason === "manual") {
            status.textContent =
              `${externalFileLabel} — opgeslagen naar ${externalDocumentSourceLabel()} — commentaren: ${reviewRelativePath} — ${tplPart}`;
          } else {
            const now = Date.now();
            if (now - lastAutoSaveOkAt > 2800) {
              lastAutoSaveOkAt = now;
              status.textContent = `${externalFileLabel} — automatisch opgeslagen — ${reviewRelativePath}`;
            }
          }
          refreshRibbonState();
          return;
        }
        await saveMarkdownFile(targetName, md);
        const { reviewRelativePath } = await saveReviewComments(targetName, reviewComments);
        currentMd = md;
        isDirty = false;
        const tplPart = templatesAvailable ? tplSelect.value : "geen templatebestanden";
        if (reason === "manual") {
          status.textContent = `${targetName} — opgeslagen — commentaren: ${reviewRelativePath} — ${tplPart}`;
        } else {
          const now = Date.now();
          if (now - lastAutoSaveOkAt > 2800) {
            lastAutoSaveOkAt = now;
            status.textContent = `${targetName} — automatisch opgeslagen — ${reviewRelativePath}`;
          }
        }
        refreshRibbonState();
      } catch (e) {
        status.textContent = `Opslaan mislukt: ${String((e as Error).message)}`;
      }
    });
  }

  async function persistEditor(reason: "manual" | "auto" = "manual"): Promise<void> {
    const target = editorBoundDoc ?? fileSelect.value;
    if (!target) return;
    await persistEditorToFile(target, reason);
  }

  function scheduleAutoSave(): void {
    isDirty = true;
    if (!editRoot) return;
    if (editorSurfaceMode === "visual" && hasChangeMarkers(editRoot)) return;
    if (editorBoundDoc === EXTERNAL_MARKDOWN_VALUE && externalDocumentKind === "confluence") return;
    clearAutoSaveDebounce();
    const boundSnapshot = editorBoundDoc;
    autoSaveDebounceTimer = setTimeout(() => {
      autoSaveDebounceTimer = null;
      if (!editRoot || !boundSnapshot || boundSnapshot !== editorBoundDoc) return;
      void persistEditorToFile(boundSnapshot, "auto");
    }, 850);
  }

  async function flushAutoSave(): Promise<void> {
    clearAutoSaveDebounce();
    if (!editRoot || !isEditing || !editorBoundDoc) return;
    if (!isDirty) return;
    await persistEditorToFile(editorBoundDoc, "manual");
  }

  async function forcePersistEditor(): Promise<void> {
    clearAutoSaveDebounce();
    const target = editorBoundDoc ?? fileSelect.value;
    if (!editRoot || !isEditing || !target) return;
    await persistEditorToFile(target, "manual");
  }

  async function saveCurrentEditorToBoundDoc(): Promise<void> {
    clearAutoSaveDebounce();
    if (!editRoot || !isEditing || !editorBoundDoc) return;
    if (!isDirty) return;
    await persistEditorToFile(editorBoundDoc, "manual");
  }

  function getMarkdownForExport(): string {
    if (isEditing && editorSurfaceMode === "code" && editorCodeTextarea) {
      return editorCodeTextarea.value;
    }
    if (isEditing && editRoot) {
      const clone = editRoot.cloneNode(true) as HTMLElement;
      if (hasChangeMarkers(clone)) stripChangeMarkers(clone);
      stripReviewHighlights(clone);
      return htmlFragmentToMarkdown(htmlFromEditRootForMarkdown(clone));
    }
    return currentMd;
  }

  async function revertEditorToCurrentMd() {
    if (!editRoot || !isEditing) return;
    if (
      isDirty &&
      !confirm("Alle wijzigingen in de editor negeren en de laatst opgeslagen inhoud herstellen?")
    ) {
      return;
    }
    const name = fileSelect.value;
    if (name === EXTERNAL_MARKDOWN_VALUE) {
      if (!externalFileHandle) {
        reviewComments = [];
        rerenderAgentChatMessages();
      } else {
        try {
          currentMd = await readExternalMarkdownDisk();
        } catch (e) {
          status.textContent = `Extern bestand opnieuw lezen mislukt: ${String((e as Error).message)}`;
        }
        try {
          applyReviewPack(await fetchReviewComments(getOrCreateExternalAgentVirtualName()));
        } catch {
          reviewComments = [];
          rerenderAgentChatMessages();
        }
      }
    } else if (name) {
      try {
        applyReviewPack(await fetchReviewComments(name));
      } catch {
        reviewComments = [];
        rerenderAgentChatMessages();
      }
    }
    const { html } = renderMarkdown(currentMd);
    if (editorSurfaceMode === "code" && editorCodeTextarea) {
      editorCodeTextarea.value = currentMd;
      const { toc } = renderMarkdown(currentMd);
      mountEditorTocFromEntries(toc);
    } else {
      mountEditSheetPages(editRoot, html);
      applyReviewHighlights(editRoot, reviewComments);
      syncEditorTocFromCurrentMd(editRoot);
    }
    isDirty = false;
    refreshAgentPendingDecisionUi();
    refreshRibbonState();
  }

  saveDocBtn.addEventListener("mousedown", (e) => e.preventDefault());
  saveDocBtn.addEventListener("click", () => void forcePersistEditor());
  discardBtn.addEventListener("mousedown", (e) => e.preventDefault());
  discardBtn.addEventListener("click", () => void revertEditorToCurrentMd());
  sourceToggleBtn.addEventListener("mousedown", (e) => e.preventDefault());
  sourceToggleBtn.addEventListener("click", () => void toggleEditorSurfaceMode());

  function syncAgentSidebarBusyUi() {
    const show = agentChatRequestBusy || sidebarReviewBusy || agentChatTranscriptCleanupBusy;
    agentSidebarBusy.hidden = !show;
    if (agentChatTranscriptCleanupBusy) {
      agentSidebarBusyText.textContent = "Transcript opschonen…";
    } else if (agentChatRequestBusy) {
      agentSidebarBusyText.textContent = "Even geduld (chat)…";
    } else if (sidebarReviewBusy) {
      agentSidebarBusyText.textContent = "Agent verwerkt opmerkingen…";
    }
  }

  function syncAgentChatDisabled() {
    const dis = agentChatRequestBusy || sidebarReviewBusy || agentChatTranscriptCleanupBusy;
    agentChatSendBtn.disabled = dis;
    agentChatInput.disabled = dis;
    agentModeAgentBtn.disabled = dis;
    agentModeAskBtn.disabled = dis;
    agentChatClearBtn.disabled = dis;
    agentChatSessionSelect.disabled = dis;
    agentChatNewBtn.disabled = dis;
    agentChatRenameBtn.disabled = dis || !activeAgentChatId;
    agentChatDeleteBtn.disabled = dis || agentChatSessions.length <= 1;
    agentChatPromoteBtn.disabled = dis || !activeAgentChatId;
    agentChatPromoteStaleBtn.disabled = dis;
    agentMemoryToggleBtn.disabled = dis;
    agentCorpusRefreshBtn.disabled = dis;
    agentSecondBrainBtn.disabled = dis;
    agentAskToAgentBtn.disabled = dis || !lastAskAssistantReply();
    promptMacroBtn.disabled = dis;
    meetingReportBtn.disabled = dis;
    agentChatMicBtn.disabled = dis || !agentSpeechRecognitionAvailable;
    agentCorpusWideCheckbox.disabled = dis;
    agentWebSearchCheckbox.disabled = dis;
    if (dis) stopAgentChatSpeech();
  }

  function setAgentChatRequestBusy(busy: boolean) {
    agentChatRequestBusy = busy;
    syncAgentSidebarBusyUi();
    syncAgentChatDisabled();
  }

  function trimAgentChatHistoryForUi(messages: AgentChatTurn[]): AgentChatTurn[] {
    return messages.slice(-MAX_AGENT_CHAT_HISTORY);
  }

  function normalizeAgentChatHistoryForUi(messages: AgentChatTurn[]): AgentChatTurn[] {
    return trimAgentChatHistoryForUi(messages.map((m) => ({ role: m.role, content: m.content, ...(m.mode ? { mode: m.mode } : {}) })));
  }

  function activeAgentChatSession(): AgentChatSession | null {
    return agentChatSessions.find((s) => s.id === activeAgentChatId) ?? null;
  }

  function applyAgentChatSessionsPayload(payload: { activeChatId: string; sessions: AgentChatSession[] }): void {
    agentChatSessions = payload.sessions;
    activeAgentChatId =
      payload.activeChatId && payload.sessions.some((s) => s.id === payload.activeChatId)
        ? payload.activeChatId
        : payload.sessions[0]?.id || "";
    agentChatHistory = normalizeAgentChatHistoryForUi(activeAgentChatSession()?.messages ?? []);
    syncAgentChatSessionUi();
    rerenderAgentChatMessages();
  }

  function syncAgentChatSessionUi(): void {
    const selected = activeAgentChatId;
    agentChatSessionSelect.replaceChildren();
    for (const session of agentChatSessions) {
      const opt = document.createElement("option");
      opt.value = session.id;
      const statusLabel =
        session.lifecycleStatus && session.lifecycleStatus !== "active" ? ` [${session.lifecycleStatus}]` : "";
      opt.textContent = `${session.title || "Nieuwe chat"}${statusLabel}`;
      agentChatSessionSelect.append(opt);
    }
    agentChatSessionSelect.value = selected;
    agentChatDeleteBtn.disabled = agentChatRequestBusy || sidebarReviewBusy || agentChatSessions.length <= 1;
    agentChatPromoteBtn.disabled = agentChatRequestBusy || sidebarReviewBusy || !activeAgentChatId;
    agentChatPromoteStaleBtn.disabled = agentChatRequestBusy || sidebarReviewBusy;
    agentCorpusRefreshBtn.disabled = agentChatRequestBusy || sidebarReviewBusy;
    agentSecondBrainBtn.disabled = agentChatRequestBusy || sidebarReviewBusy;
    agentAskToAgentBtn.disabled = agentChatRequestBusy || sidebarReviewBusy || !lastAskAssistantReply();
  }

  async function loadAgentChatSessions(): Promise<void> {
    try {
      applyAgentChatSessionsPayload(await fetchAgentChatSessions());
    } catch (e) {
      status.textContent = `Chats laden mislukt: ${String((e as Error).message)}`;
    }
  }

  async function persistActiveAgentChatSession(options: { title?: string; active?: boolean } = {}): Promise<void> {
    if (!activeAgentChatId) return;
    try {
      const payload = await updateAgentChatSession(activeAgentChatId, {
        messages: agentChatHistory,
        ...(options.title ? { title: options.title } : {}),
        ...(options.active ? { active: true } : {}),
      });
      applyAgentChatSessionsPayload(payload);
    } catch (e) {
      status.textContent = `Chat opslaan mislukt: ${String((e as Error).message)}`;
    }
  }

  async function createNewAgentChat(): Promise<void> {
    try {
      pendingMemoryActions = [];
      revertibleMemoryActions = [];
      applyAgentChatSessionsPayload(await createAgentChatSession());
      hideAgentChatLlmDebug();
      clearAgentChatActivityStrip();
    } catch (e) {
      status.textContent = `Nieuwe chat starten mislukt: ${String((e as Error).message)}`;
    }
  }

  async function switchAgentChatSession(id: string): Promise<void> {
    const session = agentChatSessions.find((s) => s.id === id);
    if (!session) return;
    pendingMemoryActions = [];
    revertibleMemoryActions = [];
    activeAgentChatId = id;
    agentChatHistory = normalizeAgentChatHistoryForUi(session.messages);
    syncAgentChatSessionUi();
    rerenderAgentChatMessages();
    try {
      applyAgentChatSessionsPayload(await updateAgentChatSession(id, { active: true }));
    } catch (e) {
      status.textContent = `Chat wisselen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function renameActiveAgentChat(): Promise<void> {
    const session = activeAgentChatSession();
    if (!session) return;
    const next = prompt("Naam voor deze chat", session.title || "Nieuwe chat");
    if (next === null) return;
    const title = next.trim();
    if (!title) return;
    await persistActiveAgentChatSession({ title, active: true });
  }

  async function deleteActiveAgentChat(): Promise<void> {
    if (!activeAgentChatId || agentChatSessions.length <= 1) return;
    const session = activeAgentChatSession();
    if (!confirm(`Chat "${session?.title || "Nieuwe chat"}" verwijderen?`)) return;
    try {
      pendingMemoryActions = [];
      revertibleMemoryActions = [];
      applyAgentChatSessionsPayload(await deleteAgentChatSession(activeAgentChatId));
      hideAgentChatLlmDebug();
      clearAgentChatActivityStrip();
    } catch (e) {
      status.textContent = `Chat verwijderen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function renderMemoryPanel(): Promise<void> {
    agentMemoryPanel.hidden = !memoryPanelVisible;
    if (!memoryPanelVisible) return;
    agentMemoryPanel.replaceChildren(el("div", "mv-agent-memory-panel-title", "Agent long-term memory laden…"));
    try {
      const idx = await fetchMemoryIndex();
      memoryMarkdownPaths = idx.files;
      const title = el("div", "mv-agent-memory-panel-title", `Agent memory (${idx.files.length})`);
      const hint = el(
        "div",
        "mv-agent-memory-panel-hint",
        "Inspectable long-term memory onder Files/.memory/. Werkdocumenten staan in de linker documentenboom.",
      );
      const list = el("div", "mv-agent-memory-panel-list");
      if (!idx.files.length) {
        list.append(el("div", "mv-agent-memory-panel-empty", "Nog geen memory-documenten."));
      }
      for (const name of idx.files.slice(0, 80)) {
        const btn = el("button", "mv-agent-memory-panel-item", name);
        btn.type = "button";
        btn.title = `Bekijk ${name}`;
        btn.addEventListener("click", async () => {
          try {
            const content = await fetchMemoryFile(name);
            const preview = content.length > 1800 ? `${content.slice(0, 1800)}\n\n…` : content;
            agentMemoryPanel.querySelector(".mv-agent-memory-panel-preview")?.remove();
            const pre = el("pre", "mv-agent-memory-panel-preview", preview);
            agentMemoryPanel.append(pre);
          } catch (e) {
            status.textContent = `Memory-bestand lezen mislukt: ${String((e as Error).message)}`;
          }
        });
        list.append(btn);
      }
      agentMemoryPanel.replaceChildren(title, hint, list);
    } catch (e) {
      agentMemoryPanel.replaceChildren(
        el("div", "mv-agent-memory-panel-title", "Agent memory"),
        el("div", "mv-agent-memory-panel-hint", `Memory laden mislukt: ${String((e as Error).message)}`),
      );
    }
  }

  async function promoteActiveChatToMemory(): Promise<void> {
    if (!activeAgentChatId) return;
    if (!confirm("Deze actieve chat samenvatten en naar long-term memory promoveren?")) return;
    setAgentChatRequestBusy(true);
    try {
      const result = await promoteAgentChatSession(activeAgentChatId);
      applyAgentChatSessionsPayload(result);
      await refreshAfterMemoryActions(result.executedMemoryActions || [], result.corpusCreatedPaths || []);
      if (memoryPanelVisible) await renderMemoryPanel();
      status.textContent = "Chat gepromoveerd naar long-term memory.";
    } catch (e) {
      status.textContent = `Chatpromotie mislukt: ${String((e as Error).message)}`;
    } finally {
      setAgentChatRequestBusy(false);
      rerenderAgentChatMessages();
    }
  }

  async function promoteStaleChatsToMemory(): Promise<void> {
    if (!confirm("Alle stale chats verwerken naar long-term memory?")) return;
    setAgentChatRequestBusy(true);
    try {
      const result = await promoteStaleAgentChats();
      applyAgentChatSessionsPayload(result);
      await refreshAfterMemoryActions(result.executedMemoryActions || [], result.corpusCreatedPaths || []);
      if (memoryPanelVisible) await renderMemoryPanel();
      status.textContent = result.errors?.length
        ? `Stale chats deels verwerkt (${result.errors.length} fout(en)).`
        : "Stale chats verwerkt naar long-term memory.";
    } catch (e) {
      status.textContent = `Stale chats verwerken mislukt: ${String((e as Error).message)}`;
    } finally {
      setAgentChatRequestBusy(false);
      rerenderAgentChatMessages();
    }
  }

  async function refreshCorpusInformation(): Promise<void> {
    setAgentChatRequestBusy(true);
    status.textContent = "Corpusinformatie verversen…";
    try {
      const result = await rebuildCorpusIndex();
      await loadLists(fileSelect.value || undefined);
      if (memoryPanelVisible) await renderMemoryPanel();
      status.textContent = `Corpus ververst: ${result.entryCount} werkdocument(en), ${result.memoryEntryCount} memory-document(en).`;
    } catch (e) {
      status.textContent = `Corpus verversen mislukt: ${String((e as Error).message)}`;
    } finally {
      setAgentChatRequestBusy(false);
    }
  }

  async function showSecondBrainContextSummary(): Promise<void> {
    setAgentChatRequestBusy(true);
    status.textContent = "Second-brain context ophalen…";
    try {
      const ctx = await fetchSecondBrainContext();
      const workingTags = Object.keys(ctx.working.tagCounts || {}).length;
      const memoryTags = Object.keys(ctx.memory.tagCounts || {}).length;
      const unlinked = await fetchSecondBrainUnlinkedMentions();
      const workingMentions = unlinked.working.length;
      const memoryMentions = unlinked.memory.length;
      status.textContent =
        `Second brain: ${ctx.working.entryCount} werkdocument(en), ${ctx.memory.entryCount} memory-document(en), ` +
        `${ctx.working.metadataKeys.length + ctx.memory.metadataKeys.length} metadata-key(s), ` +
        `${workingTags + memoryTags} tag(s), ${workingMentions + memoryMentions} mogelijke onverbonden mention(s).`;
      if (unlinked.totalCount > 0) {
        const examples = [...unlinked.working, ...unlinked.memory]
          .slice(0, 5)
          .map((item) => `- ${item.scope}: ${item.from} -> ${item.to} via "${item.mention}"`)
          .join("\n");
        const shouldApply = confirm(
          `Er zijn ${workingMentions} werkdocument-mention(s) en ${memoryMentions} memory-mention(s) gevonden.\n\n` +
            `${examples}${unlinked.totalCount > 5 ? "\n- …" : ""}\n\n` +
            "Wil je deze mentions nu automatisch verbinden met Markdown-links?",
        );
        if (!shouldApply) return;
        if (isDirty) {
          status.textContent = "Automatisch linken geannuleerd: sla eerst je open wijzigingen op.";
          return;
        }
        status.textContent = "Onverbonden mentions verbinden…";
        const result = await linkSecondBrainUnlinkedMentions("all");
        await loadLists(fileSelect.value || undefined);
        if (fileSelect.value && fileSelect.value !== EXTERNAL_MARKDOWN_VALUE) {
          await loadSelection();
        }
        if (memoryPanelVisible) await renderMemoryPanel();
        status.textContent =
          `Mentions verbonden: ${result.appliedCount} link(s) in ${result.filesChanged} bestand(en). ` +
          `${result.skippedCount ? `${result.skippedCount} overgeslagen.` : ""}`;
      }
    } catch (e) {
      status.textContent = `Second-brain context ophalen mislukt: ${String((e as Error).message)}`;
    } finally {
      setAgentChatRequestBusy(false);
    }
  }

  function lastAskAssistantReply(): string {
    for (let i = agentChatHistory.length - 1; i >= 0; i--) {
      const turn = agentChatHistory[i];
      if (turn?.role === "assistant" && turn.mode === "ask" && turn.content.trim()) {
        return turn.content.trim();
      }
    }
    return "";
  }

  function prepareLastAskReplyForAgent(): void {
    const reply = lastAskAssistantReply();
    if (!reply) {
      status.textContent = "Geen eerder Ask-antwoord gevonden om als Agent-instructie te gebruiken.";
      return;
    }
    agentChatMode = "agent";
    refreshAgentChatModeUi();
    const targetHint = fileSelect.value && fileSelect.value !== EXTERNAL_MARKDOWN_VALUE ? ` in \`${fileSelect.value}\`` : "";
    agentChatInput.value =
      `Gebruik het laatste Ask-resultaat hieronder als definitieve inhoud en verwerk dit reviewbaar${targetHint}.\n\n` +
      `Plaats of vervang alleen de relevante sectie. Maak exacte find/replace-patches en behoud de rest van het document.\n\n` +
      `Laatste Ask-resultaat:\n\n${reply}`;
    agentChatInput.focus();
    agentChatInput.setSelectionRange(agentChatInput.value.length, agentChatInput.value.length);
    status.textContent = "Laatste Ask-antwoord staat klaar als Agent-instructie.";
    syncAgentChatDisabled();
  }

  function agentMarkdownReferenceVariants(): Array<{ needle: string; path: string }> {
    const out: Array<{ needle: string; path: string }> = [];
    const seen = new Set<string>();
    const add = (needle: string, path: string) => {
      if (!needle || seen.has(needle.toLowerCase())) return;
      seen.add(needle.toLowerCase());
      out.push({ needle, path });
    };
    for (const p of corpusMarkdownPaths) {
      add(p, p);
      add(`Files/${p}`, p);
      const win = p.replace(/\//g, "\\");
      add(win, p);
      add(`Files\\${win}`, p);
    }
    return out.sort((a, b) => b.needle.length - a.needle.length);
  }

  function normalizeMarkdownReferenceCandidate(raw: string): string {
    let s = String(raw || "").trim();
    if (!s) return "";
    try {
      s = decodeURIComponent(s);
    } catch {
      /* Houd originele tekst als decodeURIComponent faalt. */
    }
    if (s.startsWith("<") && s.includes(">")) {
      s = s.slice(1, s.indexOf(">"));
    }
    return s
      .replace(/^['"`(<\[]+|['"`),.>\]]+$/g, "")
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .replace(/^Files\//i, "")
      .trim();
  }

  function withMarkdownExtension(candidate: string): string {
    return /\.(?:md|markdown)$/i.test(candidate) ? candidate.replace(/\.markdown$/i, ".md") : `${candidate}.md`;
  }

  function normalizeRelativeMarkdownPath(candidate: string): string {
    const parts: string[] = [];
    for (const part of candidate.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    return parts.join("/");
  }

  function relativeMarkdownCandidate(candidate: string, baseRelPath?: string): string {
    const normalized = candidate.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!baseRelPath || normalized.startsWith("/")) return normalizeRelativeMarkdownPath(normalized);
    const folder = folderOfMarkdownPath(baseRelPath);
    return normalizeRelativeMarkdownPath(folder ? `${folder}/${normalized}` : normalized);
  }

  function resolveAgentMarkdownReference(raw: string, baseRelPath?: string): string | null {
    let s = normalizeMarkdownReferenceCandidate(raw);
    if (!s || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(s)) return null;
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    const query = s.indexOf("?");
    if (query >= 0) s = s.slice(0, query);
    s = s.trim();
    const candidates = [s, withMarkdownExtension(s)];
    if (baseRelPath) {
      candidates.push(relativeMarkdownCandidate(s, baseRelPath), relativeMarkdownCandidate(withMarkdownExtension(s), baseRelPath));
    }
    for (const candidate of candidates) {
      const normalized = candidate.replace(/\.markdown$/i, ".md");
      const exact = corpusMarkdownPaths.find((p) => p.toLowerCase() === normalized.toLowerCase());
      if (exact) return exact;
    }
    const basenameMatches = corpusMarkdownPaths.filter((p) =>
      candidates.some((candidate) => baseNameMd(p).toLowerCase() === candidate.replace(/\.markdown$/i, ".md").toLowerCase()),
    );
    return basenameMatches.length === 1 ? basenameMatches[0] : null;
  }

  async function openMarkdownReferenceInViewer(path: string): Promise<void> {
    if (!corpusMarkdownPaths.includes(path)) {
      status.textContent = `Markdown-link niet gevonden in Files/: ${path}`;
      return;
    }
    if (fileSelect.value !== path) {
      fileSelect.value = path;
      selectedFolder = folderOfMarkdownPath(path);
      await loadSelection();
    }
    status.textContent = `Geopend via Markdown-link: ${path}`;
  }

  function attachLocalMarkdownLinkHandler(root: HTMLElement, opts: { editable?: boolean } = {}): void {
    root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      if (!opts.editable && target?.closest('[contenteditable="true"]')) return;
      const a = target?.closest<HTMLAnchorElement>("a[href]");
      if (!a || !root.contains(a)) return;
      const rawHref = a.getAttribute("href") || "";
      const currentPath = fileSelect.value && fileSelect.value !== EXTERNAL_MARKDOWN_VALUE ? fileSelect.value : undefined;
      const path = resolveAgentMarkdownReference(rawHref, currentPath) ?? resolveAgentMarkdownReference(a.textContent || "", currentPath);
      if (!path) return;

      if (opts.editable && !(e.ctrlKey || e.metaKey)) {
        a.title = "Ctrl/Cmd+klik om dit Markdown-document te openen.";
        status.textContent = "Gebruik Ctrl/Cmd+klik om lokale Markdown-links in de editor te openen.";
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      void openMarkdownReferenceInViewer(path);
    });
  }

  function linkifyAgentMarkdownReferences(root: HTMLElement): void {
    const refs = agentMarkdownReferenceVariants();
    if (!refs.length) return;
    root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const path = resolveAgentMarkdownReference(a.getAttribute("href") || "") ?? resolveAgentMarkdownReference(a.textContent || "");
      if (!path) return;
      a.classList.add("mv-agent-md-link");
      a.title = `Open ${path} in de viewer`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void openMarkdownReferenceInViewer(path);
      });
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("a, button, textarea, pre, script, style")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof Text && node.data.toLowerCase().includes(".md")) textNodes.push(node);
    }
    for (const node of textNodes) {
      const text = node.data;
      const lower = text.toLowerCase();
      let cursor = 0;
      const frag = document.createDocumentFragment();
      while (cursor < text.length) {
        let best: { idx: number; needle: string; path: string } | null = null;
        for (const ref of refs) {
          const idx = lower.indexOf(ref.needle.toLowerCase(), cursor);
          if (idx < 0) continue;
          if (!best || idx < best.idx || (idx === best.idx && ref.needle.length > best.needle.length)) {
            best = { idx, needle: ref.needle, path: ref.path };
          }
        }
        if (!best) {
          frag.append(document.createTextNode(text.slice(cursor)));
          break;
        }
        if (best.idx > cursor) frag.append(document.createTextNode(text.slice(cursor, best.idx)));
        const matched = text.slice(best.idx, best.idx + best.needle.length);
        const a = document.createElement("a");
        a.href = "#";
        a.className = "mv-agent-md-link";
        a.textContent = matched;
        a.title = `Open ${best.path} in de viewer`;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          void openMarkdownReferenceInViewer(best.path);
        });
        frag.append(a);
        cursor = best.idx + best.needle.length;
      }
      node.replaceWith(frag);
    }
  }

  function fillPlainAgentTextWithMarkdownLinks(body: HTMLElement, content: string): void {
    body.replaceChildren();
    const text = String(content || "");
    const lower = text.toLowerCase();
    const refs = agentMarkdownReferenceVariants();
    if (!refs.length || !lower.includes(".md")) {
      body.textContent = text;
      return;
    }
    let cursor = 0;
    while (cursor < text.length) {
      let best: { idx: number; needle: string; path: string } | null = null;
      for (const ref of refs) {
        const idx = lower.indexOf(ref.needle.toLowerCase(), cursor);
        if (idx < 0) continue;
        if (!best || idx < best.idx || (idx === best.idx && ref.needle.length > best.needle.length)) {
          best = { idx, needle: ref.needle, path: ref.path };
        }
      }
      if (!best) {
        body.append(document.createTextNode(text.slice(cursor)));
        break;
      }
      if (best.idx > cursor) body.append(document.createTextNode(text.slice(cursor, best.idx)));
      const matched = text.slice(best.idx, best.idx + best.needle.length);
      const a = document.createElement("a");
      a.href = "#";
      a.className = "mv-agent-md-link";
      a.textContent = matched;
      a.title = `Open ${best.path} in de viewer`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void openMarkdownReferenceInViewer(best.path);
      });
      body.append(a);
      cursor = best.idx + best.needle.length;
    }
  }

  function refreshAgentChatModeUi() {
    const isAgent = agentChatMode === "agent";
    agentModeAgentBtn.classList.toggle("mv-agent-chat-mode--active", isAgent);
    agentModeAskBtn.classList.toggle("mv-agent-chat-mode--active", !isAgent);
    agentModeAgentBtn.setAttribute("aria-pressed", isAgent ? "true" : "false");
    agentModeAskBtn.setAttribute("aria-pressed", isAgent ? "false" : "true");
    agentCorpusWideRow.hidden = isAgent || !commentSelectionHost.hidden;
    agentWebSearchRow.hidden = isAgent || !commentSelectionHost.hidden;
    if (!commentSelectionHost.hidden) {
      agentChatInput.placeholder =
        "Wat moet de agent met deze selectie doen? Verzend start de agent direct.";
      return;
    }
    agentChatInput.placeholder = isAgent
      ? "Opdracht of vraag. Optioneel: selecteer in de tekst voor extra context…"
      : agentCorpusWideCheckbox.checked && agentWebSearchCheckbox.checked
        ? "Vraag over Files en/of actuele internetinformatie…"
        : agentCorpusWideCheckbox.checked
        ? "Vraag over alle Markdown-bestanden in Files (corpus-index onder .mv-index)…"
        : agentWebSearchCheckbox.checked
          ? "Vraag met internetzoekfunctie via Tavily; het document is alleen context…"
        : "Vraag over het geopende document; er worden geen automatische wijzigingen gedaan…";
    rerenderAgentChatMessages();
  }

  function fillAgentChatMsgBody(body: HTMLElement, m: AgentChatTurn): void {
    body.replaceChildren();
    body.classList.remove("mv-agent-chat-msg-body--md", "mv-agent-chat-msg-body--plain");
    if (m.role === "user") {
      body.classList.add("mv-agent-chat-msg-body--plain");
      body.textContent = m.content;
      return;
    }
    if (agentReplyMarkdownCheckbox.checked) {
      body.classList.add("mv-agent-chat-msg-body--md");
      const inner = el("div", "mv-prose mv-agent-chat-md-prose");
      inner.innerHTML = renderMarkdown(m.content).html;
      linkifyAgentMarkdownReferences(inner);
      body.append(inner);
    } else {
      body.classList.add("mv-agent-chat-msg-body--plain");
      fillPlainAgentTextWithMarkdownLinks(body, m.content);
    }
  }

  function createAgentChatBubble(m: AgentChatTurn): HTMLElement {
    const wrap = el(
      "div",
      m.role === "user" ? "mv-agent-chat-msg mv-agent-chat-msg--user" : "mv-agent-chat-msg mv-agent-chat-msg--assistant",
    );
    const body = el("div", "mv-agent-chat-msg-body");
    fillAgentChatMsgBody(body, m);
    wrap.append(body);
    return wrap;
  }

  function memoryActionLabel(action: AgentMemoryAction): string {
    if (action.kind === "create") return `Nieuw bestand: ${action.path}`;
    if (action.kind === "update") return `Bijwerken: ${action.path}`;
    return `Verwijderadvies: ${action.path}`;
  }

  async function refreshAfterMemoryActions(actions: AgentMemoryAction[] | undefined, createdPaths: string[] = []) {
    const currentPath = fileSelect.value;
    const lastCreated = createdPaths[createdPaths.length - 1]?.trim();
    await loadLists(currentPath || undefined);
    if (memoryPanelVisible) await renderMemoryPanel();
    if (
      currentPath &&
      currentPath !== EXTERNAL_MARKDOWN_VALUE &&
      actions?.some((a) => a.kind === "update" && a.path === currentPath)
    ) {
      await loadDocumentData(currentPath, tplSelect.value);
      if (editRoot) await refreshEditSurfaceAfterDataLoad();
      syncToolbarDocTitle();
    }
  }

  async function applyPendingMemoryActions(): Promise<void> {
    const executable = pendingMemoryActions.filter((a) => a.kind !== "delete_suggestion");
    if (!executable.length) {
      pendingMemoryActions = [];
      rerenderAgentChatMessages();
      status.textContent = "Geheugensuggestie genegeerd.";
      return;
    }
    agentChatMode = "agent";
    refreshAgentChatModeUi();
    setAgentChatRequestBusy(true);
    try {
      const result = await applyAgentMemoryActions(executable);
      pendingMemoryActions = [];
      revertibleMemoryActions = result.executedMemoryActions.filter(
        (a) => (a.kind === "update" && typeof a.rollbackContent === "string") || (a.kind === "create" && a.rollbackCreated),
      );
      await refreshAfterMemoryActions(result.executedMemoryActions, result.corpusCreatedPaths);
      status.textContent = result.errors.length
        ? `Geheugen deels toegepast (${result.errors.length} fout(en)).`
        : `Wijziging doorgevoerd via tijdelijke Agent-modus: ${result.executedMemoryActions.length}.`;
    } catch (e) {
      status.textContent = `Geheugenactie toepassen mislukt: ${String((e as Error).message)}`;
    } finally {
      agentChatMode = "ask";
      refreshAgentChatModeUi();
      setAgentChatRequestBusy(false);
      rerenderAgentChatMessages();
    }
  }

  function rejectPendingMemoryActions(): void {
    pendingMemoryActions = [];
    status.textContent = "Geheugenactie niet toegepast.";
    rerenderAgentChatMessages();
  }

  async function rejectExecutedMemoryActions(): Promise<void> {
    const reversible = revertibleMemoryActions.filter(
      (a) => (a.kind === "update" && typeof a.rollbackContent === "string") || (a.kind === "create" && a.rollbackCreated),
    );
    if (!reversible.length) {
      revertibleMemoryActions = [];
      status.textContent = "Geen terugdraaibare geheugenactie gevonden.";
      rerenderAgentChatMessages();
      return;
    }
    if (!confirm("Niet akkoord: de zojuist doorgevoerde geheugenwijziging wordt teruggedraaid. Doorgaan?")) return;
    agentChatMode = "agent";
    refreshAgentChatModeUi();
    setAgentChatRequestBusy(true);
    try {
      const result = await revertAgentMemoryActions(reversible);
      revertibleMemoryActions = [];
      await refreshAfterMemoryActions(reversible, []);
      status.textContent = result.errors.length
        ? `Geheugen deels teruggedraaid (${result.errors.length} fout(en)).`
        : `Geheugenwijziging teruggedraaid: ${result.revertedMemoryActions.length}.`;
    } catch (e) {
      status.textContent = `Geheugenactie terugdraaien mislukt: ${String((e as Error).message)}`;
    } finally {
      agentChatMode = "ask";
      refreshAgentChatModeUi();
      setAgentChatRequestBusy(false);
      rerenderAgentChatMessages();
    }
  }

  function acceptExecutedMemoryActions(): void {
    revertibleMemoryActions = [];
    status.textContent = "Geheugenwijziging geaccepteerd.";
    rerenderAgentChatMessages();
  }

  function createPendingMemoryActionsBlock(): HTMLElement {
    const box = el("div", "mv-agent-memory-actions");
    const title = el("div", "mv-agent-memory-actions-title", "Geheugenactie voorgesteld");
    const hint = el(
      "div",
      "mv-agent-memory-actions-hint",
      "Ask mag niet zelf schrijven. Voor toepassen schakelt de app tijdelijk naar Agent-modus.",
    );
    const list = el("ul", "mv-agent-memory-actions-list");
    for (const action of pendingMemoryActions) {
      const item = el("li", "mv-agent-memory-actions-item");
      const label = el("strong", "", memoryActionLabel(action));
      const reason = action.reason ? el("span", "", ` — ${action.reason}`) : null;
      item.append(label);
      if (reason) item.append(reason);
      if (action.sources?.length) {
        item.append(el("span", "", ` Bronnen: ${action.sources.join(", ")}`));
      }
      if (action.kind === "create" && action.content) {
        const details = el("details", "mv-agent-memory-actions-preview");
        const summary = el("summary", "", "Voorgestelde inhoud bekijken");
        const pre = el("pre", "", action.content);
        details.append(summary, pre);
        item.append(details);
      } else if (action.kind === "update") {
        const details = el("details", "mv-agent-memory-actions-preview");
        const summary = el("summary", "", "Voorgestelde wijziging bekijken");
        if (action.find) {
          details.append(el("div", "mv-agent-memory-actions-preview-label", "Vervangt"));
          details.append(el("pre", "", action.find));
        }
        if (action.replace) {
          details.append(el("div", "mv-agent-memory-actions-preview-label", "Door"));
          details.append(el("pre", "", action.replace));
        }
        item.append(details);
      }
      list.append(item);
    }
    const row = el("div", "mv-agent-chat-msg-decision-row");
    const executable = pendingMemoryActions.some((a) => a.kind !== "delete_suggestion");
    const applyBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", executable ? "Voer wijziging door" : "Begrepen");
    applyBtn.type = "button";
    applyBtn.disabled = agentChatRequestBusy;
    const rejectBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Niet toepassen");
    rejectBtn.type = "button";
    rejectBtn.disabled = agentChatRequestBusy;
    applyBtn.addEventListener("click", () => void applyPendingMemoryActions());
    rejectBtn.addEventListener("click", () => rejectPendingMemoryActions());
    row.append(applyBtn, rejectBtn);
    box.append(title, hint, list, row);
    return box;
  }

  function createExecutedMemoryActionsBlock(): HTMLElement {
    const box = el("div", "mv-agent-memory-actions");
    const title = el("div", "mv-agent-memory-actions-title", "Geheugenwijziging doorgevoerd");
    const hint = el(
      "div",
      "mv-agent-memory-actions-hint",
      "Ask heeft de wijziging direct toegepast. Kies Niet akkoord om de wijziging terug te draaien.",
    );
    const list = el("ul", "mv-agent-memory-actions-list");
    for (const action of revertibleMemoryActions) {
      const item = el("li", "mv-agent-memory-actions-item");
      item.append(el("strong", "", memoryActionLabel(action)));
      if (action.reason) item.append(el("span", "", ` — ${action.reason}`));
      if (action.kind === "update") {
        const details = el("details", "mv-agent-memory-actions-preview");
        details.append(el("summary", "", "Doorgevoerde wijziging bekijken"));
        if (action.find) {
          details.append(el("div", "mv-agent-memory-actions-preview-label", "Vervangen"));
          details.append(el("pre", "", action.find));
        }
        if (action.replace) {
          details.append(el("div", "mv-agent-memory-actions-preview-label", "Door"));
          details.append(el("pre", "", action.replace));
        }
        item.append(details);
      } else if (action.kind === "create" && action.content) {
        const details = el("details", "mv-agent-memory-actions-preview");
        details.append(el("summary", "", "Aangemaakte inhoud bekijken"));
        details.append(el("pre", "", action.content));
        item.append(details);
      }
      list.append(item);
    }
    const row = el("div", "mv-agent-chat-msg-decision-row");
    const acceptBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Akkoord");
    acceptBtn.type = "button";
    acceptBtn.disabled = agentChatRequestBusy;
    const rejectBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Niet akkoord");
    rejectBtn.type = "button";
    rejectBtn.disabled = agentChatRequestBusy;
    acceptBtn.addEventListener("click", () => acceptExecutedMemoryActions());
    rejectBtn.addEventListener("click", () => void rejectExecutedMemoryActions());
    row.append(acceptBtn, rejectBtn);
    box.append(title, hint, list, row);
    return box;
  }

  function rerenderAgentChatMessages() {
    agentChatMessages.replaceChildren();
    const pending = agentChatMode === "agent" && reviewComments.some(lastReplyIsFromAgent) && isEditing;
    let lastAssistantIdx = -1;
    for (let i = agentChatHistory.length - 1; i >= 0; i--) {
      if (agentChatHistory[i].role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    const decisionDisabled = agentChatRequestBusy;
    for (let i = 0; i < agentChatHistory.length; i++) {
      const m = agentChatHistory[i];
      const wrap = createAgentChatBubble(m);
      const showDecision = pending && m.role === "assistant" && i === lastAssistantIdx;
      if (showDecision) {
        const decision = el("div", "mv-agent-chat-msg-decision");
        const row = el("div", "mv-agent-chat-msg-decision-row");
        const approveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Akkoord");
        approveBtn.type = "button";
        approveBtn.title = "Bevestig de agentwijziging(en); diff-markering verdwijnt.";
        const rejectBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Niet akkoord");
        rejectBtn.type = "button";
        rejectBtn.title = "Zet het document terug naar vóór deze agentwijziging(en).";
        const pendingN = reviewComments.filter(lastReplyIsFromAgent).length;
        const hint = el(
          "span",
          "mv-agent-chat-msg-decision-hint",
          pendingN === 1
            ? "Bevestig of draai deze agentwijziging terug."
            : `Bevestig of draai ${pendingN} agentwijzigingen terug.`,
        );
        approveBtn.disabled = decisionDisabled;
        rejectBtn.disabled = decisionDisabled;
        approveBtn.addEventListener("click", () => void acceptAllPendingAgentReviews());
        rejectBtn.addEventListener("click", () => void rejectAllPendingAgentReviews());
        row.append(approveBtn, rejectBtn);
        decision.append(hint, row);
        wrap.append(decision);
      }
      agentChatMessages.append(wrap);
    }
    if (pending && lastAssistantIdx < 0) {
      const stub = el("div", "mv-agent-chat-msg mv-agent-chat-msg--assistant mv-agent-chat-msg--decision-only");
      const body = el("div", "mv-agent-chat-msg-body mv-agent-chat-msg-body--plain");
      body.textContent = "Openstaande agentwijziging — bevestig of draai terug.";
      const decision = el("div", "mv-agent-chat-msg-decision");
      const row = el("div", "mv-agent-chat-msg-decision-row");
      const approveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Akkoord");
      approveBtn.type = "button";
      const rejectBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Niet akkoord");
      rejectBtn.type = "button";
      approveBtn.disabled = decisionDisabled;
      rejectBtn.disabled = decisionDisabled;
      approveBtn.addEventListener("click", () => void acceptAllPendingAgentReviews());
      rejectBtn.addEventListener("click", () => void rejectAllPendingAgentReviews());
      row.append(approveBtn, rejectBtn);
      decision.append(row);
      stub.append(body, decision);
      agentChatMessages.append(stub);
    }
    requestAnimationFrame(() => {
      agentSidebarScroll.scrollTop = agentSidebarScroll.scrollHeight;
      requestAnimationFrame(() => {
        agentSidebarScroll.scrollTop = agentSidebarScroll.scrollHeight;
      });
    });
    if (agentReplyMarkdownCheckbox.checked) {
      void Promise.all([runMermaidInRoot(agentChatMessages), runChartJsInRoot(agentChatMessages)]);
    }
  }

  function applyReviewPack(
    pack: { comments: ReviewComment[]; agentChatUiHistory: AgentChatTurn[] },
    reason: "document-load" | "agent-run" = "document-load",
  ) {
    reviewComments = pack.comments;
    if (shouldMergeDocumentChatIntoSession(reason) && pack.agentChatUiHistory.length) {
      const existing = new Set(agentChatHistory.map((t) => `${t.role}\0${t.mode || ""}\0${t.content}`));
      for (const turn of pack.agentChatUiHistory) {
        const sig = `${turn.role}\0${turn.mode || ""}\0${turn.content}`;
        if (existing.has(sig)) continue;
        agentChatHistory.push(turn);
        existing.add(sig);
      }
    }
    rerenderAgentChatMessages();
  }

  function clearAgentChat() {
    stopAgentChatSpeech();
    agentChatHistory = [];
    pendingMemoryActions = [];
    revertibleMemoryActions = [];
    hideAgentChatLlmDebug();
    clearAgentChatActivityStrip();
    rerenderAgentChatMessages();
    void persistActiveAgentChatSession({ active: true });
    reviewDraftRange = null;
    commentSelectionHost.hidden = true;
    refreshAgentChatModeUi();
  }

  function getAgentChatDocumentName(): string | null {
    const v = fileSelect.value.trim();
    if (!v) return null;
    if (v === EXTERNAL_MARKDOWN_VALUE) return getOrCreateExternalAgentVirtualName();
    return v;
  }

  async function applyViewerActions(actions: ViewerAgentAction[] | undefined): Promise<void> {
    if (!actions?.length) return;
    for (const action of actions) {
      if (action.type === "open") {
        if (!corpusMarkdownPaths.includes(action.path)) continue;
        fileSelect.value = action.path;
        selectedFolder = folderOfMarkdownPath(action.path);
        await loadSelection();
      } else if (action.type === "highlight") {
        if (!corpusMarkdownPaths.includes(action.path)) continue;
        if (fileSelect.value !== action.path) {
          fileSelect.value = action.path;
          selectedFolder = folderOfMarkdownPath(action.path);
          await loadSelection();
        }
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const ok = highlightSnippetInProseHost(proseHost, action.snippet);
        if (!ok) {
          status.textContent =
            (status.textContent ? `${status.textContent} ` : "") +
            `(Snippet niet gevonden in ${action.path})`;
        }
      }
    }
  }

  async function submitAgentChat() {
    stopAgentChatSpeech();
    const text = agentChatInput.value.trim();
    if (!text) return;
    if (agentChatRequestBusy || sidebarReviewBusy) return;

    if (reviewDraftRange && editRoot && isEditing) {
      if (!editRoot.contains(reviewDraftRange.commonAncestorContainer)) {
        reviewDraftRange = null;
        commentSelectionHost.hidden = true;
        refreshAgentChatModeUi();
        status.textContent = "Selectie niet meer geldig. Maak opnieuw een selectie.";
        return;
      }
      const anchor = anchorFromSelection(editRoot, reviewDraftRange);
      if (!anchor) return;

      const docNameEarly = getAgentChatDocumentName();
      if (!docNameEarly) {
        status.textContent = "Selecteer of open eerst een document.";
        return;
      }
      const nameEarly = fileSelect.value;
      const isExternalEarly = nameEarly === EXTERNAL_MARKDOWN_VALUE;
      if (!isExternalEarly) await flushAutoSave();

      try {
        const cfgEarly = await fetchAgentConfig();
        if (!cfgEarly.endpoint || !cfgEarly.model || !cfgEarly.hasApiKey) {
          status.textContent = "Agentconfig ontbreekt. Vul endpoint, model en API key in.";
          await showSettingsDialog();
          return;
        }
      } catch (e) {
        status.textContent = `Agentconfig lezen mislukt: ${String((e as Error).message)}`;
        return;
      }

      if (reviewComments.some(lastReplyIsFromAgent)) {
        status.textContent =
          "Keur eerst openstaande agentwijzigingen goed of af voordat je een nieuw commentaar laat verwerken.";
        return;
      }

      const c = newReviewComment(anchor.quote, anchor.prefix, anchor.suffix, text, "");
      reviewComments.push(c);
      if (!wrapRangeWithHighlight(editRoot, reviewDraftRange, c.id)) {
        reviewComments.pop();
        status.textContent = "Kon markering niet plaatsen — probeer eenvoudigere selectie.";
        return;
      }

      agentChatInput.value = "";
      reviewDraftRange = null;
      commentSelectionHost.hidden = true;
      refreshAgentChatModeUi();
      isDirty = true;

      const savedOk = await persistReviewCommentsToServer();
      if (!savedOk) {
        unwrapHighlightById(editRoot, c.id);
        reviewComments = reviewComments.filter((x) => x.id !== c.id);
        refreshAgentPendingDecisionUi();
        refreshRibbonState();
        return;
      }

      refreshAgentPendingDecisionUi();
      editRoot.dispatchEvent(new Event("input", { bubbles: true }));
      refreshRibbonState();
      await runAgentForCurrentDocument();
      return;
    }

    const mode = agentChatMode;
    const docName = getAgentChatDocumentName();
    const isExternal = fileSelect.value === EXTERNAL_MARKDOWN_VALUE;

    if (mode === "agent") {
      if (!docName) {
        status.textContent = "Selecteer of open eerst een document voor agent-modus.";
        return;
      }
      if (!isExternal) await flushAutoSave();
    }

    try {
      const cfg = await fetchAgentConfig();
      if (!cfg.endpoint || !cfg.model || !cfg.hasApiKey) {
        status.textContent = "Agentconfig ontbreekt. Vul endpoint, model en API key in.";
        await showSettingsDialog();
        return;
      }
    } catch (e) {
      status.textContent = `Agentconfig lezen mislukt: ${String((e as Error).message)}`;
      return;
    }

    if (!activeAgentChatId) {
      await createNewAgentChat();
      if (!activeAgentChatId) return;
    }

    agentChatInput.value = "";
    agentChatHistory = trimAgentChatHistoryForUi(agentChatHistory);
    agentChatHistory.push({ role: "user", content: text, mode });
    const submittedHistory = agentChatHistory.slice();
    rerenderAgentChatMessages();

    setAgentChatRequestBusy(true);
    let assistantText = "";
    try {
      const md = getMarkdownForExport();
      const prior = submittedHistory.slice(0, -1);
      let selectionArg: { quote: string; prefix: string; suffix: string } | undefined;
      if (mode === "agent" && editRoot) {
        const sel = window.getSelection();
        if (
          sel?.rangeCount &&
          !sel.isCollapsed &&
          sel.anchorNode &&
          editRoot.contains(sel.anchorNode) &&
          editRoot.contains(sel.focusNode)
        ) {
          const r = sel.getRangeAt(0);
          if (editRoot.contains(r.commonAncestorContainer)) {
            const anch = anchorFromSelection(editRoot, r);
            if (anch?.quote.trim()) selectionArg = anch;
          }
        }
      }
      const askCorpus = mode === "ask" && agentCorpusWideCheckbox.checked;
      const askWebSearch = mode === "ask" && agentWebSearchCheckbox.checked;
      const askTools = askCorpus || askWebSearch;
      const activeSessionForActivity = activeAgentChatSession();
      if (askTools) clearAgentChatActivityStrip();
      const res = await agentChat(
        {
          mode,
          message: text,
          markdown: md,
          chatId: activeAgentChatId,
          chatTitle: activeSessionForActivity?.title || "",
          name: docName ?? "",
          history: prior.slice(-MAX_AGENT_CHAT_HISTORY),
          debugLlm: readAgentDebugLlm(),
          replyMarkdown: agentReplyMarkdownCheckbox.checked,
          ...(selectionArg ? { selection: selectionArg } : {}),
          ...(askTools
            ? {
                ...(askCorpus ? { corpusWide: true } : {}),
                ...(askWebSearch ? { webSearch: true } : {}),
                activityStream: true,
              }
            : {}),
        },
        askTools ? { onCorpusActivity: (ev) => pushCorpusActivityRow(ev) } : undefined,
      );
      if (askTools && Array.isArray(res.activities) && res.activities.length) {
        for (const row of res.activities) {
          if (row && row.type === "activity") pushCorpusActivityRow(row);
        }
      }
      if (askTools && res.performanceMetrics) {
        pushPerformanceMetricsRow(res.performanceMetrics);
      }
      assistantText = res.reply;
      pendingMemoryActions = [];
      revertibleMemoryActions = [];
      if (res.executedMemoryActions?.length || res.corpusCreatedPaths?.length) {
        await refreshAfterMemoryActions(res.executedMemoryActions || [], res.corpusCreatedPaths || []);
      }
      if (readAgentDebugLlm() && res.debugLlm) {
        showAgentChatLlmDebug(res.debugLlm as Record<string, unknown>);
      } else {
        hideAgentChatLlmDebug();
      }
      if (mode === "agent" && res.changed && typeof res.markdown === "string") {
        const name = fileSelect.value;
        currentMd = res.markdown;
        if (docName) {
          try {
            applyReviewPack(await fetchReviewComments(docName), "agent-run");
          } catch {
            /* ongewijzigd laten */
          }
        }
        let agentExternalDiskWriteFailed = false;
        if (isExternal) {
          try {
            await writeExternalMarkdown(res.markdown);
            await loadDocumentData(EXTERNAL_MARKDOWN_VALUE, tplSelect.value);
          } catch (e) {
            agentExternalDiskWriteFailed = true;
            await syncExternalReviewsAndTemplate(tplSelect.value);
            status.textContent = `Chat-agent: inhoud in de viewer is bijgewerkt; opslaan naar ${externalDocumentSourceLabel()} mislukt (${String((e as Error).message)}). Controleer rood/groen en keur akkoord of niet akkoord; probeer daarna Ctrl+S.`;
          }
        } else if (res.wroteFile) {
          await loadDocumentData(name, tplSelect.value);
        }
        if (editRoot) {
          await refreshEditSurfaceAfterDataLoad();
        }
        syncToolbarDocTitle();
        refreshAgentPendingDecisionUi();
        if (agentExternalDiskWriteFailed) {
          isDirty = true;
        } else if (isExternal || res.wroteFile) {
          isDirty = false;
          status.textContent =
            "Chat-agent: wijziging staat klaar. Controleer rood/groen in de tekst; keur goed onder het agentantwoord.";
        } else {
          await forcePersistEditor();
          isDirty = false;
          status.textContent =
            "Chat-agent: wijziging staat klaar en is opgeslagen. Keur goed onder het agentantwoord.";
        }
      } else if (mode === "ask") {
        if (res.executedMemoryActions?.length) {
          await refreshAfterMemoryActions(res.executedMemoryActions, res.corpusCreatedPaths || []);
        }
        status.textContent = askTools
          ? askCorpus && askWebSearch
            ? "Ask (corpus + internet): antwoord ontvangen."
            : askCorpus
              ? "Ask (corpus): antwoord ontvangen."
              : "Ask (internet): antwoord ontvangen."
          : "Ask: antwoord ontvangen.";
        if (askCorpus && res.viewerActions?.length) {
          await applyViewerActions(res.viewerActions);
        }
      } else {
        status.textContent = "Agent: geen bestandswijziging (of alleen antwoord).";
      }
    } catch (e) {
      const err = e as Error & { partialReply?: string; debugLlm?: Record<string, unknown> };
      if (readAgentDebugLlm() && err.debugLlm && typeof err.debugLlm === "object") {
        showAgentChatLlmDebug(err.debugLlm);
      }
      if (err.partialReply) {
        assistantText = `${err.partialReply}\n\n— ${err.message}`;
      } else {
        assistantText = `Fout: ${err.message}`;
      }
      status.textContent = "Agent-chat mislukt — zie het paneel.";
    } finally {
      const nextHistory = submittedHistory.slice();
      nextHistory.push({ role: "assistant", content: assistantText, mode });
      agentChatHistory = normalizeAgentChatHistoryForUi(nextHistory);
      await persistActiveAgentChatSession({ active: true });
      setAgentChatRequestBusy(false);
      rerenderAgentChatMessages();
    }
  }

  agentModeAgentBtn.addEventListener("click", () => {
    agentChatMode = "agent";
    refreshAgentChatModeUi();
  });
  agentModeAskBtn.addEventListener("click", () => {
    agentChatMode = "ask";
    refreshAgentChatModeUi();
  });
  agentCorpusWideCheckbox.addEventListener("change", () => refreshAgentChatModeUi());
  agentWebSearchCheckbox.addEventListener("change", () => refreshAgentChatModeUi());
  agentChatSessionSelect.addEventListener("change", () => void switchAgentChatSession(agentChatSessionSelect.value));
  agentChatNewBtn.addEventListener("click", () => void createNewAgentChat());
  agentChatRenameBtn.addEventListener("click", () => void renameActiveAgentChat());
  agentChatDeleteBtn.addEventListener("click", () => void deleteActiveAgentChat());
  agentChatPromoteBtn.addEventListener("click", () => void promoteActiveChatToMemory());
  agentChatPromoteStaleBtn.addEventListener("click", () => void promoteStaleChatsToMemory());
  agentMemoryToggleBtn.addEventListener("click", () => {
    memoryPanelVisible = !memoryPanelVisible;
    void renderMemoryPanel();
  });
  agentCorpusRefreshBtn.addEventListener("click", () => void refreshCorpusInformation());
  agentSecondBrainBtn.addEventListener("click", () => void showSecondBrainContextSummary());
  agentAskToAgentBtn.addEventListener("click", () => prepareLastAskReplyForAgent());
  promptMacroBtn.addEventListener("click", () => void showPromptMacroDialog());
  meetingReportBtn.addEventListener("click", () => showMeetingReportDialog());
  agentChatClearBtn.addEventListener("click", () => clearAgentChat());
  agentChatSendBtn.addEventListener("click", () => void submitAgentChat());
  promptMacroSelect.addEventListener("change", () => fillPromptMacroForm(selectedPromptMacro()));
  promptMacroNewBtn.addEventListener("click", () => {
    promptMacroSelect.value = "";
    fillPromptMacroForm(null);
    promptMacroName.focus();
  });
  promptMacroDeleteBtn.addEventListener("click", () => void deleteSelectedPromptMacro());
  promptMacroSaveBtn.addEventListener("click", () => void savePromptMacroFromForm());
  promptMacroRunBtn.addEventListener("click", () => void runSelectedPromptMacro());
  promptMacroCloseBtn.addEventListener("click", () => hidePromptMacroDialog());
  promptMacroDialog.addEventListener("mousedown", (e) => {
    if (e.target === promptMacroDialog) hidePromptMacroDialog();
  });
  meetingReportCancelBtn.addEventListener("click", () => hideMeetingReportDialog());
  meetingReportSubmitBtn.addEventListener("click", () => void submitMeetingReportTranscript());
  meetingReportTranscript.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submitMeetingReportTranscript();
    }
  });
  agentChatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitAgentChat();
    }
  });
  refreshAgentChatModeUi();
  syncAgentChatDisabled();
  void loadAgentChatSessions();

  function setReviewAgentBusy(busy: boolean) {
    sidebarReviewBusy = busy;
    if (editRoot) {
      const editable = !busy && editorSurfaceMode === "visual";
      editRoot.setAttribute("contenteditable", editable ? "true" : "false");
      if (busy) {
        editRoot.setAttribute("aria-busy", "true");
      } else {
        editRoot.removeAttribute("aria-busy");
      }
    }
    if (busy) {
      agentChatPanel.setAttribute("aria-busy", "true");
    } else {
      agentChatPanel.removeAttribute("aria-busy");
    }
    syncAgentSidebarBusyUi();
    syncAgentChatDisabled();
  }

  async function buildEditingSurfaceHtml(name: string): Promise<{ html: string; showChangeMarkers: boolean }> {
    const reviewTargetName =
      name === EXTERNAL_MARKDOWN_VALUE ? getOrCreateExternalAgentVirtualName() : name;
    const hasPendingAgentReview = reviewComments.some(lastReplyIsFromAgent);
    let html = renderMarkdown(currentMd).html;
    let showChangeMarkers = false;
    if (hasPendingAgentReview) {
      try {
        const backupMd = await fetchMarkdownBackupFile(reviewTargetName);
        if (backupMd && backupMd !== currentMd) {
          html = buildChangeMarkedHtml(backupMd, currentMd);
          showChangeMarkers = true;
        }
      } catch (e) {
        status.textContent = `Vorige versie voor diff niet gelezen: ${String((e as Error).message)}`;
      }
    }
    return { html, showChangeMarkers };
  }

  async function rebuildVisualEditorFromCurrentMd(): Promise<void> {
    if (!editRoot) return;
    const { html, showChangeMarkers } = await buildEditingSurfaceHtml(fileSelect.value);
    mountEditSheetPages(editRoot, html);
    hideReviewPopover();
    if (showChangeMarkers) {
      editRoot.classList.add("mv-prose--change-review");
    } else {
      editRoot.classList.remove("mv-prose--change-review");
      applyReviewHighlights(editRoot, reviewComments);
    }
    syncEditorTocFromCurrentMd(editRoot);
  }

  async function switchEditorToCodeMode(): Promise<void> {
    if (!editRoot || !editorCodeTextarea || !editorVisualWrap || !editorCodeWrap) return;
    hideReviewPopover();
    currentMd = getMarkdownForExport();
    editorCodeTextarea.value = currentMd;
    editorSurfaceMode = "code";
    editorVisualWrap.hidden = true;
    editorCodeWrap.hidden = false;
    setReviewAgentBusy(sidebarReviewBusy);
    editorCodeTextarea.focus();
    refreshEditorSourceToggleUi();
    refreshRibbonState();
    refreshAgentPendingDecisionUi();
  }

  async function switchEditorToVisualMode(): Promise<void> {
    if (!editRoot || !editorCodeTextarea || !editorVisualWrap || !editorCodeWrap) return;
    currentMd = editorCodeTextarea.value;
    await rebuildVisualEditorFromCurrentMd();
    editorSurfaceMode = "visual";
    editorVisualWrap.hidden = false;
    editorCodeWrap.hidden = true;
    setReviewAgentBusy(sidebarReviewBusy);
    editRoot.focus();
    refreshEditorSourceToggleUi();
    refreshRibbonState();
    refreshAgentPendingDecisionUi();
  }

  async function toggleEditorSurfaceMode(): Promise<void> {
    if (externalDocumentKind === "confluence") {
      status.textContent = "Markdown-bronmodus is uitgeschakeld voor Confluence-pagina's met vergrendelde macro's.";
      refreshEditorSourceToggleUi();
      return;
    }
    if (editorSurfaceMode === "visual") await switchEditorToCodeMode();
    else await switchEditorToVisualMode();
  }

  async function refreshEditSurfaceAfterDataLoad() {
    const name = fileSelect.value;
    if (!name || !editRoot || !isEditing) return;
    const { html, showChangeMarkers } = await buildEditingSurfaceHtml(name);
    if (editorSurfaceMode === "code" && editorCodeTextarea) {
      editorCodeTextarea.value = currentMd;
      hideReviewPopover();
      const { toc } = renderMarkdown(currentMd);
      mountEditorTocFromEntries(toc);
    } else {
      mountEditSheetPages(editRoot, html);
      hideReviewPopover();
      if (showChangeMarkers) {
        editRoot.classList.add("mv-prose--change-review");
        status.textContent = "Wijzigingen zichtbaar: rood = oude tekst, groen = nieuwe tekst.";
      } else {
        editRoot.classList.remove("mv-prose--change-review");
        applyReviewHighlights(editRoot, reviewComments);
      }
      syncEditorTocFromCurrentMd(editRoot);
    }
    isDirty = false;
    refreshAgentPendingDecisionUi();
    refreshRibbonState();
    refreshTemplateVars();
  }

  function mountEditorTocFromEntries(toc: TocEntry[]): void {
    tocHost.replaceChildren();
    const merged = mergeTemplate(defaultTemplate, currentMerged);
    const tocCfg = merged.toc || {};
    if (!tocCfg.enabled || toc.length === 0) {
      tocHost.hidden = true;
      return;
    }
    tocHost.hidden = false;
    const screen = merged.screen || {};
    const useVisualSheets = screen.visualPageBreaks !== false;
    const tocPage = el(
      "article",
      useVisualSheets ? "mv-page mv-page--sheet mv-page--toc" : "mv-page mv-page--toc",
    );
    const wrap = el("nav", "mv-toc-wrap");
    wrap.setAttribute("aria-label", tocCfg.heading || "Inhoudsopgave");
    const title = el("h2", "mv-toc-title", tocCfg.heading || "Inhoudsopgave");
    wrap.append(title);
    const ul = document.createElement("ul");
    ul.className = "mv-toc";
    for (const e of toc) {
      const li = document.createElement("li");
      li.className = `depth-${e.depth}`;
      const a = document.createElement("a");
      a.className = "mv-toc-link";
      a.href = `#${e.id}`;
      a.textContent = tocDisplayLabel(e.text);
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const h = editRoot?.querySelector(`#${CSS.escape(e.id)}`);
        h?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.append(a);
      ul.append(li);
    }
    wrap.append(ul);
    tocPage.append(wrap);
    tocHost.append(tocPage);
  }

  function applyHeadingIdsFromToc(editSurface: HTMLElement, toc: TocEntry[]): void {
    const domH = editSurface.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const n = Math.min(domH.length, toc.length);
    for (let i = 0; i < n; i++) {
      domH[i].id = toc[i].id;
    }
  }

  function scheduleEditorTocSync(): void {
    if (!editRoot || !isEditing) return;
    if (editorTocDebounceTimer) clearTimeout(editorTocDebounceTimer);
    editorTocDebounceTimer = setTimeout(() => {
      editorTocDebounceTimer = null;
      try {
        const md = getMarkdownForExport();
        const { toc } = renderMarkdown(md);
        if (editorSurfaceMode === "code") {
          mountEditorTocFromEntries(toc);
          return;
        }
        applyHeadingIdsFromToc(editRoot!, toc);
        mountEditorTocFromEntries(toc);
      } catch {
        /* rond turndown / tijdelijke DOM */
      }
    }, 320);
  }

  function syncEditorTocFromCurrentMd(editSurface: HTMLElement): void {
    const { toc } = renderMarkdown(currentMd);
    applyHeadingIdsFromToc(editSurface, toc);
    mountEditorTocFromEntries(toc);
  }

  async function mountEditorSurface() {
    const name = fileSelect.value;
    if (!name) return;

    clearAutoSaveDebounce();
    isEditing = true;
    isDirty = false;
    ribbon.hidden = false;

    fileSelect.disabled = false;
    tplSelect.disabled = !templatesAvailable;
    printBtn.disabled = false;

    if (editorTocDebounceTimer) {
      clearTimeout(editorTocDebounceTimer);
      editorTocDebounceTimer = null;
    }

    coverSection.hidden = true;
    coverSection.innerHTML = "";
    tocHost.replaceChildren();
    endSection.hidden = true;
    endSection.innerHTML = "";

    const { html, showChangeMarkers } = await buildEditingSurfaceHtml(name);
    proseHost.replaceChildren();
    editorSurfaceMode = "visual";

    const modeHost = el("div", "mv-editor-mode-host");
    editorVisualWrap = el("div", "mv-editor-visual-wrap");
    editorCodeWrap = el("div", "mv-editor-code-wrap");

    const host = el("div", "mv-edit-sheet-stack mv-prose mv-prose--editable");
    host.contentEditable = "true";
    host.setAttribute("spellcheck", "true");
    host.setAttribute("role", "textbox");
    host.setAttribute("aria-label", "Documenttekst");
    host.setAttribute("aria-multiline", "true");
    mountEditSheetPages(host, html);
    if (showChangeMarkers) {
      host.classList.add("mv-prose--change-review");
      status.textContent = "Wijzigingen zichtbaar: rood = oude tekst, groen = nieuwe tekst.";
    } else {
      applyReviewHighlights(host, reviewComments);
    }
    editorVisualWrap.append(host);

    const codeTa = document.createElement("textarea");
    codeTa.className = "mv-editor-code-textarea";
    codeTa.setAttribute("spellcheck", "false");
    codeTa.setAttribute("aria-label", "Ruwe markdown");
    codeTa.value = currentMd;
    editorCodeTextarea = codeTa;
    editorCodeWrap.hidden = true;
    editorCodeWrap.append(codeTa);

    modeHost.append(editorVisualWrap, editorCodeWrap);

    syncEditorTocFromCurrentMd(host);
    refreshAgentPendingDecisionUi();

    const onInput = () => {
      scheduleAutoSave();
      scheduleEditorTocSync();
    };
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        document.execCommand("bold");
        refreshRibbonState();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        document.execCommand("italic");
        refreshRibbonState();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void forcePersistEditor();
      } else if (e.key === "Tab" && !e.altKey) {
        if (caretInListItem()) {
          e.preventDefault();
          if (e.shiftKey) {
            document.execCommand("outdent");
          } else {
            document.execCommand("indent");
          }
          refreshRibbonState();
        } else {
          const tcell = getActiveTableCell(host);
          if (tcell && focusAdjacentTableCell(tcell, e.shiftKey ? -1 : 1)) {
            e.preventDefault();
            refreshRibbonState();
          }
        }
      }
    };

    const onCodeKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void forcePersistEditor();
      }
    };

    host.addEventListener("input", onInput);
    host.addEventListener("keydown", onKeydown);
    codeTa.addEventListener("input", onInput);
    codeTa.addEventListener("keydown", onCodeKeydown);
    attachLocalMarkdownLinkHandler(host, { editable: true });
    host.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest(`.${REVIEW_HIGHLIGHT_CLASS}`);
      if (!t || !host.contains(t)) return;
      e.stopPropagation();
      showReviewPopover(t as HTMLElement);
    });

    proseHost.append(modeHost);
    editRoot = host;
    editorBoundDoc = fileSelect.value;

    stack.classList.add("mv-stack--editing");
    refreshTemplateVars();
    refreshEditorSourceToggleUi();
    refreshRibbonState();
    host.focus();
  }

  window.addEventListener("beforeunload", (e) => {
    if ((isEditing && isDirty) || autoSaveDebounceTimer !== null) {
      e.preventDefault();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushAutoSave();
  });

  type FileTreeDirNode = {
    segment: string;
    fullPath: string;
    subdirs: Map<string, FileTreeDirNode>;
    files: string[];
  };

  function makeFileTreeDir(segment: string, fullPath: string): FileTreeDirNode {
    return { segment, fullPath, subdirs: new Map(), files: [] };
  }

  function insertMarkdownPathIntoTree(root: FileTreeDirNode, path: string): void {
    const parts = path.split("/").filter((s) => s.length > 0);
    if (parts.length === 0) return;
    let node = root;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      acc = acc ? `${acc}/${seg}` : seg;
      if (!node.subdirs.has(seg)) {
        node.subdirs.set(seg, makeFileTreeDir(seg, acc));
      }
      node = node.subdirs.get(seg)!;
    }
    node.files.push(path);
  }

  /** Zorgt dat een map-pad (bv. uit readDirFolders) in de boom staat, ook zonder bestanden. */
  function insertFolderPathIntoTree(root: FileTreeDirNode, folderRelPath: string): void {
    const parts = folderRelPath.split("/").filter((s) => s.length > 0);
    if (parts.length === 0) return;
    let node = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      acc = acc ? `${acc}/${seg}` : seg;
      if (!node.subdirs.has(seg)) {
        node.subdirs.set(seg, makeFileTreeDir(seg, acc));
      }
      node = node.subdirs.get(seg)!;
    }
  }

  function sortFileTreeDir(node: FileTreeDirNode): void {
    node.files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const orderedKeys = [...node.subdirs.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    const next = new Map<string, FileTreeDirNode>();
    for (const k of orderedKeys) {
      const d = node.subdirs.get(k)!;
      sortFileTreeDir(d);
      next.set(k, d);
    }
    node.subdirs = next;
  }

  function collectPathsMatchingTreeFilter(paths: string[], q: string): string[] {
    if (!q) return paths.slice();
    const out: string[] = [];
    for (const p of paths) {
      const base = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
      if (p.toLowerCase().includes(q) || base.toLowerCase().includes(q)) out.push(p);
    }
    return out;
  }

  /** Filter op boompaden van mappen (en descendants van gefilterde bestanden). */
  function folderMatchesTreeFilter(folderPath: string, q: string, filteredFiles: string[]): boolean {
    if (!q) return true;
    const ql = q.toLowerCase();
    const fp = folderPath.toLowerCase();
    if (fp.includes(ql)) return true;
    const base = folderPath.includes("/") ? folderPath.slice(folderPath.lastIndexOf("/") + 1) : folderPath;
    if (base.toLowerCase().includes(ql)) return true;
    const pref = `${folderPath}/`;
    return filteredFiles.some((p) => p.startsWith(pref));
  }

  function expandFileTreeAncestors(mdPath: string): void {
    if (!mdPath.includes("/")) return;
    const parts = mdPath.split("/").filter(Boolean);
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      fileTreeExpandedPaths.add(acc);
    }
  }

  /** Nieuw leeg .md direct onder `folderFullPath` (forward slashes); daarna openen via loadLists. */
  async function createEmptyMarkdownInFolder(folderFullPath: string): Promise<void> {
    const where =
      folderFullPath.trim().replace(/\\/g, "/") ||
      "(hoofdmap — gebruik alleen een bestandsnaam)";
    const raw = window.prompt(
      `Bestandsnaam voor een nieuw leeg Markdown-bestand in "${where}". Er wordt automatisch .md toegevoegd als dat ontbreekt:`,
      "nieuw.md",
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const joined = joinMarkdownPath(folderFullPath, trimmed);
    const normalized = normalizeMarkdownFileName(joined);
    if (!normalized) {
      status.textContent = "Ongeldige bestandsnaam. Gebruik bijvoorbeeld nieuw-document.md.";
      return;
    }
    if (folderOfMarkdownPath(normalized) !== folderFullPath) {
      status.textContent =
        "Geef alleen een bestandsnaam voor deze map (geen pad met extra submappen). Maak submappen eerst elders.";
      return;
    }
    if (!(await confirmLeaveEditModeForImport())) return;
    if (markdownFileNames().includes(normalized)) {
      status.textContent = `${normalized} bestaat al.`;
      return;
    }
    try {
      clearExternalMarkdownSession();
      await saveMarkdownFile(normalized, "");
      selectedFolder = folderFullPath;
      status.textContent = `${normalized} aangemaakt en geopend.`;
      await loadLists(normalized);
    } catch (e) {
      status.textContent = `Aanmaken mislukt: ${String((e as Error).message)}`;
    }
  }

  /** Nieuwe lege map onder `parentFolderFullPath` (forward slashes); één niveau per keer. */
  async function createMarkdownSubfolder(parentFolderFullPath: string): Promise<void> {
    const where =
      parentFolderFullPath.trim().replace(/\\/g, "/") ||
      "hoofdmap";
    const raw = window.prompt(
      `Naam voor een nieuwe map in "${where}". Alleen deze maplaag (geen slash of subpad):`,
      "nieuwe-map",
    );
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const joined = joinMarkdownPath(parentFolderFullPath, trimmed);
    const normalized = normalizeMarkdownFolderPath(joined);
    if (!normalized) {
      status.textContent = "Ongeldige mapnaam.";
      return;
    }
    if (
      normalizeFolderPrefix(immediateParentFolderOfRelPath(normalized)) !==
      normalizeFolderPrefix(parentFolderFullPath)
    ) {
      status.textContent =
        "Gebruik alleen een mapnaam in deze map (geen pad met extra submappen). Maak geneste mappen stap voor stap.";
      return;
    }
    if (!(await confirmLeaveEditModeForImport())) return;
    try {
      await createMarkdownFolder(normalized);
      selectedFolder = normalized;
      fileTreeExpandedPaths.add(normalized);
      if (parentFolderFullPath) fileTreeExpandedPaths.add(parentFolderFullPath);
      status.textContent = `Map "${normalized}" aangemaakt.`;
      const preserve =
        fileSelect.value && fileSelect.value !== EXTERNAL_MARKDOWN_VALUE ? fileSelect.value : undefined;
      await loadLists(preserve);
    } catch (e) {
      status.textContent = `Map aanmaken mislukt: ${String((e as Error).message)}`;
    }
  }

  function clearTreeDropHighlights(): void {
    for (const el of fileTreeScroll.querySelectorAll(".mv-file-tree--drop-hover")) {
      el.classList.remove("mv-file-tree--drop-hover");
    }
  }

  function treeMoveTargetPath(fromMd: string, destFolderFullPath: string): string | null {
    const destFolder = normalizeFolderPrefix(destFolderFullPath);
    const base = baseNameMd(fromMd);
    const joined = joinMarkdownPath(destFolder, base);
    return normalizeMarkdownFileName(joined);
  }

  async function moveMarkdownFileToFolder(fromPath: string, destFolderFullPath: string): Promise<void> {
    const toNorm = treeMoveTargetPath(fromPath, destFolderFullPath);
    if (!toNorm) {
      status.textContent = "Doelpad voor verplaatsen is ongeldig.";
      return;
    }
    if (fromPath === toNorm) return;
    if (!(await confirmLeaveEditModeForImport())) return;
    if (markdownFileNames().includes(toNorm)) {
      status.textContent = `In die map bestaat al een bestand "${baseNameMd(fromPath)}". Hernoem eerst een van de twee.`;
      return;
    }
    try {
      await renameMarkdownPath(fromPath, toNorm);
      selectedFolder = normalizeFolderPrefix(destFolderFullPath);
      expandFileTreeAncestors(toNorm);
      fileTreeExpandedPaths.add(normalizeFolderPrefix(destFolderFullPath));
      status.textContent = `Verplaatst naar ${toNorm}.`;
      await loadLists(toNorm);
    } catch (e) {
      status.textContent = `Verplaatsen mislukt: ${String((e as Error).message)}`;
    }
  }

  async function deleteMarkdownFromTree(filePath: string): Promise<void> {
    if (!filePath) return;
    if (fileSelect.value === filePath && isDirty) {
      const okDirty = confirm(`"${filePath}" heeft mogelijk niet-opgeslagen wijzigingen. Toch verwijderen?`);
      if (!okDirty) return;
    }
    const ok = confirm(
      `Verwijder "${filePath}"?\n\n` +
        "Dit verwijdert ook bijbehorende review-opmerkingen en de laatste backup voor dit bestand.",
    );
    if (!ok) return;
    try {
      await deleteMarkdownFile(filePath);
      const wasSelected = fileSelect.value === filePath;
      if (wasSelected) {
        fileSelect.value = "";
        reviewComments = [];
        currentMd = "";
        isDirty = false;
      }
      status.textContent = `${filePath} verwijderd.`;
      await loadLists(undefined);
    } catch (e) {
      status.textContent = `Verwijderen mislukt: ${String((e as Error).message)}`;
    }
  }

  function attachMarkdownTreeDropTarget(el: HTMLElement, destFolderFullPath: string): void {
    el.addEventListener("dragenter", (e) => {
      if (!treeDragMarkdownPath) return;
      e.preventDefault();
    });
    el.addEventListener("dragover", (e) => {
      if (!treeDragMarkdownPath) return;
      const dt = e.dataTransfer;
      const from = treeDragMarkdownPath;
      const toNorm = treeMoveTargetPath(from, destFolderFullPath);
      if (!toNorm || from === toNorm || markdownFileNames().includes(toNorm)) {
        clearTreeDropHighlights();
        try {
          if (dt) dt.dropEffect = "none";
        } catch {
          /* ignore */
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        if (dt) dt.dropEffect = "move";
      } catch {
        /* ignore */
      }
      if (!el.classList.contains("mv-file-tree--drop-hover")) {
        clearTreeDropHighlights();
        el.classList.add("mv-file-tree--drop-hover");
      }
    });
    el.addEventListener("dragleave", (e) => {
      const rt = e.relatedTarget as Node | null;
      if (rt && el.contains(rt)) return;
      el.classList.remove("mv-file-tree--drop-hover");
    });
    el.addEventListener("drop", (e) => {
      if (!treeDragMarkdownPath) return;
      e.preventDefault();
      e.stopPropagation();
      clearTreeDropHighlights();
      const from = treeDragMarkdownPath;
      treeDragMarkdownPath = null;
      void moveMarkdownFileToFolder(from, destFolderFullPath);
    });
  }

  function renderFileTreeNodes(container: HTMLElement, node: FileTreeDirNode, depth: number, sel: string): void {
    if (depth === 0 && node.fullPath === "") {
      const rootRow = el("div", "mv-file-tree-folder-row mv-file-tree-root-actions");
      rootRow.style.paddingLeft = "4px";
      const rootNewFile = el("button", "mv-file-tree-new-file");
      rootNewFile.type = "button";
      rootNewFile.textContent = "+";
      rootNewFile.title = "Nieuw leeg Markdown-bestand in hoofdmap";
      rootNewFile.setAttribute("aria-label", "Nieuw leeg Markdown-bestand in hoofdmap");
      rootNewFile.addEventListener("click", (e) => {
        e.stopPropagation();
        void createEmptyMarkdownInFolder("");
      });
      const rootNewFolder = el("button", "mv-file-tree-new-file mv-file-tree-new-folder");
      rootNewFolder.type = "button";
      rootNewFolder.textContent = "📁";
      rootNewFolder.title = "Nieuwe map in hoofdmap";
      rootNewFolder.setAttribute("aria-label", "Nieuwe map in hoofdmap");
      rootNewFolder.addEventListener("click", (e) => {
        e.stopPropagation();
        void createMarkdownSubfolder("");
      });
      const dropRoot = el("div", "mv-file-tree-drop-root");
      dropRoot.title = "Sleep hier een .md-bestand naartoe om het naar de hoofdmap te verplaatsen";
      attachMarkdownTreeDropTarget(dropRoot, "");
      rootRow.append(rootNewFile, rootNewFolder, dropRoot);
      container.append(rootRow);
    }

    for (const dir of node.subdirs.values()) {
      const wrap = el("div", "mv-file-tree-node mv-file-tree-node--folder");
      const row = el("div", "mv-file-tree-folder-row");
      const expanded = fileTreeExpandedPaths.has(dir.fullPath);
      const disc = el("button", "mv-file-tree-disclosure");
      disc.type = "button";
      disc.setAttribute("aria-expanded", expanded ? "true" : "false");
      disc.setAttribute("aria-label", expanded ? "Map inklappen" : "Map uitklappen");
      disc.title = expanded ? "Inklappen" : "Uitklappen";

      const folderBtn = el("button", "mv-file-tree-folder-name");
      folderBtn.type = "button";
      folderBtn.textContent = dir.segment;
      folderBtn.title = dir.fullPath ? `${dir.fullPath}/` : dir.segment;

      const addBtn = el("button", "mv-file-tree-new-file");
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.title = expanded ? "Nieuw leeg Markdown-bestand in deze map" : "Klappen eerst de map uit om hier een bestand toe te voegen";
      addBtn.setAttribute(
        "aria-label",
        expanded ? `Nieuw leeg Markdown-bestand in ${dir.fullPath || "map"}` : "Map eerst uitklappen om een nieuw bestand toe te voegen",
      );
      addBtn.hidden = !expanded;
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void createEmptyMarkdownInFolder(dir.fullPath);
      });

      const addFolderBtn = el("button", "mv-file-tree-new-file mv-file-tree-new-folder");
      addFolderBtn.type = "button";
      addFolderBtn.textContent = "📁";
      addFolderBtn.title = expanded ? "Nieuwe submap in deze map" : "Klappen eerst de map uit om hier een map toe te voegen";
      addFolderBtn.setAttribute(
        "aria-label",
        expanded ? `Nieuwe submap in ${dir.fullPath || "map"}` : "Map eerst uitklappen om een nieuwe submap toe te voegen",
      );
      addFolderBtn.hidden = !expanded;
      addFolderBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void createMarkdownSubfolder(dir.fullPath);
      });

      const toggleFolder = () => {
        if (fileTreeExpandedPaths.has(dir.fullPath)) fileTreeExpandedPaths.delete(dir.fullPath);
        else fileTreeExpandedPaths.add(dir.fullPath);
        refreshFileTree();
      };
      disc.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFolder();
      });
      folderBtn.addEventListener("click", () => toggleFolder());

      row.style.paddingLeft = `${4 + depth * 14}px`;
      row.append(disc, folderBtn, addBtn, addFolderBtn);
      wrap.append(row);

      const children = el("div", "mv-file-tree-children");
      children.hidden = !expanded;
      if (expanded) {
        renderFileTreeNodes(children, dir, depth + 1, sel);
      }
      wrap.append(children);
      attachMarkdownTreeDropTarget(wrap, dir.fullPath);
      container.append(wrap);
    }

    for (const filePath of node.files) {
      const base = filePath.includes("/") ? filePath.slice(filePath.lastIndexOf("/") + 1) : filePath;
      const row = el("div", "mv-file-tree-row mv-file-tree-row--file");
      row.draggable = true;
      row.title = `${filePath} — slepen om naar een andere map te verplaatsen`;
      row.style.paddingLeft = `${22 + depth * 14}px`;
      if (filePath === sel) row.classList.add("is-selected");

      const openBtn = el("button", "mv-file-tree-file-name", base);
      openBtn.type = "button";
      openBtn.title = filePath;
      openBtn.addEventListener("click", () => {
        if (fileSelect.value === filePath) {
          closeMobileOverlays();
          return;
        }
        fileSelect.value = filePath;
        selectedFolder = folderOfMarkdownPath(filePath);
        void loadSelection();
        closeMobileOverlays();
      });

      const actions = el("span", "mv-file-tree-file-actions");
      const renameBtn = el("button", "mv-file-tree-file-action", "✎");
      renameBtn.type = "button";
      renameBtn.title = `${filePath} hernoemen`;
      renameBtn.setAttribute("aria-label", `${filePath} hernoemen`);
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showRenameMarkdownDialog(filePath);
      });
      const deleteBtn = el("button", "mv-file-tree-file-action mv-file-tree-file-action--danger", "🗑");
      deleteBtn.type = "button";
      deleteBtn.title = `${filePath} verwijderen`;
      deleteBtn.setAttribute("aria-label", `${filePath} verwijderen`);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void deleteMarkdownFromTree(filePath);
      });
      actions.append(renameBtn, deleteBtn);
      row.append(openBtn, actions);

      row.addEventListener("dragstart", (e) => {
        const dt = e.dataTransfer;
        if (!dt) return;
        treeDragMarkdownPath = filePath;
        dt.setData("text/plain", filePath);
        dt.effectAllowed = "move";
        row.classList.add("mv-file-tree-row--dragging");
      });
      row.addEventListener("dragend", () => {
        treeDragMarkdownPath = null;
        row.classList.remove("mv-file-tree-row--dragging");
        clearTreeDropHighlights();
      });
      container.append(row);
    }
  }

  function refreshFileTree(): void {
    const prevScroll = fileTreeScroll.scrollTop;
    fileTreeScroll.replaceChildren();
    const q = fileTreeFilter.value.trim().toLowerCase();
    const sel = fileSelect.value;
    const filteredFiles = collectPathsMatchingTreeFilter(corpusMarkdownPaths, q);
    const filteredFolders = corpusMarkdownFolders.filter((folderPath) =>
      folderMatchesTreeFilter(folderPath, q, filteredFiles),
    );

    if (sel && sel !== EXTERNAL_MARKDOWN_VALUE && corpusMarkdownPaths.includes(sel)) {
      expandFileTreeAncestors(sel);
    }
    if (q) {
      for (const p of filteredFiles) expandFileTreeAncestors(p);
      for (const f of filteredFolders) expandFileTreeAncestors(f);
    }

    const root = makeFileTreeDir("", "");
    for (const p of filteredFiles) insertMarkdownPathIntoTree(root, p);
    for (const f of filteredFolders) insertFolderPathIntoTree(root, f);
    sortFileTreeDir(root);

    const treeHasRows = filteredFiles.length > 0 || filteredFolders.length > 0;
    if (!treeHasRows) {
      fileTreeScroll.append(
        el("div", "mv-file-tree-empty", q ? "Geen bestanden of mappen gevonden." : "Geen markdown-bestanden of mappen."),
      );
    } else {
      const host = el("div", "mv-file-tree-root");
      renderFileTreeNodes(host, root, 0, sel);
      fileTreeScroll.append(host);
    }

    requestAnimationFrame(() => {
      fileTreeScroll.scrollTop = prevScroll;
    });
  }

  fileTreeFilter.addEventListener("input", () => refreshFileTree());

  async function loadLists(preferredMd?: string) {
    const externalWasSelected = fileSelect.value === EXTERNAL_MARKDOWN_VALUE;
    const keepExternal = externalDocumentKind !== "none";

    const [{ files: mdFiles, folders: mdFolders }, templates] = await Promise.all([
      fetchMarkdownIndex(),
      fetchTemplateFiles(),
    ]);
    fileSelect.replaceChildren();
    tplSelect.replaceChildren();
    for (const f of mdFiles) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      fileSelect.append(o);
    }
    if (keepExternal) {
      const o = document.createElement("option");
      o.value = EXTERNAL_MARKDOWN_VALUE;
      o.textContent =
        externalDocumentKind === "confluence"
          ? `☁ ${externalFileLabel} (Confluence v${externalConfluencePage?.version || "?"})`
          : `📄 ${externalFileLabel} (extern op schijf)`;
      fileSelect.insertBefore(o, fileSelect.firstChild);
    }
    for (const t of templates) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      tplSelect.append(o);
    }

    status.textContent = `${mdFiles.length} markdown-bestand(en); ${mdFolders.length} map(pen); ${templates.length} template(s).`;

    corpusMarkdownPaths = mdFiles.slice();
    corpusMarkdownFolders = mdFolders.slice();

    templatesAvailable = templates.length > 0;
    tplSelect.disabled = !templatesAvailable;

    let pickMd: string | undefined;
    if (keepExternal && externalWasSelected) {
      pickMd = EXTERNAL_MARKDOWN_VALUE;
    } else if (preferredMd && mdFiles.includes(preferredMd)) {
      pickMd = preferredMd;
    } else if (mdFiles.includes("Applicatie_Dienstverlening.md")) {
      pickMd = "Applicatie_Dienstverlening.md";
    } else {
      pickMd = mdFiles[0];
    }
    if (pickMd) {
      fileSelect.value = pickMd;
      if (pickMd !== EXTERNAL_MARKDOWN_VALUE) {
        selectedFolder = folderOfMarkdownPath(pickMd);
      } else {
        selectedFolder = "";
      }
    }

    if (templatesAvailable) {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      } catch {
        stored = null;
      }
      const pickTpl =
        stored && templates.includes(stored)
          ? stored
          : templates.includes("default.json")
            ? "default.json"
            : templates[0];
      tplSelect.value = pickTpl;
    }

    await loadSelection();
  }

  async function loadDocumentData(name: string, tplName: string): Promise<void> {
    if (name === EXTERNAL_MARKDOWN_VALUE) {
      if (externalDocumentKind === "none") {
        status.textContent = "Extern document: geen bestandskoppeling meer.";
        currentMd = "";
        reviewComments = [];
        rerenderAgentChatMessages();
      } else {
        if (externalDocumentKind === "disk") {
          currentMd = await readExternalMarkdownDisk();
        }
        try {
          applyReviewPack(await fetchReviewComments(getOrCreateExternalAgentVirtualName()));
        } catch {
          reviewComments = [];
          rerenderAgentChatMessages();
        }
        const reviewNote =
          "Reviews: .reviews/_mv_external/… op de server (zelfde sessie-id zolang je deze bestandsnaam in deze browser opnieuw opent).";
        try {
          if (!tplName || !templatesAvailable) {
            currentMerged = {};
            status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — ${reviewNote}`;
          } else {
            const raw = await fetchTemplate(tplName);
            currentMerged = asTemplate(raw);
            status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — ${tplName}; ${reviewNote}`;
          }
        } catch {
          status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — template niet gelezen (${tplName}), defaults. ${reviewNote}`;
          currentMerged = {};
        }
      }
      return;
    }
    currentMd = await fetchMarkdownFile(name);
    try {
      applyReviewPack(await fetchReviewComments(name));
    } catch {
      reviewComments = [];
      rerenderAgentChatMessages();
    }
    try {
      if (!tplName || !templatesAvailable) {
        currentMerged = {};
        status.textContent = `${name} — ingebouwde defaults (geen templatebestanden).`;
      } else {
        const raw = await fetchTemplate(tplName);
        currentMerged = asTemplate(raw);
        status.textContent = `${name} — ${tplName}`;
      }
    } catch {
      status.textContent = `${name} — template niet gelezen (${tplName}), defaults gebruiken.`;
      currentMerged = {};
    }
  }

  /** Extern: reviews + template/status verversen zonder `currentMd` van schijf te overschrijven. */
  async function syncExternalReviewsAndTemplate(tplName: string): Promise<void> {
    if (externalDocumentKind === "none") return;
    try {
      applyReviewPack(await fetchReviewComments(getOrCreateExternalAgentVirtualName()));
    } catch {
      reviewComments = [];
      rerenderAgentChatMessages();
    }
    const reviewNote =
      "Reviews: .reviews/_mv_external/… op de server (zelfde sessie-id zolang je deze bestandsnaam in deze browser opnieuw opent).";
    try {
      if (!tplName || !templatesAvailable) {
        currentMerged = {};
        status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — ${reviewNote}`;
      } else {
        const raw = await fetchTemplate(tplName);
        currentMerged = asTemplate(raw);
        status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — ${tplName}; ${reviewNote}`;
      }
    } catch {
      status.textContent = `${externalFileLabel} (${externalDocumentSourceLabel()}) — template niet gelezen (${tplName}), defaults. ${reviewNote}`;
      currentMerged = {};
    }
  }

  async function loadSelection() {
    clearAgentSnippetHighlights(proseHost);
    try {
      await saveCurrentEditorToBoundDoc();
      const name = fileSelect.value;
      const tplName = tplSelect.value;
      if (!name) {
        teardownEditor();
        tocHost.replaceChildren();
        coverSection.hidden = true;
        coverSection.innerHTML = "";
        endSection.hidden = true;
        endSection.innerHTML = "";
        mountProseArtifacts(mergeTemplate(defaultTemplate, currentMerged), "", proseHost);
        status.textContent = "Geen .md gevonden — zet ze in Files/ en herstart.";
        reviewComments = [];
        rerenderAgentChatMessages();
        syncToolbarDocTitle();
        return;
      }
      if (name === EXTERNAL_MARKDOWN_VALUE && externalDocumentKind === "none") {
        teardownEditor();
        status.textContent =
          "Extern document niet meer gekoppeld — kies opnieuw via Openen… of selecteer een bestand uit Files/.";
        tocHost.replaceChildren();
        coverSection.hidden = true;
        coverSection.innerHTML = "";
        endSection.hidden = true;
        endSection.innerHTML = "";
        mountProseArtifacts(mergeTemplate(defaultTemplate, currentMerged), "", proseHost);
        reviewComments = [];
        rerenderAgentChatMessages();
        syncToolbarDocTitle();
        return;
      }
      await loadDocumentData(name, tplName);
      await mountEditorSurface();
      syncToolbarDocTitle();
      refreshAgentChatModeUi();
    } finally {
      refreshFileTree();
    }
  }

  async function runAgentForCurrentDocument() {
    const name = fileSelect.value;
    if (!name) return;
    const isExternal = name === EXTERNAL_MARKDOWN_VALUE;
    if (!isExternal) await flushAutoSave();
    if (reviewComments.some(lastReplyIsFromAgent)) {
      status.textContent =
        "Keur eerst alle vorige agentwijzigingen goed of af voordat je een nieuwe agent-run start.";
      return;
    }
    try {
      const cfg = await fetchAgentConfig();
      if (!cfg.endpoint || !cfg.model || !cfg.hasApiKey) {
        status.textContent = "Agentconfig ontbreekt. Vul endpoint, model en API key in.";
        await showSettingsDialog();
        return;
      }
      setReviewAgentBusy(true);
      status.textContent = "Agent verwerkt opmerkingen…";
      let result;
      if (isExternal) {
        const virtual = getOrCreateExternalAgentVirtualName();
        const rawMd = editRoot ? getMarkdownForExport() : currentMd;
        const mdPayload = typeof rawMd === "string" ? rawMd : String(rawMd ?? "");
        result = await runAgent({
          name: virtual,
          external: true,
          markdown: mdPayload,
          replyMarkdown: agentReplyMarkdownCheckbox.checked,
        });
        if (typeof result.markdown === "string") {
          currentMd = result.markdown;
          try {
            await writeExternalMarkdown(result.markdown);
          } catch (e) {
            status.textContent = `Agent klaar maar schijf niet bijgewerkt: ${String((e as Error).message)}`;
          }
        }
        await loadDocumentData(EXTERNAL_MARKDOWN_VALUE, tplSelect.value);
      } else {
        result = await runAgent({ name, replyMarkdown: agentReplyMarkdownCheckbox.checked });
        await loadDocumentData(name, tplSelect.value);
      }
      await refreshEditSurfaceAfterDataLoad();
      syncToolbarDocTitle();
      const displayLabel = isExternal ? externalFileLabel || "extern" : name;
      status.textContent =
        result.processed === 0
          ? `${displayLabel} — geen commentaren om te verwerken (${result.skipped} overgeslagen: al door agent beantwoord of zonder tekst/citaat).`
          : `${displayLabel} — agent klaar: ${result.processed} verwerkt, ` +
            `${result.changed} patch(es), ${result.failed} fout(en), ${result.skipped} overgeslagen.`;
    } catch (e) {
      status.textContent = `Agent uitvoeren mislukt: ${String((e as Error).message)}`;
    } finally {
      setReviewAgentBusy(false);
    }
  }

  async function openMarkdownFromDiskWithPicker(): Promise<void> {
    const picker = (
      window as Window & {
        showOpenFilePicker?: (options?: {
          multiple?: boolean;
          types?: Array<{ description?: string; accept: Record<string, string[]> }>;
        }) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker;
    if (typeof picker !== "function") {
      status.textContent =
        "Openen zonder kopie naar Files/ vereist de File System Access API (Edge of Chrome op dit systeem).";
      return;
    }
    if (!(await confirmLeaveEditModeForImport())) return;
    let handles: FileSystemFileHandle[];
    try {
      handles = await picker.call(window, {
        multiple: false,
        types: [
          {
            description: "Markdown",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".md", ".markdown", ".txt"],
            },
          },
        ],
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      status.textContent = `Openen mislukt: ${String((e as Error).message)}`;
      return;
    }
    const handle = handles[0];
    if (!handle) return;
    externalDocumentKind = "disk";
    externalFileHandle = handle;
    externalFileLabel = handle.name;
    externalConfluencePage = null;
    let opt = Array.from(fileSelect.options).find((o) => o.value === EXTERNAL_MARKDOWN_VALUE);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = EXTERNAL_MARKDOWN_VALUE;
      fileSelect.insertBefore(opt, fileSelect.firstChild);
    }
    opt.textContent = `📄 ${externalFileLabel} (extern op schijf)`;
    fileSelect.value = EXTERNAL_MARKDOWN_VALUE;
    selectedFolder = "";
    await loadSelection();
  }

  function showConfluenceImportDialog(): void {
    confluenceImportInput.value = "";
    confluenceImportDialog.hidden = false;
    confluenceImportInput.focus();
  }

  function hideConfluenceImportDialog(): void {
    confluenceImportDialog.hidden = true;
  }

  async function openConfluencePageInEditor(input: { pageId?: string; url?: string }): Promise<void> {
    if (!(await confirmLeaveEditModeForImport())) return;
    status.textContent = "Confluence-pagina ophalen…";
    const page = await fetchConfluencePage(input);
    externalDocumentKind = "confluence";
    externalFileHandle = null;
    externalConfluencePage = {
      id: page.id,
      title: page.title || `Confluence ${page.id}`,
      version: page.version.number || 1,
      url: page.url,
    };
    externalFileLabel = externalConfluencePage.title;
    currentMd = page.markdown || page.text || "";
    reviewComments = [];
    rerenderAgentChatMessages();
    let opt = Array.from(fileSelect.options).find((o) => o.value === EXTERNAL_MARKDOWN_VALUE);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = EXTERNAL_MARKDOWN_VALUE;
      fileSelect.insertBefore(opt, fileSelect.firstChild);
    }
    opt.textContent = `☁ ${externalFileLabel} (Confluence v${externalConfluencePage.version})`;
    fileSelect.value = EXTERNAL_MARKDOWN_VALUE;
    selectedFolder = "";
    hideConfluenceImportDialog();
    hideConfluenceSearchDialog();
    await loadSelection();
    refreshAgentChatModeUi();
    status.textContent = `${externalFileLabel} — geïmporteerd uit Confluence v${externalConfluencePage.version}. Autosave staat uit; gebruik handmatig opslaan om terug te schrijven.`;
  }

  async function importConfluencePageToEditor(): Promise<void> {
    const raw = confluenceImportInput.value.trim();
    if (!raw) {
      status.textContent = "Plak eerst een Confluence URL of pageId.";
      confluenceImportInput.focus();
      return;
    }
    confluenceImportRunBtn.disabled = true;
    try {
      const isPageId = /^\d+$/.test(raw);
      await openConfluencePageInEditor(isPageId ? { pageId: raw } : { url: raw });
    } catch (e) {
      status.textContent = `Confluence importeren mislukt: ${String((e as Error).message)}`;
    } finally {
      confluenceImportRunBtn.disabled = false;
    }
  }

  function showConfluenceSearchDialog(): void {
    confluenceSearchResults.replaceChildren(el("div", "mv-md-dialog-hint", "Vul een zoekterm in en klik op Zoeken."));
    confluenceSearchDialog.hidden = false;
    confluenceSearchQueryInput.focus();
  }

  function hideConfluenceSearchDialog(): void {
    confluenceSearchDialog.hidden = true;
  }

  function renderConfluenceSearchResults(results: ConfluenceSearchResult[]): void {
    confluenceSearchResults.replaceChildren();
    if (!results.length) {
      confluenceSearchResults.append(el("div", "mv-md-dialog-hint", "Geen Confluence-pagina's gevonden."));
      return;
    }
    for (const result of results) {
      const item = el("article", "mv-confluence-search-result");
      const body = el("div", "mv-confluence-search-result-body");
      body.append(
        el("div", "mv-confluence-search-result-title", result.title || `Confluence ${result.id}`),
        el(
          "div",
          "mv-confluence-search-result-meta",
          `${result.space.key || "?"}${result.version.number ? ` · v${result.version.number}` : ""}${
            result.version.when ? ` · ${new Date(result.version.when).toLocaleDateString("nl-NL")}` : ""
          }`,
        ),
      );
      const actions = el("div", "mv-confluence-search-result-actions");
      if (result.url) {
        const open = document.createElement("a");
        open.className = "mv-ribbon-btn mv-ribbon-btn--ghost";
        open.href = result.url;
        open.target = "_blank";
        open.rel = "noreferrer";
        open.textContent = "Open";
        actions.append(open);
      }
      const importBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Importeer");
      importBtn.type = "button";
      importBtn.addEventListener("click", async () => {
        importBtn.disabled = true;
        try {
          await openConfluencePageInEditor({ pageId: result.id });
        } catch (e) {
          status.textContent = `Confluence importeren mislukt: ${String((e as Error).message)}`;
        } finally {
          importBtn.disabled = false;
        }
      });
      actions.append(importBtn);
      item.append(body, actions);
      confluenceSearchResults.append(item);
    }
  }

  async function runConfluenceSearch(): Promise<void> {
    const query = confluenceSearchQueryInput.value.trim();
    if (!query) {
      status.textContent = "Vul eerst een Confluence zoekterm in.";
      confluenceSearchQueryInput.focus();
      return;
    }
    confluenceSearchRunBtn.disabled = true;
    confluenceSearchResults.replaceChildren(el("div", "mv-md-dialog-hint", "Confluence doorzoeken…"));
    status.textContent = "Confluence doorzoeken…";
    try {
      const payload = await searchConfluencePages({
        query,
        spaceKey: confluenceSearchSpaceInput.value.trim() || undefined,
        limit: Number(confluenceSearchLimitInput.value || 10),
      });
      renderConfluenceSearchResults(payload.results);
      status.textContent = `Confluence zoeken klaar: ${payload.results.length} resultaat/resultaten.`;
    } catch (e) {
      confluenceSearchResults.replaceChildren(
        el("div", "mv-md-dialog-hint", `Confluence zoeken mislukt: ${String((e as Error).message)}`),
      );
      status.textContent = `Confluence zoeken mislukt: ${String((e as Error).message)}`;
    } finally {
      confluenceSearchRunBtn.disabled = false;
    }
  }

  fileSelect.addEventListener("change", async () => {
    try {
      await saveCurrentEditorToBoundDoc();
    } catch (e) {
      status.textContent = `Documentwissel geannuleerd: opslaan mislukt (${String((e as Error).message)}).`;
      if (editorBoundDoc) fileSelect.value = editorBoundDoc;
      return;
    }
    if (fileSelect.value !== EXTERNAL_MARKDOWN_VALUE) {
      clearExternalMarkdownSession();
      Array.from(fileSelect.options)
        .filter((o) => o.value === EXTERNAL_MARKDOWN_VALUE)
        .forEach((o) => o.remove());
    }
    selectedFolder = folderOfMarkdownPath(fileSelect.value);
    await loadSelection();
    refreshAgentChatModeUi();
  });
  tplSelect.addEventListener("change", () => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, tplSelect.value);
    } catch {
      /* private mode / storage disabled */
    }
    void loadSelection();
  });
  browseFilesBtn.addEventListener("click", () => void openMarkdownFromDiskWithPicker());
  mobileFileTreeBtn.addEventListener("click", () => openMobileFileTree());
  mobileMenuBtn.addEventListener("click", () => openMobileMenu());
  mobileChatBtn.addEventListener("click", () => toggleMobileChat());
  mobileChatLauncher.addEventListener("click", () => toggleMobileChat());
  mobileBackdrop.addEventListener("click", () => closeMobileOverlays());
  mobileMenuCloseBtn.addEventListener("click", () => closeMobileOverlays());
  fileTreeCloseBtn.addEventListener("click", () => closeMobileOverlays());
  agentChatCloseBtn.addEventListener("click", () => closeMobileOverlays());
  mobileLayoutMq.addEventListener("change", () => {
    if (!mobileLayoutMq.matches) closeMobileOverlays();
    else syncMobileOverlayState();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileOverlays();
  });
  confluenceImportBtn.addEventListener("click", () => showConfluenceImportDialog());
  confluenceSearchBtn.addEventListener("click", () => showConfluenceSearchDialog());
  confluenceImportCancelBtn.addEventListener("click", () => hideConfluenceImportDialog());
  confluenceImportRunBtn.addEventListener("click", () => void importConfluencePageToEditor());
  confluenceImportDialog.addEventListener("mousedown", (e) => {
    if (e.target === confluenceImportDialog) hideConfluenceImportDialog();
  });
  confluenceImportInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void importConfluencePageToEditor();
    }
  });
  confluenceSearchCancelBtn.addEventListener("click", () => hideConfluenceSearchDialog());
  confluenceSearchRunBtn.addEventListener("click", () => void runConfluenceSearch());
  confluenceSearchDialog.addEventListener("mousedown", (e) => {
    if (e.target === confluenceSearchDialog) hideConfluenceSearchDialog();
  });
  confluenceSearchQueryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runConfluenceSearch();
    }
  });
  confluenceSearchSpaceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runConfluenceSearch();
    }
  });
  pasteMdBtn.addEventListener("click", () => showMarkdownStringDialog());
  renameCancelBtn.addEventListener("click", () => hideRenameMarkdownDialog());
  renameDialog.addEventListener("mousedown", (e) => {
    if (e.target === renameDialog) hideRenameMarkdownDialog();
  });
  renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      renameOkBtn.click();
    }
  });
  renameOkBtn.addEventListener("click", async () => {
    if (renameIsExternal) {
      if (!externalFileHandle) {
        hideRenameMarkdownDialog();
        return;
      }
      const newBase = normalizeExternalMarkdownBaseName(renameInput.value);
      if (!newBase) {
        status.textContent =
          "Ongeldige naam. Gebruik alleen een bestandsnaam (geen pad), zonder \\ / : * ? \" < > | en eindig op .md.";
        return;
      }
      if (newBase === externalFileLabel) {
        hideRenameMarkdownDialog();
        return;
      }
      try {
        await forcePersistEditor();
        const md = getMarkdownForExport();
        const oldLabel = externalFileLabel;
        const handle = externalFileHandle as FileSystemFileHandle & {
          move?: (newName: string) => Promise<void>;
        };
        if (typeof handle.move === "function") {
          try {
            await handle.move(newBase);
            const finalName = handle.name || newBase;
            migrateExternalAgentSessionKey(oldLabel, finalName);
            externalFileLabel = finalName;
            const opt = Array.from(fileSelect.options).find((o) => o.value === EXTERNAL_MARKDOWN_VALUE);
            if (opt) opt.textContent = `📄 ${externalFileLabel} (extern op schijf)`;
            hideRenameMarkdownDialog();
            status.textContent = `Hernoemd op schijf: ${externalFileLabel}`;
            syncToolbarDocTitle();
            return;
          } catch {
            /* probeer Opslaan als */
          }
        }
        const savePicker = (
          window as Window & {
            showSaveFilePicker?: (options?: {
              suggestedName?: string;
              types?: Array<{ description?: string; accept: Record<string, string[]> }>;
            }) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker;
        if (typeof savePicker !== "function") {
          status.textContent =
            "Hernoemen lukt niet: geen bestands-move en geen Opslaan-als in deze browser. Gebruik Edge of Chrome, of kopieer naar Files/ via Plakken.";
          return;
        }
        const newHandle = await savePicker.call(window, {
          suggestedName: newBase,
          types: [
            {
              description: "Markdown",
              accept: {
                "text/markdown": [".md", ".markdown"],
                "text/plain": [".md", ".markdown", ".txt"],
              },
            },
          ],
        });
        const ow = await newHandle.createWritable();
        await ow.write(md);
        await ow.close();
        const finalName = newHandle.name;
        migrateExternalAgentSessionKey(oldLabel, finalName);
        externalFileHandle = newHandle;
        externalFileLabel = finalName;
        const opt = Array.from(fileSelect.options).find((o) => o.value === EXTERNAL_MARKDOWN_VALUE);
        if (opt) opt.textContent = `📄 ${externalFileLabel} (extern op schijf)`;
        hideRenameMarkdownDialog();
        status.textContent = `Opgeslagen als ${externalFileLabel}. Het bestand met de oude naam staat nog op schijf; verwijder dat zelf als je het niet meer nodig hebt.`;
        syncToolbarDocTitle();
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          hideRenameMarkdownDialog();
          return;
        }
        status.textContent = `Hernoemen mislukt: ${String((e as Error).message)}`;
      }
      return;
    }

    const from = renameSourcePath;
    if (!from) {
      hideRenameMarkdownDialog();
      return;
    }
    const to = computeRenameTarget(from, renameInput.value);
    if (!to) {
      status.textContent = "Ongeldige bestandsnaam. Gebruik alleen geldige map- en bestandsletters en eindig op .md.";
      return;
    }
    if (to === from) {
      hideRenameMarkdownDialog();
      return;
    }
    const existing = markdownFileNames();
    if (existing.includes(to)) {
      status.textContent = "Een bestand met die naam staat al in de lijst.";
      return;
    }
    try {
      await forcePersistEditor();
      await renameMarkdownPath(from, to);
      hideRenameMarkdownDialog();
      status.textContent = `Hernoemd naar ${to}.`;
      await loadLists(to);
    } catch (e) {
      status.textContent = `Hernoemen mislukt: ${String((e as Error).message)}`;
    }
  });
  mdStringCancelBtn.addEventListener("click", () => hideMarkdownStringDialog());
  mdStringDialog.addEventListener("mousedown", (e) => {
    if (e.target === mdStringDialog) hideMarkdownStringDialog();
  });
  mdStringLoadBtn.addEventListener("click", () => mdStringTemplateInput.click());
  mdStringTemplateInput.addEventListener("change", () => {
    const file = mdStringTemplateInput.files?.[0];
    mdStringTemplateInput.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      mdStringText.value = typeof reader.result === "string" ? reader.result : "";
      if (!mdStringName.value.trim()) {
        const rawBase = file.name.replace(/\\/g, "/").split("/").pop()?.trim() || "";
        if (rawBase) {
          mdStringName.value = rawBase.toLowerCase().endsWith(".md") ? rawBase : `${rawBase}.md`;
        }
      }
      status.textContent = `Inhoud geladen uit ${file.name} — controleer de bestandsnaam en sla op.`;
      mdStringText.focus();
    });
    reader.addEventListener("error", () => {
      status.textContent = `Bestand lezen mislukt: ${file.name}`;
    });
    reader.readAsText(file);
  });
  mdStringSaveBtn.addEventListener("click", async () => {
    const name = mdStringName.value;
    const content = mdStringText.value;
    if (await createOrReplaceMarkdownFile(name, content)) {
      hideMarkdownStringDialog();
    }
  });
  settingsBtn.addEventListener("click", () => void showSettingsDialog());
  settingsCloseBtn.addEventListener("click", () => hideSettingsDialog());
  settingsDialog.addEventListener("mousedown", (e) => {
    if (e.target === settingsDialog) hideSettingsDialog();
  });
  settingsAgentSaveBtn.addEventListener("click", () => void saveAgentConfigFromSettings());
  agentInstructionsRefreshBtn.addEventListener("click", () => void refreshSettingsAgentInstructions());
  agentInstructionsSaveBtn.addEventListener("click", () => void saveSettingsAgentInstructions());
  settingsLogsRefreshBtn.addEventListener("click", () => void refreshSettingsAgentLogs());
  settingsActivityLogsBtn.addEventListener("click", () => void refreshSettingsActivityLogs());
  settingsLogsClearBtn.addEventListener("click", () =>
    void (async () => {
      try {
        await clearAgentLogs();
        await refreshSettingsAgentLogs();
      } catch (e) {
        status.textContent = `Agentlog wissen mislukt: ${String((e as Error).message)}`;
      }
    })(),
  );
  async function docxImportPickAndConvert(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    input.style.display = "none";
    const cleanup = (): void => {
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return;
      void (async () => {
        docxImportBtn.disabled = true;
        status.textContent = "Word-document omzetten naar Markdown…";
        try {
          const { markdown, suggestedName, mammothMessages } = await importDocxToMarkdown(file);
          const normalized = markdownHtmlTablesToMarkdown(markdown);
          await saveMarkdownFile(suggestedName, normalized);
          await loadLists(suggestedName);
          const warn =
            mammothMessages !== undefined && mammothMessages.length > 0
              ? ` (${mammothMessages.length} conversiewaarschuwing(en))`
              : "";
          status.textContent = `Geïmporteerd als ${suggestedName}${warn}.`;
        } catch (e) {
          status.textContent = `Word-import mislukt: ${String((e as Error).message)}`;
        } finally {
          docxImportBtn.disabled = false;
        }
      })();
    });
    document.body.append(input);
    input.click();
  }

  wordExportBtn.addEventListener("click", () => void showDocxExportDialog());
  docxImportBtn.addEventListener("click", () => void docxImportPickAndConvert());
  docxExportCancelBtn.addEventListener("click", () => hideDocxExportDialog());
  docxExportDialog.addEventListener("mousedown", (e) => {
    if (e.target === docxExportDialog) hideDocxExportDialog();
  });
  docxExportRunBtn.addEventListener("click", () =>
    void (async () => {
      const tpl = docxTplSelect.value;
      if (!tpl) {
        status.textContent = "Kies een Word-template (.docx).";
        return;
      }
      let extra: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(docxMetadataTa.value || "{}") as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("extra metadata moet een JSON-object zijn");
        }
        extra = parsed as Record<string, unknown>;
      } catch (e) {
        status.textContent = `Ongeldige metadata-JSON: ${String((e as Error).message)}`;
        return;
      }
      const fromFields: Record<string, unknown> = {};
      for (const inp of docxPlaceholdersHost.querySelectorAll<HTMLInputElement>("input[data-placeholder-key]")) {
        const k = inp.dataset.placeholderKey;
        if (!k) continue;
        const v = inp.value.trim();
        if (v !== "") fromFields[k] = v;
      }
      const meta: Record<string, unknown> = { ...extra, ...fromFields };
      const name = fileSelect.value.trim();
      let downloadName = docxFilenameInput.value.trim();
      if (!downloadName.toLowerCase().endsWith(".docx")) {
        downloadName = downloadName ? `${downloadName}.docx` : suggestedDocxDownloadName(name);
      }
      docxExportRunBtn.disabled = true;
      try {
        const md = getMarkdownForExport();
        const { blob, filename } = await exportMarkdownToDocx({
          markdown_content: md,
          template_name: tpl,
          metadata_dict: meta,
          download_name: downloadName,
        });
        downloadBlob(blob, filename);
        hideDocxExportDialog();
        status.textContent = `Word-bestand gedownload: ${filename}`;
      } catch (e) {
        status.textContent = `Word-export mislukt: ${String((e as Error).message)}`;
      } finally {
        docxExportRunBtn.disabled = false;
      }
    })(),
  );

  printBtn.addEventListener("click", () => window.print());

  try {
    await loadLists();
    refreshTemplateVars();
  } catch (e) {
    status.textContent =
      `API niet bereikbaar (${String((e as Error).message)}). In map markdown-viewer: npm run dev ` +
      `(API op :8787 + Vite op :5173). Alleen “vite”/Open in browser zonder API ⇒ 404 op /api. ` +
      `Of één proces: npm run dev:unified.`;
  }
}

void bootstrap();
