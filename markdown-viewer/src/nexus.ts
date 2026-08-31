import "./nexus.css";
import {
  agentChat,
  fetchMarkdownFile,
  fetchMarkdownFileResolved,
  fetchMarkdownIndex,
  saveMarkdownFile,
  searchCorpus,
  type AgentChatMode,
  type AgentChatTurn,
  type CorpusSearchResult,
  type MarkdownFileDetail,
} from "./api";
import { renderMarkdown } from "./markdown";

type Command = {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fileTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() || path;
  return name.replace(/\.md$/i, "");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const app = document.querySelector<HTMLDivElement>("#nexus-app");
if (!app) throw new Error("nexus-app ontbreekt");

document.body.classList.add("nx-body");

let files: MarkdownFileDetail[] = [];
let activePath = "";
let currentMarkdown = "";
let savedMarkdown = "";
let filter = "";
let corpusSearchResults: CorpusSearchResult[] = [];
let corpusSearchTimer: ReturnType<typeof setTimeout> | null = null;
let chatHistory: AgentChatTurn[] = [];
let busy = false;

const shell = el("main", "nx-shell");
const topbar = el("header", "nx-topbar");
const brand = el("div", "nx-brand");
brand.append(el("span", "nx-brand-mark", "N"), el("span", "", "Nexus Editor"));

const searchWrap = el("div", "nx-search");
const commandBtn = el("button", "nx-command-btn", "Zoek in corpus… Ctrl+K");
commandBtn.type = "button";
searchWrap.append(commandBtn);

const topActions = el("div", "nx-top-actions");
const saveBtn = el("button", "nx-btn nx-btn--primary", "Save");
saveBtn.type = "button";
const askBtn = el("button", "nx-btn", "Ask AI");
askBtn.type = "button";
const agentBtn = el("button", "nx-btn nx-btn--accent", "Action");
agentBtn.type = "button";
topActions.append(saveBtn, askBtn, agentBtn);
topbar.append(brand, searchWrap, topActions);

const sidebar = el("aside", "nx-sidebar");
const sidebarHead = el("div", "nx-panel-head");
sidebarHead.append(el("div", "nx-panel-title nx-panel-title--files", "Files"));
const collapseLeftBtn = el("button", "nx-icon-btn", "‹");
collapseLeftBtn.type = "button";
collapseLeftBtn.title = "Toggle file explorer";
sidebarHead.append(collapseLeftBtn);
const sidebarBody = el("div", "nx-sidebar-body");
const fileFilter = document.createElement("input");
fileFilter.className = "nx-file-filter";
fileFilter.placeholder = "Filter markdown files";
fileFilter.setAttribute("aria-label", "Filter bestanden");
const fileList = el("div", "nx-file-list");
sidebarBody.append(fileFilter, fileList);
sidebar.append(sidebarHead, sidebarBody);

const main = el("section", "nx-main");
const editorWrap = el("div", "nx-editor-wrap");
const docMeta = el("div", "nx-doc-meta");
const docTitle = el("h1", "nx-doc-title", "Geen document geselecteerd");
const status = el("div", "nx-status", "Laden...");
docMeta.append(docTitle, status);

const editorSurface = el("div", "nx-editor-surface");
const editor = document.createElement("textarea");
editor.className = "nx-editor";
editor.spellcheck = false;
editor.placeholder = "Kies links een Markdown-document om te starten.";
editor.setAttribute("aria-label", "Markdown editor");

const floatingToolbar = el("div", "nx-floating-toolbar");
const boldBtn = el("button", "nx-format-btn", "B");
boldBtn.type = "button";
boldBtn.title = "Bold";
const italicBtn = el("button", "nx-format-btn", "I");
italicBtn.type = "button";
italicBtn.title = "Italic";
const linkBtn = el("button", "nx-format-btn", "Link");
linkBtn.type = "button";
const codeBtn = el("button", "nx-format-btn", "Code");
codeBtn.type = "button";
const aiDraftBtn = el("button", "nx-format-btn nx-ai-draft", "AI Draft");
aiDraftBtn.type = "button";
floatingToolbar.append(boldBtn, italicBtn, linkBtn, codeBtn, aiDraftBtn);
editorSurface.append(editor, floatingToolbar);
editorWrap.append(docMeta, editorSurface);
main.append(editorWrap);

const selectionPop = el("div", "nx-selection-pop");
selectionPop.hidden = true;
for (const [label, prompt] of [
  ["Samenvatten", "Vat de geselecteerde tekst samen en vervang alleen de selectie."],
  ["Uitbreiden", "Werk de geselecteerde tekst concreter uit en vervang alleen de selectie."],
  ["Herschrijven", "Herschrijf de geselecteerde tekst helderder en vervang alleen de selectie."],
] as const) {
  const btn = el("button", "nx-btn", label);
  btn.type = "button";
  btn.addEventListener("click", () => runSelectionAction(prompt));
  selectionPop.append(btn);
}

const chat = el("aside", "nx-chat");
const chatHead = el("div", "nx-panel-head");
chatHead.append(el("div", "nx-panel-title nx-panel-title--chat", "LLM Chat Assistant"));
const collapseChatBtn = el("button", "nx-icon-btn", "›");
collapseChatBtn.type = "button";
collapseChatBtn.title = "Toggle chat assistant";
chatHead.append(collapseChatBtn);
const chatBody = el("div", "nx-chat-body");
const messages = el("div", "nx-chat-messages");
const composer = el("form", "nx-chat-composer");
const attachBtn = el("button", "nx-icon-btn", "⌁");
attachBtn.type = "button";
attachBtn.title = "Attach context";
const chatInput = document.createElement("textarea");
chatInput.className = "nx-chat-input";
chatInput.rows = 1;
chatInput.placeholder = "Vraag de assistant of typ een instructie...";
chatInput.setAttribute("aria-label", "Chatbericht");
const sendBtn = el("button", "nx-icon-btn nx-btn--accent", "➤");
sendBtn.type = "submit";
composer.append(attachBtn, chatInput, sendBtn);
chatBody.append(messages, composer);
chat.append(chatHead, chatBody);

const commandOverlay = el("div", "nx-command-overlay");
commandOverlay.hidden = true;
const palette = el("div", "nx-palette");
const paletteInput = document.createElement("input");
paletteInput.placeholder = "Zoek op onderwerp, titel of bestandsnaam…";
paletteInput.setAttribute("aria-label", "Command palette");
const commandList = el("div", "nx-command-list");
palette.append(paletteInput, commandList);
commandOverlay.append(palette);

shell.append(topbar, sidebar, main, chat);
app.append(shell, selectionPop, commandOverlay);

function dirty(): boolean {
  return currentMarkdown !== savedMarkdown;
}

function setStatus(text: string): void {
  status.textContent = dirty() ? `${text} · unsaved changes` : text;
}

function setBusy(next: boolean): void {
  busy = next;
  for (const node of [saveBtn, askBtn, agentBtn, sendBtn, aiDraftBtn]) node.disabled = next;
  editor.disabled = next;
  chatInput.disabled = next;
}

function renderFiles(): void {
  const q = filter.trim().toLowerCase();
  const visible = files.filter((f) => !q || f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q));
  fileList.replaceChildren();
  if (!visible.length) {
    fileList.append(el("div", "nx-status", "Geen bestanden gevonden."));
    return;
  }
  for (const file of visible) {
    const btn = el("button", `nx-file${file.name === activePath ? " is-active" : ""}`);
    btn.type = "button";
    btn.title = `${file.name}${file.size ? ` · ${formatBytes(file.size)}` : ""}`;
    btn.textContent = file.name;
    btn.addEventListener("click", () => openFile(file.name));
    fileList.append(btn);
  }
}

function renderChat(): void {
  messages.replaceChildren();
  if (!chatHistory.length) {
    const empty = el("div", "nx-status", "De assistant gebruikt het geopende document als context.");
    messages.append(empty);
    return;
  }
  for (const turn of chatHistory) {
    const msg = el("article", `nx-msg nx-msg--${turn.role}`);
    msg.append(el("div", "nx-msg-avatar", turn.role === "user" ? "J" : "AI"));
    const bubble = el("div", "nx-msg-bubble");
    if (turn.role === "assistant") {
      bubble.innerHTML = renderMarkdown(turn.content).html;
    } else {
      bubble.textContent = turn.content;
    }
    msg.append(bubble);
    messages.append(msg);
  }
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

async function maybeSaveBeforeSwitch(): Promise<boolean> {
  if (!dirty()) return true;
  const ok = window.confirm("Je hebt niet-opgeslagen wijzigingen. Eerst opslaan?");
  if (!ok) return false;
  await saveActiveFile();
  return true;
}

async function loadFiles(): Promise<void> {
  setStatus("Bestanden laden...");
  const index = await fetchMarkdownIndex();
  const details = index.fileDetails.length
    ? index.fileDetails
    : index.files.map((name) => ({ name, folder: name.includes("/") ? name.split("/").slice(0, -1).join("/") : "", size: 0, mtimeMs: 0 }));
  files = details.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  renderFiles();
  if (!activePath && files[0]) await openFile(files[0].name);
}

async function openFile(path: string): Promise<void> {
  if (path === activePath) return;
  if (!(await maybeSaveBeforeSwitch())) return;
  setBusy(true);
  try {
    const resolved = await fetchMarkdownFileResolved(path);
    activePath = resolved.path;
    currentMarkdown = resolved.content;
    savedMarkdown = currentMarkdown;
    editor.value = currentMarkdown;
    docTitle.textContent = fileTitle(resolved.path);
    editor.placeholder = "";
    renderFiles();
    setStatus(resolved.path === path ? resolved.path : `${resolved.path} (via ${path})`);
  } catch (e) {
    setStatus(`Openen mislukt: ${(e as Error).message}`);
  } finally {
    setBusy(false);
  }
}

async function saveActiveFile(): Promise<void> {
  if (!activePath) return;
  setBusy(true);
  try {
    const saved = await saveMarkdownFile(activePath, editor.value);
    if (saved.movedTo && saved.movedTo !== activePath) {
      activePath = saved.movedTo;
      docTitle.textContent = fileTitle(activePath);
      await loadFiles();
    }
    currentMarkdown = editor.value;
    savedMarkdown = editor.value;
    setStatus(saved.movedTo ? `Verplaatst en opgeslagen: ${activePath}` : `Opgeslagen: ${activePath}`);
  } catch (e) {
    setStatus(`Opslaan mislukt: ${(e as Error).message}`);
  } finally {
    setBusy(false);
  }
}

function selectedText(): string {
  return editor.value.slice(editor.selectionStart, editor.selectionEnd);
}

function replaceSelection(replacement: string): void {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.setRangeText(replacement, start, end, "select");
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.focus();
}

function wrapSelection(prefix: string, suffix = prefix): void {
  const text = selectedText() || "tekst";
  replaceSelection(`${prefix}${text}${suffix}`);
}

function updateSelectionPopover(): void {
  const hasSelection = editor.selectionStart !== editor.selectionEnd && !!selectedText().trim();
  selectionPop.hidden = !hasSelection;
  if (!hasSelection) return;
  const rect = editor.getBoundingClientRect();
  selectionPop.style.left = `${Math.min(rect.right - 310, Math.max(rect.left + 24, window.innerWidth / 2 - 160))}px`;
  selectionPop.style.top = `${Math.max(rect.top + 64, rect.bottom - 144)}px`;
}

async function runAi(mode: AgentChatMode, message: string): Promise<void> {
  if (!message.trim()) return;
  setBusy(true);
  chatHistory.push({ role: "user", content: message, mode });
  renderChat();
  try {
    const response = await agentChat({
      mode,
      message,
      markdown: editor.value,
      name: activePath || undefined,
      history: chatHistory.slice(0, -1),
      corpusWide: mode === "ask",
      activityStream: true,
    });
    chatHistory.push({ role: "assistant", content: response.reply || "Klaar.", mode });
    if (mode === "agent" && typeof response.markdown === "string" && response.markdown !== editor.value) {
      editor.value = response.markdown;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setStatus(response.changed ? "AI heeft een wijziging voorgesteld." : activePath || "AI klaar");
  } catch (e) {
    chatHistory.push({ role: "assistant", content: `Fout: ${(e as Error).message}`, mode });
    setStatus(`AI mislukt: ${(e as Error).message}`);
  } finally {
    renderChat();
    setBusy(false);
  }
}

async function runSelectionAction(instruction: string): Promise<void> {
  const quote = selectedText().trim();
  if (!quote) return;
  selectionPop.hidden = true;
  await runAi("agent", `${instruction}\n\nSelectie:\n${quote}`);
}

function aiDraft(): void {
  const prompt = selectedText().trim()
    ? "Maak een betere conceptversie van de geselecteerde tekst en vervang alleen die selectie."
    : "Maak een betere conceptversie van het huidige document. Behoud de Markdown-structuur.";
  void runAi("agent", prompt);
}

function openCommandPalette(): void {
  commandOverlay.hidden = false;
  paletteInput.value = "";
  corpusSearchResults = [];
  renderCommands();
  requestAnimationFrame(() => paletteInput.focus());
}

function closeCommandPalette(): void {
  commandOverlay.hidden = true;
}

function commands(): Command[] {
  return [
    { id: "save", label: "Save current document", hint: "Schrijf het huidige Markdown-bestand weg", run: saveActiveFile },
    { id: "toggle-left", label: "Toggle file explorer", hint: "Open/sluit de linker zijbalk", run: toggleLeft },
    { id: "toggle-chat", label: "Toggle assistant", hint: "Open/sluit het rechter chatpaneel", run: toggleChat },
    { id: "ask", label: "Ask AI about current document", hint: "Stel een vraag in Ask mode", run: () => chatInput.focus() },
    { id: "draft", label: "AI Draft", hint: "Laat Agent mode het document verbeteren", run: aiDraft },
    ...files.map((file) => ({
      id: `file:${file.name}`,
      label: file.name,
      hint: "Open Markdown-bestand",
      run: () => openFile(file.name),
    })),
  ];
}

function scheduleCorpusSearch(query: string): void {
  if (corpusSearchTimer) clearTimeout(corpusSearchTimer);
  const q = query.trim();
  if (q.length < 2) {
    corpusSearchResults = [];
    renderCommands();
    return;
  }
  corpusSearchTimer = setTimeout(() => {
    corpusSearchTimer = null;
    void searchCorpus(q, { limit: 12, scope: "both" })
      .then((payload) => {
        corpusSearchResults = payload.results || [];
        renderCommands();
      })
      .catch(() => {
        corpusSearchResults = [];
        renderCommands();
      });
  }, 180);
}

function renderCommands(): void {
  const q = paletteInput.value.trim().toLowerCase();
  const visible = commands().filter((cmd) => !q || cmd.label.toLowerCase().includes(q) || cmd.hint.toLowerCase().includes(q));
  commandList.replaceChildren();

  if (q.length >= 2 && corpusSearchResults.length) {
    const heading = el("div", "nx-command-section", "Corpus");
    commandList.append(heading);
    for (const hit of corpusSearchResults.slice(0, 12)) {
      const openPath = hit.isRedirect && hit.redirectTo ? hit.redirectTo : hit.path;
      const item = el("button", "nx-command-item");
      item.type = "button";
      const scopeLabel = hit.scope === "memory" ? "memory" : "werk";
      item.innerHTML = `<strong>${hit.title}</strong><br><span>${scopeLabel} · ${openPath}${hit.docId ? ` · ${hit.docId}` : ""}</span>`;
      item.addEventListener("click", async () => {
        closeCommandPalette();
        if (hit.scope === "memory") {
          window.location.href = `/?memory=${encodeURIComponent(openPath)}`;
          return;
        }
        await openFile(openPath);
      });
      commandList.append(item);
    }
  }

  if (visible.length) {
    if (q.length >= 2 && corpusSearchResults.length) {
      commandList.append(el("div", "nx-command-section", "Commando's & bestanden"));
    }
    for (const cmd of visible.slice(0, 40)) {
      const item = el("button", "nx-command-item");
      item.type = "button";
      item.innerHTML = `<strong>${cmd.label}</strong><br><span>${cmd.hint}</span>`;
      item.addEventListener("click", async () => {
        closeCommandPalette();
        await cmd.run();
      });
      commandList.append(item);
    }
  } else if (!corpusSearchResults.length) {
    commandList.append(el("div", "nx-status", "Geen resultaten."));
  }
}

function toggleLeft(): void {
  shell.classList.toggle("is-left-collapsed");
  collapseLeftBtn.textContent = shell.classList.contains("is-left-collapsed") ? "›" : "‹";
}

function toggleChat(): void {
  shell.classList.toggle("is-chat-collapsed");
  collapseChatBtn.textContent = shell.classList.contains("is-chat-collapsed") ? "‹" : "›";
}

editor.addEventListener("input", () => {
  currentMarkdown = editor.value;
  setStatus(activePath || "Nieuw document");
});
editor.addEventListener("select", updateSelectionPopover);
editor.addEventListener("keyup", updateSelectionPopover);
editor.addEventListener("mouseup", updateSelectionPopover);

fileFilter.addEventListener("input", () => {
  filter = fileFilter.value;
  renderFiles();
});
saveBtn.addEventListener("click", () => void saveActiveFile());
askBtn.addEventListener("click", () => chatInput.focus());
agentBtn.addEventListener("click", aiDraft);
aiDraftBtn.addEventListener("click", aiDraft);
boldBtn.addEventListener("click", () => wrapSelection("**"));
italicBtn.addEventListener("click", () => wrapSelection("_"));
linkBtn.addEventListener("click", () => wrapSelection("[", "](https://)"));
codeBtn.addEventListener("click", () => wrapSelection("`"));
collapseLeftBtn.addEventListener("click", toggleLeft);
collapseChatBtn.addEventListener("click", toggleChat);
commandBtn.addEventListener("click", openCommandPalette);
paletteInput.addEventListener("input", () => {
  scheduleCorpusSearch(paletteInput.value);
  renderCommands();
});
commandOverlay.addEventListener("mousedown", (ev) => {
  if (ev.target === commandOverlay) closeCommandPalette();
});

composer.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const message = chatInput.value.trim();
  chatInput.value = "";
  void runAi("ask", message);
});

window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if ((ev.metaKey || ev.ctrlKey) && key === "k") {
    ev.preventDefault();
    openCommandPalette();
  } else if ((ev.metaKey || ev.ctrlKey) && key === "s") {
    ev.preventDefault();
    void saveActiveFile();
  } else if (ev.key === "Escape") {
    closeCommandPalette();
    selectionPop.hidden = true;
  }
});

renderChat();
setBusy(true);
loadFiles()
  .catch((e) => {
    setStatus(`Laden mislukt: ${(e as Error).message}`);
  })
  .finally(() => setBusy(false));
