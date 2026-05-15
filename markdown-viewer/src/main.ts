import "./style.css";
import { defaultTemplate, mergeTemplate } from "./defaultTemplate";
import type { ViewerTemplate } from "./templateTypes";
import { applyCssVars, templateToCssVars } from "./applyTemplate";
import {
  clearAgentLogs,
  createMarkdownFolder,
  deleteEmptyMarkdownFolder,
  fetchAgentConfig,
  fetchAgentLogs,
  fetchDocxTemplates,
  exportMarkdownToDocx,
  fetchMarkdownBackupFile,
  fetchMarkdownFile,
  fetchMarkdownIndex,
  fetchReviewComments,
  fetchTemplate,
  fetchTemplateFiles,
  renameMarkdownPath,
  revertMarkdownToLastBackup,
  runAgent,
  saveMarkdownFile,
  saveAgentConfig,
  saveReviewComments,
  type MarkdownFileDetail,
} from "./api";
import { htmlFragmentToMarkdown, markdownHtmlTablesToMarkdown } from "./htmlToMarkdown";
import { firstHeadingText, renderMarkdown, tocDisplayLabel, type TocEntry } from "./markdown";
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
  findQuoteOffsets,
  flatOffsetToRange,
  lastReplyIsFromAgent,
  newReviewComment,
  newReviewReply,
  REVIEW_HIGHLIGHT_CLASS,
  stripReviewHighlights,
  syncAnchorsFromDom,
  threadMessageCount,
  unwrapHighlightById,
  wrapRangeWithHighlight,
  type ReviewComment,
} from "./reviewComments";
import { buildProseSheets, type VisualSheetSplit } from "./visualPages";

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

function asTemplate(data: Record<string, unknown>): ViewerTemplate {
  return data as ViewerTemplate;
}

function sheetSplit(screen: ViewerTemplate["screen"]): VisualSheetSplit {
  const mode = screen?.visualPageSplit;
  if (mode === "h2") return "h2";
  if (mode === "both") return "both";
  return "h1";
}

function mountProseArtifacts(merged: ViewerTemplate, html: string, proseHost: HTMLElement) {
  proseHost.replaceChildren();
  const screen = merged.screen || {};
  const useVisual = screen.visualPageBreaks !== false;

  if (!useVisual) {
    const art = el("article", "mv-page");
    const proseDiv = el("div", "mv-prose");
    proseDiv.innerHTML = html;
    art.append(proseDiv);
    proseHost.append(art);
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
}

const CHANGE_OLD_CLASS = "mv-change-old";
const CHANGE_NEW_CLASS = "mv-change-new";

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
  copy.classList.add(kind === "old" ? CHANGE_OLD_CLASS : CHANGE_NEW_CLASS);
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
  root.querySelectorAll<HTMLElement>(`.${CHANGE_OLD_CLASS}`).forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>(`.${CHANGE_NEW_CLASS}`).forEach((node) => {
    node.classList.remove(CHANGE_NEW_CLASS);
    delete node.dataset.changeKind;
    node.removeAttribute("aria-label");
  });
}

function hasChangeMarkers(root: HTMLElement): boolean {
  return !!root.querySelector(`.${CHANGE_OLD_CLASS}, .${CHANGE_NEW_CLASS}`);
}

function buildTocList(entries: TocEntry[], tocHeading: string): HTMLElement {
  const wrap = el("nav", "mv-toc-wrap");
  wrap.setAttribute("aria-label", tocHeading || "Table of contents");
  const title = el("h2", "mv-toc-title", tocHeading);
  wrap.append(title);
  const ul = document.createElement("ul");
  ul.className = "mv-toc";
  for (const e of entries) {
    const li = document.createElement("li");
    li.className = `depth-${e.depth}`;
    const a = document.createElement("a");
    a.className = "mv-toc-link";
    a.href = `#${e.id}`;
    a.textContent = tocDisplayLabel(e.text);
    li.append(a);
    ul.append(li);
  }
  wrap.append(ul);
  return wrap;
}

const TEMPLATE_STORAGE_KEY = "markdown-viewer.selectedTemplate.json";

export async function bootstrap() {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app ontbreekt");

  let currentMd = "";
  let currentMerged: ViewerTemplate = defaultTemplate;
  let templatesAvailable = false;

  let isEditing = false;
  let isDirty = false;
  let editRoot: HTMLElement | null = null;
  let ribbonRaf = 0;
  let reviewComments: ReviewComment[] = [];
  let reviewDraftRange: Range | null = null;
  let selectedFolder = "";
  let lastMarkdownFiles: string[] = [];
  let lastMarkdownFolders: string[] = [];
  let lastMarkdownFileDetails: MarkdownFileDetail[] = [];
  let fileSortKey: "name" | "size" | "mtime" = "name";
  let fileSortDir: "asc" | "desc" = "asc";

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
  const toolbarDoc = el("div", "mv-toolbar__doc");
  toolbarDoc.append(
    el("span", "mv-toolbar__doc-eyebrow", "Document"),
    toolbarDocName,
  );

  const actions = el("div", "mv-toolbar__actions");
  const browseFilesBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Bestanden");
  browseFilesBtn.type = "button";
  browseFilesBtn.title = "Mappen en markdownbestanden beheren (upload en plakken zitten daar)";
  const settingsBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Instellingen");
  settingsBtn.type = "button";
  settingsBtn.title = "Template (JSON) en LLM-agentconfiguratie";
  const editToggleBtn = el("button", "mv-tb-btn mv-tb-btn--edit", "Bewerken");
  editToggleBtn.type = "button";
  editToggleBtn.title = "Schakel tussen lezen en inline bewerken (één doorlopende pagina).";
  const wordExportBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Word");
  wordExportBtn.type = "button";
  wordExportBtn.title =
    "Exporteer Markdown naar Word (.docx) via LLM2DOCX-templates — ook vanuit bewerkmodus (inclusief niet-opgeslagen tekst).";
  const printBtn = el("button", "mv-tb-btn mv-tb-btn--quiet", "Afdruk");
  printBtn.type = "button";
  printBtn.title =
    "Echte nieuwe papier-/PDF-pagina’s bij # en ## zie je in het afdrukvoorbeeld of PDF; op het scherm tonen witte blokken tussen hoofdstukken.";
  actions.append(browseFilesBtn, settingsBtn, editToggleBtn, wordExportBtn, printBtn);

  const uploadMdInput = document.createElement("input");
  uploadMdInput.type = "file";
  uploadMdInput.accept = ".md,text/markdown,text/plain";
  uploadMdInput.hidden = true;
  app.append(uploadMdInput);

  const status = el("div", "mv-status");
  const toolbarStatus = el("div", "mv-toolbar__status");
  toolbarStatus.append(status);

  const toolbarPrimary = el("div", "mv-toolbar__primary");
  toolbarPrimary.append(toolbarDoc);

  const toolbarTop = el("div", "mv-toolbar__top");
  toolbarTop.append(toolbarPrimary, actions);

  const toolbarInner = el("div", "mv-toolbar__inner");
  toolbarInner.append(fileField, toolbarTop, toolbarStatus);
  toolbar.append(toolbarInner);

  const ribbon = el("aside", "mv-ribbon");
  ribbon.setAttribute("aria-label", "Bewerkbalk");
  ribbon.hidden = true;

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
    "Selecteer tekst, klik hier en beschrijf in het rechterpaneel wat er anders moet (tekstballon bij de markering).";
  reviewTools.append(commentAddBtn);
  groupReview.append(reviewTools);

  const groupDoc = el("div", "mv-ribbon-group");
  groupDoc.append(el("span", "mv-ribbon-group-label", "Document"));
  const docTools = el("div", "mv-ribbon-tools");
  const saveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan");
  saveBtn.type = "button";
  saveBtn.title = "Wijzigingen naar het .md-bestand schrijven — Ctrl+S";
  const discardBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Herstellen");
  discardBtn.type = "button";
  discardBtn.title =
    "De tekst in de editor terugzetten naar de laatst opgeslagen inhoud (zonder het bestand opnieuw te laden)";
  docTools.append(saveBtn, discardBtn);
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
  const reviewPanel = el("aside", "mv-review-panel");
  reviewPanel.setAttribute("aria-label", "Reviewcommentaar");
  reviewPanel.hidden = true;
  const panelHead = el("div", "mv-review-panel-head");
  const panelTitle = el("h2", "mv-review-panel-title", "Commentaren");
  const panelAgentRunBtn = el("button", "mv-review-panel-agent-run mv-ribbon-btn mv-ribbon-btn--primary", "Agent");
  panelAgentRunBtn.type = "button";
  panelAgentRunBtn.title =
    "Alle nog niet verwerkte commentaren door de LLM laten verwerken (markdown aanpassen + antwoord in de thread)";
  panelHead.append(panelTitle, panelAgentRunBtn);
  const reviewAgentBusy = el("div", "mv-review-agent-busy");
  reviewAgentBusy.hidden = true;
  reviewAgentBusy.setAttribute("role", "status");
  reviewAgentBusy.setAttribute("aria-live", "polite");
  const reviewAgentBusySpin = el("span", "mv-review-agent-busy-spin");
  reviewAgentBusySpin.setAttribute("aria-hidden", "true");
  reviewAgentBusySpin.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
  reviewAgentBusy.append(
    reviewAgentBusySpin,
    el("span", "mv-review-agent-busy-text", "Agent verwerkt opmerkingen…"),
  );
  const reviewDraft = el("div", "mv-review-draft");
  reviewDraft.hidden = true;
  reviewDraft.append(el("div", "mv-review-draft-label", "Nieuw op selectie"));
  const draftQuote = el("div", "mv-review-draft-quote");
  const draftAuthor = document.createElement("input");
  draftAuthor.type = "text";
  draftAuthor.className = "mv-review-draft-author";
  draftAuthor.placeholder = "Jouw naam of rol (aanbevolen)";
  const draftTa = document.createElement("textarea");
  draftTa.className = "mv-review-draft-textarea";
  draftTa.placeholder = "Beschrijf wat er anders moet…";
  const draftActions = el("div", "mv-review-draft-actions");
  const draftSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Toevoegen");
  draftSaveBtn.type = "button";
  const draftCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  draftCancelBtn.type = "button";
  draftActions.append(draftSaveBtn, draftCancelBtn);
  reviewDraft.append(draftQuote, draftAuthor, draftTa, draftActions);
  const reviewList = el("div", "mv-review-list");
  reviewPanel.append(panelHead, reviewAgentBusy, reviewDraft, reviewList);
  bodyWrap.append(main, reviewPanel);

  shell.append(toolbar, ribbon, bodyWrap);
  app.append(shell);

  const reviewPopover = el("div", "mv-review-popover");
  reviewPopover.hidden = true;
  reviewPopover.setAttribute("role", "tooltip");
  document.body.append(reviewPopover);

  const mdStringDialog = el("div", "mv-md-dialog");
  mdStringDialog.hidden = true;
  mdStringDialog.setAttribute("role", "dialog");
  mdStringDialog.setAttribute("aria-modal", "true");
  mdStringDialog.setAttribute("aria-label", "Markdownstring opslaan als bestand");
  const mdStringCard = el("div", "mv-md-dialog-card");
  const mdStringTitle = el("h2", "mv-md-dialog-title", "Markdownstring naar bestand");
  const mdStringName = document.createElement("input");
  mdStringName.className = "mv-md-dialog-input";
  mdStringName.type = "text";
  mdStringName.placeholder = "bestandsnaam.md";
  const mdStringText = document.createElement("textarea");
  mdStringText.className = "mv-md-dialog-textarea";
  mdStringText.placeholder = "# Titel\n\nPlak hier Markdown...";
  const mdStringActions = el("div", "mv-md-dialog-actions");
  const mdStringSaveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan als .md");
  mdStringSaveBtn.type = "button";
  const mdStringCancelBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Annuleren");
  mdStringCancelBtn.type = "button";
  mdStringActions.append(mdStringCancelBtn, mdStringSaveBtn);
  mdStringCard.append(mdStringTitle, mdStringName, mdStringText, mdStringActions);
  mdStringDialog.append(mdStringCard);
  document.body.append(mdStringDialog);

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
  agentEndpoint.type = "url";
  agentEndpoint.placeholder = "https://api.openai.com/v1";
  const agentModel = document.createElement("input");
  agentModel.className = "mv-md-dialog-input";
  agentModel.type = "text";
  agentModel.placeholder = "Model, bijvoorbeeld gpt-4o-mini";
  const agentApiKey = document.createElement("input");
  agentApiKey.className = "mv-md-dialog-input";
  agentApiKey.type = "password";
  agentApiKey.placeholder = "API key (leeg laten om bestaande key te behouden)";
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
    agentModel,
    el("label", "mv-md-dialog-label", "API key"),
    agentApiKey,
    agentConfigHint,
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
  const settingsLogsClearBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Wissen");
  settingsLogsClearBtn.type = "button";
  settingsLogsToolbar.append(settingsLogsRefreshBtn, settingsLogsClearBtn);
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
  settingsScroll.append(settingsSectionTpl, settingsSectionAgent, settingsSectionLogs);
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
  const docxMetaLabel = el("label", "mv-md-dialog-label", "Jinja-metadata (JSON, optioneel)");
  const docxMetadataTa = document.createElement("textarea");
  docxMetadataTa.className = "mv-md-dialog-textarea";
  docxMetadataTa.rows = 4;
  docxMetadataTa.placeholder = '{ "titel": "…" }';
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
    docxMetaLabel,
    docxMetadataTa,
    docxExportActions,
  );
  docxExportDialog.append(docxExportCard);
  document.body.append(docxExportDialog);

  const fileManagerDialog = el("div", "mv-md-dialog mv-file-manager-dialog");
  fileManagerDialog.hidden = true;
  fileManagerDialog.setAttribute("role", "dialog");
  fileManagerDialog.setAttribute("aria-modal", "true");
  fileManagerDialog.setAttribute("aria-label", "Bestanden en mappen");
  const fileManagerCard = el("div", "mv-md-dialog-card mv-file-manager-dialog-card");
  const fileManagerTitleRow = el("div", "mv-file-manager-dialog-head");
  fileManagerTitleRow.append(el("h2", "mv-md-dialog-title", "Bestanden"));
  const fileManagerCloseBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Sluiten");
  fileManagerCloseBtn.type = "button";
  fileManagerTitleRow.append(fileManagerCloseBtn);
  const fileManagerToolbar = el("div", "mv-file-manager-dialog-toolbar");
  const popupUploadBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Upload");
  popupUploadBtn.type = "button";
  popupUploadBtn.title = "Nieuw .md-bestand uploaden naar de huidige map in Files/";
  const popupPasteBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Plakken");
  popupPasteBtn.type = "button";
  popupPasteBtn.title = "Markdown plakken en opslaan als nieuw .md-bestand";
  const popupNewFolderBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Nieuwe map");
  popupNewFolderBtn.type = "button";
  const popupDeleteFolderBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Lege map verwijderen");
  popupDeleteFolderBtn.type = "button";
  const sortLabel = el("label", "mv-file-manager-sort-label", "Sorteer");
  const popupSortSelect = document.createElement("select");
  popupSortSelect.className = "mv-file-manager-sort-select";
  for (const [v, t] of [
    ["name-asc", "Naam A–Z"],
    ["name-desc", "Naam Z–A"],
    ["size-asc", "Grootte ↑"],
    ["size-desc", "Grootte ↓"],
    ["mtime-desc", "Datum ↓"],
    ["mtime-asc", "Datum ↑"],
  ] as const) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    popupSortSelect.append(o);
  }
  const popupFolderHint = el("div", "mv-file-manager-dialog-hint", "Map: /");
  fileManagerToolbar.append(
    popupUploadBtn,
    popupPasteBtn,
    popupNewFolderBtn,
    popupDeleteFolderBtn,
    sortLabel,
    popupSortSelect,
    popupFolderHint,
  );
  const fileManagerBody = el("div", "mv-file-manager-dialog-body");
  const filePopupGrid = el("div", "mv-file-popup-grid");
  fileManagerBody.append(filePopupGrid);
  fileManagerCard.append(fileManagerTitleRow, fileManagerToolbar, fileManagerBody);
  fileManagerDialog.append(fileManagerCard);
  document.body.append(fileManagerDialog);

  const coverSection = el("section", "mv-cover");
  coverSection.hidden = true;
  const tocHost = el("div", "mv-toc-host");
  const proseHost = el("div", "mv-prose-host");

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
    return Array.from(fileSelect.options).map((o) => o.value);
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

  async function confirmLeaveEditModeForImport(): Promise<boolean> {
    if (!isEditing) return true;
    if (isDirty && !confirm("Je hebt niet-opgeslagen wijzigingen. Toch doorgaan met importeren?")) {
      return false;
    }
    exitEditMode();
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
    await saveMarkdownFile(normalized, markdownHtmlTablesToMarkdown(content));
    selectedFolder = folderOfMarkdownPath(normalized);
    status.textContent = `${normalized} aangemaakt.`;
    await loadLists(normalized);
    return true;
  }

  function showMarkdownStringDialog() {
    mdStringName.value = "";
    mdStringText.value = "";
    mdStringDialog.hidden = false;
    mdStringName.focus();
  }

  function hideMarkdownStringDialog() {
    mdStringDialog.hidden = true;
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

  async function showSettingsDialog() {
    try {
      const cfg = await fetchAgentConfig();
      agentEndpoint.value = cfg.endpoint;
      agentModel.value = cfg.model;
      agentApiKey.value = "";
      agentApiKey.placeholder = cfg.hasApiKey
        ? "API key aanwezig (leeg laten om te behouden)"
        : "API key";
    } catch (e) {
      status.textContent = `Agentconfig lezen mislukt: ${String((e as Error).message)}`;
    }
    void refreshSettingsAgentLogs();
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
      mdRelativePath.replace(/\\/g, "/").split("/").pop() || "document.md";
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
        ? `${templates.length} Word-template(s) in ${directory}.${modeNote}${extra} Export gebruikt de Markdown van dit document (in bewerkmodus ook niet-opgeslagen tekst).`
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
    docxMetadataTa.value = "{}";
    docxExportDialog.hidden = false;
    docxTplSelect.focus();
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

  function displayFolder(folder: string): string {
    return folder ? `/${folder}` : "/";
  }

  function joinMarkdownPath(folder: string, fileName: string): string {
    return folder ? `${folder}/${fileName}` : fileName;
  }

  function parentFolderPath(folder: string): string {
    const i = folder.lastIndexOf("/");
    return i >= 0 ? folder.slice(0, i) : "";
  }

  /** Directe submappen van `parent` zoals in `lastMarkdownFolders`. */
  function immediateChildFolders(parent: string): string[] {
    const out = new Set<string>();
    if (!parent) {
      for (const f of lastMarkdownFolders) {
        const parts = f.split("/").filter(Boolean);
        if (parts.length) out.add(parts[0]!);
      }
    } else {
      const prefix = `${parent}/`;
      for (const f of lastMarkdownFolders) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        const seg = rest.split("/").filter(Boolean)[0];
        if (seg) out.add(`${parent}/${seg}`);
      }
    }
    return [...out];
  }

  /** Lijst .md in deze map; metadata uit fileDetails als die er is (anders placeholders). */
  function markdownDetailsInFolder(folder: string): MarkdownFileDetail[] {
    const detailByName = new Map(lastMarkdownFileDetails.map((d) => [d.name, d]));
    const inFolder = lastMarkdownFiles.filter((p) => folderOfMarkdownPath(p) === folder);
    return inFolder.map((name) => {
      const fromApi = detailByName.get(name);
      if (fromApi) return fromApi;
      return { name, folder, size: 0, mtimeMs: 0 };
    });
  }

  function sortChildFolderPaths(paths: string[]): string[] {
    const copy = [...paths];
    if (fileSortKey === "name") {
      copy.sort((a, b) => {
        const cmp = baseNameMd(a).localeCompare(baseNameMd(b), "nl");
        return fileSortDir === "asc" ? cmp : -cmp;
      });
    } else {
      copy.sort((a, b) => baseNameMd(a).localeCompare(baseNameMd(b), "nl"));
    }
    return copy;
  }

  function formatFileSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function baseNameMd(relPath: string): string {
    const i = relPath.lastIndexOf("/");
    return i >= 0 ? relPath.slice(i + 1) : relPath;
  }

  function syncToolbarDocTitle() {
    const v = fileSelect.value.trim();
    if (!v) {
      toolbarDocName.textContent = "—";
      toolbarDocName.removeAttribute("title");
      return;
    }
    toolbarDocName.textContent = baseNameMd(v);
    toolbarDocName.title = v;
  }

  function applySortSelectionFromSelect() {
    const v = popupSortSelect.value;
    if (v === "name-asc") {
      fileSortKey = "name";
      fileSortDir = "asc";
    } else if (v === "name-desc") {
      fileSortKey = "name";
      fileSortDir = "desc";
    } else if (v === "size-asc") {
      fileSortKey = "size";
      fileSortDir = "asc";
    } else if (v === "size-desc") {
      fileSortKey = "size";
      fileSortDir = "desc";
    } else if (v === "mtime-desc") {
      fileSortKey = "mtime";
      fileSortDir = "desc";
    } else {
      fileSortKey = "mtime";
      fileSortDir = "asc";
    }
  }

  function syncSortSelectFromState() {
    const key = `${fileSortKey}-${fileSortDir}`;
    if (["name-asc", "name-desc", "size-asc", "size-desc", "mtime-desc", "mtime-asc"].includes(key)) {
      popupSortSelect.value = key;
    }
  }

  async function trySwitchMarkdownFile(name: string, closeDialog: boolean): Promise<boolean> {
    if (isEditing && isDirty) {
      if (!confirm("Je hebt niet-opgeslagen wijzigingen. Toch van bestand wisselen?")) {
        return false;
      }
    }
    if (isEditing) exitEditMode();
    fileSelect.value = name;
    selectedFolder = folderOfMarkdownPath(name);
    await loadSelection();
    if (closeDialog) fileManagerDialog.hidden = true;
    return true;
  }

  async function moveMarkdownToFolder(fromPath: string, targetFolder: string) {
    const base = baseNameMd(fromPath);
    const toPath = joinMarkdownPath(targetFolder, base);
    if (fromPath === toPath) return;
    await renameMarkdownPath(fromPath, toPath);
    await loadLists(toPath);
    if (!fileManagerDialog.hidden) renderFileManagerPopup();
    status.textContent = `Verplaatst naar ${toPath}`;
  }

  function showFileManagerDialog() {
    syncSortSelectFromState();
    fileManagerDialog.hidden = false;
    renderFileManagerPopup();
  }

  function hideFileManagerDialog() {
    fileManagerDialog.hidden = true;
  }

  function renderFileManagerPopup() {
    popupFolderHint.textContent = `Map: ${displayFolder(selectedFolder)}`;
    filePopupGrid.replaceChildren();

    const setFolderDropHandlers = (btn: HTMLElement, folderPath: string) => {
      btn.dataset.mvDropFolder = folderPath;
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        btn.classList.add("is-drop-target");
      });
      btn.addEventListener("dragleave", () => btn.classList.remove("is-drop-target"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        btn.classList.remove("is-drop-target");
        const from = e.dataTransfer?.getData("text/plain");
        if (!from) return;
        void moveMarkdownToFolder(from, folderPath).catch((err) => {
          status.textContent = `Verplaatsen mislukt: ${String((err as Error).message)}`;
        });
      });
    };

    if (selectedFolder) {
      const upTarget = parentFolderPath(selectedFolder);
      const upBtn = el("button", "mv-file-grid-tile mv-file-grid-tile--folder mv-file-grid-tile--parent");
      upBtn.type = "button";
      upBtn.append(
        el("div", "mv-file-grid-tile-ico", "⬆"),
        el("div", "mv-file-grid-tile-label", ".."),
        el("div", "mv-file-grid-tile-meta", "Omhoog"),
      );
      setFolderDropHandlers(upBtn, upTarget);
      upBtn.addEventListener("click", () => {
        selectedFolder = upTarget;
        renderFileManagerPopup();
      });
      filePopupGrid.append(upBtn);
    }

    const childFolders = sortChildFolderPaths(immediateChildFolders(selectedFolder));
    for (const pathName of childFolders) {
      const btn = el("button", "mv-file-grid-tile mv-file-grid-tile--folder");
      btn.type = "button";
      btn.append(
        el("div", "mv-file-grid-tile-ico", "📁"),
        el("div", "mv-file-grid-tile-label", baseNameMd(pathName)),
        el("div", "mv-file-grid-tile-meta", "Map"),
      );
      setFolderDropHandlers(btn, pathName);
      btn.addEventListener("click", () => {
        selectedFolder = pathName;
        renderFileManagerPopup();
      });
      filePopupGrid.append(btn);
    }

    const filtered = markdownDetailsInFolder(selectedFolder);
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (fileSortKey === "name") {
        cmp = baseNameMd(a.name).localeCompare(baseNameMd(b.name), "nl");
      } else if (fileSortKey === "size") {
        cmp = a.size - b.size;
      } else {
        cmp = a.mtimeMs - b.mtimeMs;
      }
      return fileSortDir === "asc" ? cmp : -cmp;
    });

    for (const d of sorted) {
      const card = el("div", "mv-file-grid-tile mv-file-grid-tile--file");
      card.draggable = true;
      card.dataset.mdPath = d.name;
      if (d.name === fileSelect.value) card.classList.add("is-current-file");
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", d.name);
        e.dataTransfer!.effectAllowed = "move";
      });
      card.addEventListener("dblclick", () => {
        void trySwitchMarkdownFile(d.name, true);
      });
      card.append(
        el("div", "mv-file-grid-tile-ico", "📄"),
        el("div", "mv-file-grid-tile-label", baseNameMd(d.name)),
        el(
          "div",
          "mv-file-grid-tile-meta",
          `${formatFileSize(d.size)} · ${formatReviewTs(new Date(d.mtimeMs).toISOString())}`,
        ),
      );
      const actions = el("div", "mv-file-grid-tile-actions");
      const openBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Open");
      openBtn.type = "button";
      openBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void trySwitchMarkdownFile(d.name, true);
      });
      const renBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Hernoemen");
      renBtn.type = "button";
      renBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const raw = prompt("Nieuwe bestandsnaam (.md)", baseNameMd(d.name));
        if (raw === null || !raw.trim()) return;
        const next = normalizeMarkdownFileName(joinMarkdownPath(d.folder, raw.trim()));
        if (!next) {
          status.textContent = "Ongeldige bestandsnaam.";
          return;
        }
        if (next === d.name) return;
        void renameMarkdownPath(d.name, next)
          .then(() => loadLists(next))
          .then(() => renderFileManagerPopup())
          .catch((e) => {
            status.textContent = `Hernoemen mislukt: ${String((e as Error).message)}`;
          });
      });
      actions.append(openBtn, renBtn);
      card.append(actions);
      card.addEventListener("click", () => {
        void trySwitchMarkdownFile(d.name, false);
        renderFileManagerPopup();
      });
      filePopupGrid.append(card);
    }
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
    if (!isEditing || !editRoot) return false;
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
    const name = fileSelect.value;
    if (!name) return false;
    try {
      const { reviewRelativePath } = await saveReviewComments(name, reviewComments);
      status.textContent = `Commentaren opgeslagen → ${reviewRelativePath}`;
      return true;
    } catch (e) {
      status.textContent = `Commentaar opslaan mislukt: ${String((e as Error).message)}`;
      return false;
    }
  }

  function removeReviewCommentLocally(c: ReviewComment) {
    if (editRoot) unwrapHighlightById(editRoot, c.id);
    reviewComments = reviewComments.filter((x) => x.id !== c.id);
    hideReviewPopover();
  }

  function scrollRangeIntoView(range: Range): boolean {
    const rects = Array.from(range.getClientRects());
    const rect = rects.find((r) => r.width > 0 || r.height > 0);
    if (rect) {
      window.scrollTo({
        top: window.scrollY + rect.top - window.innerHeight / 2,
        behavior: "smooth",
      });
      return true;
    }
    const node = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element | null);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    return !!node;
  }

  function showReviewCommentLocation(c: ReviewComment) {
    if (!editRoot) return;
    const spans = Array.from(
      editRoot.querySelectorAll(
        `span.${REVIEW_HIGHLIGHT_CLASS}[data-review-id="${CSS.escape(c.id)}"]`,
      ),
    ) as HTMLElement[];
    if (spans.length > 0) {
      spans[0].scrollIntoView({ block: "center", behavior: "smooth" });
      showReviewPopover(spans[0]);
      return;
    }

    const off = findQuoteOffsets(editRoot.innerText, c);
    const range = off ? flatOffsetToRange(editRoot, off.start, off.end) : null;
    if (range && scrollRangeIntoView(range)) {
      status.textContent = "Commentaarlocatie gevonden via opgeslagen tekstanker.";
      return;
    }

    if (lastReplyIsFromAgent(c)) {
      const marker = editRoot.querySelector(`.${CHANGE_NEW_CLASS}, .${CHANGE_OLD_CLASS}`) as HTMLElement | null;
      if (marker) {
        marker.scrollIntoView({ block: "center", behavior: "smooth" });
        status.textContent = "Geen exacte commentaarmarkering gevonden; naar agentwijziging gesprongen.";
        return;
      }
    }

    status.textContent = "Kon de commentaarlocatie niet vinden; de tekst is mogelijk door wijzigingen verplaatst.";
  }

  async function acceptAgentChange(c: ReviewComment) {
    try {
      if (editRoot && hasChangeMarkers(editRoot)) {
        stripChangeMarkers(editRoot);
      }
      removeReviewCommentLocally(c);
      await persistReviewCommentsToServer();
      renderReviewList();
      status.textContent = "Akkoord verwerkt: commentaar verwijderd.";
    } catch (e) {
      status.textContent = `Akkoord verwerken mislukt: ${String((e as Error).message)}`;
    }
  }

  async function rejectAgentChange(c: ReviewComment) {
    const name = fileSelect.value;
    if (!name) return;
    if (
      !confirm(
        "Niet akkoord: de laatste opgeslagen vorige versie wordt teruggezet en deze commentaarthread wordt verwijderd. Doorgaan?",
      )
    ) {
      return;
    }
    try {
      const restored = await revertMarkdownToLastBackup(name);
      currentMd = restored.content;
      removeReviewCommentLocally(c);
      await persistReviewCommentsToServer();
      const { html } = renderMarkdown(currentMd);
      if (editRoot) {
        editRoot.innerHTML = html.trim() ? html : "<p><br></p>";
        applyReviewHighlights(editRoot, reviewComments);
        isDirty = false;
      } else {
        await rerenderMarkers();
      }
      renderReviewList();
      status.textContent = "Niet akkoord verwerkt: vorige versie teruggezet en commentaar verwijderd.";
    } catch (e) {
      status.textContent = `Niet akkoord verwerken mislukt: ${String((e as Error).message)}`;
    }
  }

  function renderReviewList() {
    reviewList.replaceChildren();
    for (const c of reviewComments) {
      const card = el("article", "mv-review-card");
      const quoteEl = el("div", "mv-review-card-quote");
      quoteEl.textContent = c.quote.length > 140 ? `${c.quote.slice(0, 140)}…` : c.quote;

      const nMsg = threadMessageCount(c);
      const threadLabel = el("div", "mv-review-card-thread-label");
      threadLabel.textContent =
        nMsg >= 2 ? `Thread · ${nMsg} berichten` : "Eén bericht";

      const rootAuthorIn = document.createElement("input");
      rootAuthorIn.type = "text";
      rootAuthorIn.className = "mv-review-card-author";
      rootAuthorIn.placeholder = "Naam / rol (eerste bericht)";
      rootAuthorIn.value = c.author;

      const metaRoot = el("div", "mv-review-card-meta");
      const rootEdited = c.updatedAt !== c.createdAt;
      metaRoot.textContent = rootEdited
        ? `${formatReviewTs(c.createdAt)} · bewerkt ${formatReviewTs(c.updatedAt)}`
        : formatReviewTs(c.createdAt);

      const bodyTa = document.createElement("textarea");
      bodyTa.className = "mv-review-card-body";
      bodyTa.placeholder = "Eerste commentaar…";
      bodyTa.value = c.body;

      const repliesHost = el("div", "mv-review-replies");
      for (const r of c.replies) {
        const replyWrap = el("div", "mv-review-reply");
        const ra = document.createElement("input");
        ra.type = "text";
        ra.className = "mv-review-card-author mv-review-card-author--reply";
        ra.placeholder = "Naam / rol";
        ra.value = r.author;
        const rm = el("div", "mv-review-card-meta");
        const replyEdited = r.updatedAt !== r.createdAt;
        rm.textContent = replyEdited
          ? `${formatReviewTs(r.createdAt)} · bewerkt ${formatReviewTs(r.updatedAt)}`
          : formatReviewTs(r.createdAt);
        const rt = document.createElement("textarea");
        rt.className = "mv-review-card-body mv-review-card-body--reply";
        rt.value = r.body;
        const replyActs = el("div", "mv-review-card-actions mv-review-card-actions--reply");
        const saveR = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan");
        saveR.type = "button";
        const delR = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Verwijderen");
        delR.type = "button";
        replyActs.append(saveR, delR);
        replyWrap.append(ra, rm, rt, replyActs);

        saveR.addEventListener("click", async () => {
          r.author = ra.value.trim();
          r.body = rt.value.trim();
          r.updatedAt = new Date().toISOString();
          c.updatedAt = new Date().toISOString();
          await persistReviewCommentsToServer();
          renderReviewList();
        });
        delR.addEventListener("click", async () => {
          if (!confirm("Deze reactie verwijderen?")) return;
          c.replies = c.replies.filter((x) => x.id !== r.id);
          c.updatedAt = new Date().toISOString();
          hideReviewPopover();
          await persistReviewCommentsToServer();
          renderReviewList();
        });
        repliesHost.append(replyWrap);
      }

      const newReplyWrap = el("div", "mv-review-new-reply");
      newReplyWrap.append(el("div", "mv-review-new-reply-label", "Nieuwe reactie"));
      const nrAuth = document.createElement("input");
      nrAuth.type = "text";
      nrAuth.className = "mv-review-card-author";
      nrAuth.placeholder = "Jouw naam / rol";
      const nrBody = document.createElement("textarea");
      nrBody.className = "mv-review-card-body mv-review-card-body--compact";
      nrBody.placeholder = "Schrijf een reactie…";
      nrBody.rows = 2;
      const placeReplyBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Plaatsen");
      placeReplyBtn.type = "button";
      newReplyWrap.append(nrAuth, nrBody, placeReplyBtn);

      placeReplyBtn.addEventListener("click", async () => {
        const rb = nrBody.value.trim();
        if (!rb) return;
        c.replies.push(newReviewReply(nrAuth.value, rb));
        c.updatedAt = new Date().toISOString();
        await persistReviewCommentsToServer();
        renderReviewList();
      });

      const cardActions = el("div", "mv-review-card-actions");
      const goBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--ghost", "Toon");
      goBtn.type = "button";
      const saveCardBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary", "Opslaan");
      saveCardBtn.type = "button";
      const delBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Verwijder");
      delBtn.type = "button";
      cardActions.append(goBtn, saveCardBtn, delBtn);

      const decisionActions = el("div", "mv-review-decision-actions");
      if (lastReplyIsFromAgent(c)) {
        const approveBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--primary mv-review-decision-approve", "Akkoord");
        approveBtn.type = "button";
        const rejectBtn = el("button", "mv-ribbon-btn mv-ribbon-btn--table mv-ribbon-btn--danger", "Niet akkoord");
        rejectBtn.type = "button";
        decisionActions.append(
          el("div", "mv-review-decision-note", "Beoordeel de aanpassing van de agent."),
          approveBtn,
          rejectBtn,
        );
        approveBtn.addEventListener("click", () => void acceptAgentChange(c));
        rejectBtn.addEventListener("click", () => void rejectAgentChange(c));
      }

      card.append(
        quoteEl,
        threadLabel,
        rootAuthorIn,
        metaRoot,
        bodyTa,
        repliesHost,
        decisionActions,
        newReplyWrap,
        cardActions,
      );

      goBtn.addEventListener("click", () => {
        showReviewCommentLocation(c);
      });
      saveCardBtn.addEventListener("click", async () => {
        c.author = rootAuthorIn.value.trim();
        c.body = bodyTa.value;
        c.updatedAt = new Date().toISOString();
        await persistReviewCommentsToServer();
        renderReviewList();
      });
      delBtn.addEventListener("click", async () => {
        if (!confirm("Hele thread verwijderen (alle reacties)?")) return;
        if (editRoot) unwrapHighlightById(editRoot, c.id);
        reviewComments = reviewComments.filter((x) => x.id !== c.id);
        hideReviewPopover();
        await persistReviewCommentsToServer();
        renderReviewList();
        editRoot?.dispatchEvent(new Event("input", { bubbles: true }));
      });
      reviewList.append(card);
    }
  }

  document.addEventListener("mousedown", (e) => {
    if (reviewPopover.hidden) return;
    const t = e.target as Node;
    if (reviewPopover.contains(t)) return;
    hideReviewPopover();
  });

  commentAddBtn.addEventListener("mousedown", (e) => e.preventDefault());
  commentAddBtn.addEventListener("click", () => {
    if (!editRoot || !isEditing) return;
    if (!selectionForNewComment()) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!anchorFromSelection(editRoot, r)) return;
    reviewDraftRange = r.cloneRange();
    const q = reviewDraftRange.toString();
    draftQuote.textContent = q.length > 300 ? `${q.slice(0, 300)}…` : q;
    draftTa.value = "";
    reviewDraft.hidden = false;
    draftAuthor.focus();
  });

  draftCancelBtn.addEventListener("click", () => {
    reviewDraftRange = null;
    draftAuthor.value = "";
    reviewDraft.hidden = true;
  });

  draftSaveBtn.addEventListener("click", async () => {
    if (!editRoot || !reviewDraftRange) return;
    if (!editRoot.contains(reviewDraftRange.commonAncestorContainer)) {
      reviewDraftRange = null;
      reviewDraft.hidden = true;
      return;
    }
    const anchor = anchorFromSelection(editRoot, reviewDraftRange);
    if (!anchor) return;
    const body = draftTa.value.trim();
    if (!body) return;
    const c = newReviewComment(anchor.quote, anchor.prefix, anchor.suffix, body, draftAuthor.value);
    reviewComments.push(c);
    if (!wrapRangeWithHighlight(editRoot, reviewDraftRange, c.id)) {
      reviewComments.pop();
      status.textContent = "Kon markering niet plaatsen — probeer eenvoudigere selectie.";
      return;
    }
    reviewDraftRange = null;
    reviewDraft.hidden = true;
    isDirty = true;
    await persistReviewCommentsToServer();
    renderReviewList();
    editRoot.dispatchEvent(new Event("input", { bubbles: true }));
    refreshRibbonState();
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

  function refreshRibbonState() {
    if (!isEditing || !editRoot) return;
    const canInspect = selectionInsideEditor() || document.activeElement === editRoot;
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
    if (!isEditing) return;
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

  async function persistEditor() {
    if (!editRoot || !isEditing) return;
    const name = fileSelect.value;
    if (!name) return;
    try {
      if (hasChangeMarkers(editRoot)) {
        stripChangeMarkers(editRoot);
      }
      syncAnchorsFromDom(editRoot, reviewComments);
      const clone = editRoot.cloneNode(true) as HTMLElement;
      stripChangeMarkers(clone);
      stripReviewHighlights(clone);
      const md = htmlFragmentToMarkdown(clone.innerHTML);
      await saveMarkdownFile(name, md);
      const { reviewRelativePath } = await saveReviewComments(name, reviewComments);
      currentMd = md;
      isDirty = false;
      const tplPart = templatesAvailable ? tplSelect.value : "geen templatebestanden";
      status.textContent = `${name} — opgeslagen — commentaren: ${reviewRelativePath} — ${tplPart}`;
      refreshRibbonState();
    } catch (e) {
      status.textContent = `Opslaan mislukt: ${String((e as Error).message)}`;
    }
  }

  function getMarkdownForExport(): string {
    if (isEditing && editRoot) {
      const clone = editRoot.cloneNode(true) as HTMLElement;
      if (hasChangeMarkers(clone)) stripChangeMarkers(clone);
      stripReviewHighlights(clone);
      return htmlFragmentToMarkdown(clone.innerHTML);
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
    if (name) {
      try {
        reviewComments = await fetchReviewComments(name);
      } catch {
        reviewComments = [];
      }
    }
    const { html } = renderMarkdown(currentMd);
    editRoot.innerHTML = html.trim() ? html : "<p><br></p>";
    applyReviewHighlights(editRoot, reviewComments);
    isDirty = false;
    renderReviewList();
    refreshRibbonState();
  }

  saveBtn.addEventListener("mousedown", (e) => e.preventDefault());
  saveBtn.addEventListener("click", () => void persistEditor());

  discardBtn.addEventListener("mousedown", (e) => e.preventDefault());
  discardBtn.addEventListener("click", () => void revertEditorToCurrentMd());

  function setReviewAgentBusy(busy: boolean) {
    reviewAgentBusy.hidden = !busy;
    reviewPanel.classList.toggle("mv-review-panel--agent-busy", busy);
    if (editRoot) {
      editRoot.setAttribute("contenteditable", busy ? "false" : "true");
      if (busy) {
        editRoot.setAttribute("aria-busy", "true");
      } else {
        editRoot.removeAttribute("aria-busy");
      }
    }
    if (busy) {
      reviewPanel.setAttribute("aria-busy", "true");
    } else {
      reviewPanel.removeAttribute("aria-busy");
    }
  }

  async function buildEditingSurfaceHtml(name: string): Promise<{ html: string; showChangeMarkers: boolean }> {
    const hasPendingAgentReview = reviewComments.some(lastReplyIsFromAgent);
    let html = renderMarkdown(currentMd).html;
    let showChangeMarkers = false;
    if (hasPendingAgentReview) {
      try {
        const backupMd = await fetchMarkdownBackupFile(name);
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

  async function refreshEditSurfaceAfterDataLoad() {
    const name = fileSelect.value;
    if (!name || !editRoot || !isEditing) return;
    const { html, showChangeMarkers } = await buildEditingSurfaceHtml(name);
    editRoot.innerHTML = html.trim() ? html : "<p><br></p>";
    hideReviewPopover();
    if (showChangeMarkers) {
      editRoot.classList.add("mv-prose--change-review");
      status.textContent = "Wijzigingen zichtbaar: rood = oude tekst, groen = nieuwe tekst.";
    } else {
      editRoot.classList.remove("mv-prose--change-review");
      applyReviewHighlights(editRoot, reviewComments);
    }
    isDirty = false;
    renderReviewList();
    refreshRibbonState();
    refreshTemplateVars();
  }

  async function enterEditMode() {
    const name = fileSelect.value;
    if (!name) return;

    isEditing = true;
    isDirty = false;
    ribbon.hidden = false;
    editToggleBtn.textContent = "Bekijken";
    editToggleBtn.classList.add("is-on");

    fileSelect.disabled = true;
    tplSelect.disabled = true;
    printBtn.disabled = true;

    coverSection.hidden = true;
    coverSection.innerHTML = "";
    tocHost.replaceChildren();
    tocHost.hidden = true;
    endSection.hidden = true;
    endSection.innerHTML = "";

    const { html, showChangeMarkers } = await buildEditingSurfaceHtml(name);
    proseHost.replaceChildren();
    const art = el("article", "mv-page mv-page--editing");
    const surface = el("div", "mv-prose mv-prose--editable");
    surface.contentEditable = "true";
    surface.setAttribute("spellcheck", "true");
    surface.setAttribute("role", "textbox");
    surface.setAttribute("aria-label", "Documenttekst");
    surface.setAttribute("aria-multiline", "true");
    surface.innerHTML = html.trim() ? html : "<p><br></p>";
    if (showChangeMarkers) {
      surface.classList.add("mv-prose--change-review");
      status.textContent = "Wijzigingen zichtbaar: rood = oude tekst, groen = nieuwe tekst.";
    } else {
      applyReviewHighlights(surface, reviewComments);
    }
    renderReviewList();
    reviewPanel.hidden = false;

    const onInput = () => {
      isDirty = true;
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
        void persistEditor();
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
          const tcell = getActiveTableCell(surface);
          if (tcell && focusAdjacentTableCell(tcell, e.shiftKey ? -1 : 1)) {
            e.preventDefault();
            refreshRibbonState();
          }
        }
      }
    };

    surface.addEventListener("input", onInput);
    surface.addEventListener("keydown", onKeydown);
    surface.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest(`.${REVIEW_HIGHLIGHT_CLASS}`);
      if (!t || !surface.contains(t)) return;
      e.stopPropagation();
      showReviewPopover(t as HTMLElement);
    });

    art.append(surface);
    proseHost.append(art);
    editRoot = surface;

    stack.classList.add("mv-stack--editing");
    refreshTemplateVars();
    refreshRibbonState();
    surface.focus();
  }

  function exitEditMode() {
    if (!isEditing) return;
    isEditing = false;
    isDirty = false;
    ribbon.hidden = true;
    hideReviewPopover();
    reviewDraft.hidden = true;
    reviewDraftRange = null;
    reviewPanel.hidden = true;
    editToggleBtn.textContent = "Bewerken";
    editToggleBtn.classList.remove("is-on");

    fileSelect.disabled = false;
    tplSelect.disabled = !templatesAvailable;
    printBtn.disabled = false;
    tocHost.hidden = false;
    editRoot = null;

    stack.classList.remove("mv-stack--editing");
    void rerenderMarkers();
  }

  async function tryExitEditMode() {
    if (!isEditing) return;
    if (isDirty) {
      const ok = confirm(
        "Je hebt niet-opgeslagen wijzigingen. Toch naar bekijken zonder op te slaan?",
      );
      if (!ok) return;
    }
    exitEditMode();
  }

  window.addEventListener("beforeunload", (e) => {
    if (isEditing && isDirty) {
      e.preventDefault();
    }
  });

  editToggleBtn.addEventListener("click", () => {
    if (!isEditing) {
      void enterEditMode();
      return;
    }
    void tryExitEditMode();
  });

  async function rerenderMarkers() {
    const merged = mergeTemplate(defaultTemplate, currentMerged);

    refreshTemplateVars();

    const coverCfg = merged.cover || {};
    if (coverCfg.enabled) {
      coverSection.hidden = false;
      coverSection.innerHTML = "";
      if (coverCfg.subtitleText && coverCfg.subtitleText.trim()) {
        coverSection.append(el("div", "mv-cover-label", coverCfg.subtitleText.trim()));
      }
      const titleEl = el("h1", "mv-cover-title");
      const pickedTitle = coverCfg.showDocumentTitle
        ? firstHeadingText(currentMd) || fileSelect.value.replace(/\.md$/i, "")
        : (coverCfg.subtitleText?.trim() || fileSelect.value.replace(/\.md$/i, ""));
      titleEl.textContent = pickedTitle;
      coverSection.append(titleEl);
      if (coverCfg.metaText) {
        coverSection.append(el("div", "mv-cover-meta", coverCfg.metaText));
      }
    } else {
      coverSection.hidden = true;
      coverSection.innerHTML = "";
    }

    const tocCfg = merged.toc || {};
    tocHost.replaceChildren();
    const { html, toc } = renderMarkdown(currentMd);
    if (tocCfg.enabled) {
      const screen = merged.screen || {};
      const useVisualSheets = screen.visualPageBreaks !== false;
      const tocPage = el(
        "article",
        useVisualSheets ? "mv-page mv-page--sheet mv-page--toc" : "mv-page mv-page--toc",
      );
      tocPage.append(buildTocList(toc, tocCfg.heading || "Inhoudsopgave"));
      tocHost.append(tocPage);
    }
    mountProseArtifacts(merged, html, proseHost);

    const endCfg = merged.endPage || {};
    if (endCfg.enabled) {
      endSection.hidden = false;
      endSection.innerHTML = "";
      const t = endCfg.titleText || "Einde document";
      const title = el("h2", "mv-end-title", t);
      endSection.append(title);
      if (endCfg.bodyText) {
        const p = el("p", "mv-end-body", endCfg.bodyText);
        endSection.append(p);
      }
    } else {
      endSection.hidden = true;
      endSection.innerHTML = "";
    }
  }

  async function loadLists(preferredMd?: string) {
    const [index, templates] = await Promise.all([fetchMarkdownIndex(), fetchTemplateFiles()]);
    const mdFiles = index.files;
    const mdFolders = index.folders;
    lastMarkdownFiles = mdFiles;
    lastMarkdownFolders = mdFolders;
    lastMarkdownFileDetails = index.fileDetails;
    fileSelect.replaceChildren();
    tplSelect.replaceChildren();
    for (const f of mdFiles) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      fileSelect.append(o);
    }
    for (const t of templates) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      tplSelect.append(o);
    }

    status.textContent = `${mdFiles.length} markdown-bestand(en); ${templates.length} template(s).`;

    templatesAvailable = templates.length > 0;
    tplSelect.disabled = !templatesAvailable;
    if (isEditing) tplSelect.disabled = true;

    const pickMd = preferredMd && mdFiles.includes(preferredMd)
      ? preferredMd
      : mdFiles.includes("Applicatie_Dienstverlening.md")
      ? "Applicatie_Dienstverlening.md"
      : mdFiles[0];
    if (pickMd) fileSelect.value = pickMd;
    if (pickMd) selectedFolder = folderOfMarkdownPath(pickMd);

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
    if (!fileManagerDialog.hidden) renderFileManagerPopup();
  }

  async function loadDocumentData(name: string, tplName: string): Promise<void> {
    currentMd = await fetchMarkdownFile(name);
    try {
      reviewComments = await fetchReviewComments(name);
    } catch {
      reviewComments = [];
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

  async function loadSelection() {
    const name = fileSelect.value;
    const tplName = tplSelect.value;
    if (!name) {
      tocHost.replaceChildren();
      coverSection.hidden = true;
      coverSection.innerHTML = "";
      endSection.hidden = true;
      endSection.innerHTML = "";
      mountProseArtifacts(mergeTemplate(defaultTemplate, currentMerged), "", proseHost);
      status.textContent = "Geen .md gevonden — zet ze in Files/ en herstart.";
      editToggleBtn.disabled = true;
      reviewComments = [];
      syncToolbarDocTitle();
      return;
    }
    editToggleBtn.disabled = false;
    await loadDocumentData(name, tplName);
    await rerenderMarkers();
    syncToolbarDocTitle();
  }

  async function runAgentForCurrentDocument() {
    const name = fileSelect.value;
    if (!name) return;
    if (isEditing && isDirty) {
      status.textContent = "Sla eerst je wijzigingen op voordat je de agent uitvoert.";
      return;
    }
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
      const wasEditing = isEditing;
      panelAgentRunBtn.disabled = true;
      setReviewAgentBusy(true);
      status.textContent = "Agent verwerkt opmerkingen…";
      const result = await runAgent(name);
      await loadDocumentData(name, tplSelect.value);
      if (wasEditing && editRoot) {
        await refreshEditSurfaceAfterDataLoad();
      } else {
        await rerenderMarkers();
      }
      syncToolbarDocTitle();
      status.textContent =
        result.processed === 0
          ? `${name} — geen commentaren om te verwerken (${result.skipped} overgeslagen: al door agent beantwoord of zonder tekst/citaat).`
          : `${name} — agent klaar: ${result.processed} verwerkt, ` +
            `${result.changed} patch(es), ${result.failed} fout(en), ${result.skipped} overgeslagen.`;
    } catch (e) {
      status.textContent = `Agent uitvoeren mislukt: ${String((e as Error).message)}`;
    } finally {
      setReviewAgentBusy(false);
      panelAgentRunBtn.disabled = false;
    }
  }

  fileSelect.addEventListener("change", () => {
    selectedFolder = folderOfMarkdownPath(fileSelect.value);
    void loadSelection();
    if (!fileManagerDialog.hidden) renderFileManagerPopup();
  });
  tplSelect.addEventListener("change", () => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, tplSelect.value);
    } catch {
      /* private mode / storage disabled */
    }
    void loadSelection();
  });
  popupNewFolderBtn.addEventListener("click", async () => {
    const raw = prompt("Nieuwe mapnaam of pad", selectedFolder ? `${selectedFolder}/` : "");
    if (raw === null) return;
    const folder = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!folder || folder.includes("..") || folder.split("/").some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) {
      status.textContent = "Ongeldige mapnaam.";
      return;
    }
    try {
      await createMarkdownFolder(folder);
      selectedFolder = folder;
      status.textContent = `Map aangemaakt: ${displayFolder(folder)}`;
      await loadLists(fileSelect.value || undefined);
      if (!fileManagerDialog.hidden) renderFileManagerPopup();
    } catch (e) {
      status.textContent = `Map aanmaken mislukt: ${String((e as Error).message)}`;
    }
  });
  popupDeleteFolderBtn.addEventListener("click", async () => {
    if (!selectedFolder) {
      status.textContent = "Kies een map (niet root) om een lege map te verwijderen.";
      return;
    }
    if (
      !confirm(
        `Lege map verwijderen: ${displayFolder(selectedFolder)}? Alleen als de map echt leeg is.`,
      )
    ) {
      return;
    }
    try {
      await deleteEmptyMarkdownFolder(selectedFolder);
      status.textContent = `Map verwijderd: ${displayFolder(selectedFolder)}`;
      selectedFolder = folderOfMarkdownPath(fileSelect.value);
      await loadLists(fileSelect.value || undefined);
      if (!fileManagerDialog.hidden) renderFileManagerPopup();
    } catch (e) {
      status.textContent = `Map verwijderen mislukt: ${String((e as Error).message)}`;
    }
  });
  popupSortSelect.addEventListener("change", () => {
    applySortSelectionFromSelect();
    if (!fileManagerDialog.hidden) renderFileManagerPopup();
  });
  browseFilesBtn.addEventListener("click", () => showFileManagerDialog());
  fileManagerCloseBtn.addEventListener("click", () => hideFileManagerDialog());
  fileManagerDialog.addEventListener("mousedown", (e) => {
    if (e.target === fileManagerDialog) hideFileManagerDialog();
  });
  uploadMdInput.addEventListener("change", () => {
    const file = uploadMdInput.files?.[0];
    uploadMdInput.value = "";
    if (!file) return;
    const name = normalizeMarkdownFileName(joinMarkdownPath(selectedFolder, file.name));
    if (!name) {
      status.textContent = "Upload geweigerd: kies een geldig .md-bestand.";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      void createOrReplaceMarkdownFile(name, content);
    });
    reader.addEventListener("error", () => {
      status.textContent = `Upload lezen mislukt: ${file.name}`;
    });
    reader.readAsText(file);
  });
  mdStringCancelBtn.addEventListener("click", () => hideMarkdownStringDialog());
  mdStringDialog.addEventListener("mousedown", (e) => {
    if (e.target === mdStringDialog) hideMarkdownStringDialog();
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
  settingsLogsRefreshBtn.addEventListener("click", () => void refreshSettingsAgentLogs());
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
  wordExportBtn.addEventListener("click", () => void showDocxExportDialog());
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
      let meta: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(docxMetadataTa.value || "{}") as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("metadata moet een JSON-object zijn");
        }
        meta = parsed as Record<string, unknown>;
      } catch (e) {
        status.textContent = `Ongeldige metadata-JSON: ${String((e as Error).message)}`;
        return;
      }
      const name = fileSelect.value.trim();
      const downloadName = suggestedDocxDownloadName(name);
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
  panelAgentRunBtn.addEventListener("click", () => void runAgentForCurrentDocument());
  popupUploadBtn.addEventListener("click", () => uploadMdInput.click());
  popupPasteBtn.addEventListener("click", () => showMarkdownStringDialog());
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
