import "./style.css";
import {
  agentChat,
  createAgentChatSession,
  fetchAgentChatSessions,
  rebuildCorpusIndex,
  updateAgentChatSession,
  type AgentChatSession,
  type AgentChatTurn,
  type AgentPerformanceMetrics,
  type CorpusActivityEvent,
} from "./api";
import { renderMarkdown } from "./markdown";

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

function normalizeTurns(messages: AgentChatTurn[] | undefined): AgentChatTurn[] {
  return (messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && !!m.content.trim());
}

function chatTitleFrom(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "Nieuwe chat";
  return compact.length > 54 ? `${compact.slice(0, 54)}...` : compact;
}

function activityText(ev: CorpusActivityEvent): string {
  if (ev.label) return ev.label;
  if (ev.phase === "read_file" && ev.path) return `Leest ${ev.path}`;
  if (ev.phase === "read_outline" && ev.path) return `Leest koppen van ${ev.path}`;
  if (ev.phase === "read_section" && ev.path) return `Leest sectie uit ${ev.path}`;
  if (ev.phase === "read_memory_outline" && ev.path) return `Leest memory-koppen van ${ev.path}`;
  if (ev.phase === "read_memory_section" && ev.path) return `Leest memory-sectie uit ${ev.path}`;
  if (ev.phase === "tool_call" && ev.path) return `Gebruikt ${ev.path}`;
  if (ev.phase === "web_search") return "Zoekt op internet";
  if (ev.phase === "model_switch" && ev.model) {
    const role = ev.modelRole || ev.label || "model";
    return `Model (${role}): ${ev.model}`;
  }
  if (ev.model && ev.phase === "thinking") return `${ev.label || "Denkt na"} [${ev.model}]`;
  return ev.path ? `${ev.phase || "Activiteit"}: ${ev.path}` : ev.phase || "Corpus wordt geraadpleegd";
}

function formatMetricNumber(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? new Intl.NumberFormat("nl-NL").format(Math.round(n)) : "n/a";
}

function formatDurationMs(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "n/a";
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${Math.round(ms)}ms`;
}

function formatPerformanceStatus(metrics?: AgentPerformanceMetrics): string {
  if (!metrics) return "";
  const actualTokens = metrics.tokenUsage?.totalTokens;
  const tokenText =
    typeof actualTokens === "number" && actualTokens > 0
      ? `${formatMetricNumber(actualTokens)} tokens`
      : `~${formatMetricNumber(metrics.approxContextTokens)} contexttokens`;
  return `Klaar in ${formatDurationMs(metrics.durationMs)} · LLM ${formatDurationMs(metrics.llmMs)} · ${formatMetricNumber(metrics.toolCallCount)} toolactie(s) · ${tokenText}`;
}

const app = document.querySelector<HTMLDivElement>("#chat-app");
if (!app) throw new Error("chat-app ontbreekt");

document.body.classList.add("mv-chat-only-body");

let sessions: AgentChatSession[] = [];
let activeChatId = "";
let history: AgentChatTurn[] = [];
let busy = false;

const shell = el("main", "mv-chatonly");
const header = el("header", "mv-chatonly-header");
const brand = el("div", "mv-chatonly-brand");
brand.append(el("div", "mv-chatonly-kicker", "iOMS"), el("h1", "mv-chatonly-title", "Chat"));
const headerActions = el("div", "mv-chatonly-actions");
const sessionSelect = document.createElement("select");
sessionSelect.className = "mv-chatonly-select";
sessionSelect.setAttribute("aria-label", "Chat kiezen");
const newChatBtn = el("button", "mv-chatonly-icon-btn", "Nieuw");
newChatBtn.type = "button";
const refreshCorpusBtn = el("button", "mv-chatonly-icon-btn", "Corpus");
refreshCorpusBtn.type = "button";
refreshCorpusBtn.title = "Corpusinformatie verversen";
headerActions.append(sessionSelect, newChatBtn, refreshCorpusBtn);
header.append(brand, headerActions);

const status = el("div", "mv-chatonly-status", "Ask-only met corpus, long-term memory en internetzoekfunctie");
const messages = el("section", "mv-chatonly-messages");
messages.setAttribute("aria-live", "polite");
const activity = el("div", "mv-chatonly-activity");
activity.hidden = true;

const composer = el("form", "mv-chatonly-composer");
const input = document.createElement("textarea");
input.className = "mv-chatonly-input";
input.rows = 1;
input.placeholder = "Stel een vraag of vertel iets dat de agent mag onthouden...";
input.setAttribute("aria-label", "Bericht");
const sendBtn = el("button", "mv-chatonly-send", "Verstuur");
sendBtn.type = "submit";
composer.append(input, sendBtn);

shell.append(header, status, messages, activity, composer);
app.append(shell);

function setBusy(next: boolean): void {
  busy = next;
  input.disabled = next;
  sendBtn.disabled = next;
  newChatBtn.disabled = next;
  refreshCorpusBtn.disabled = next;
  sessionSelect.disabled = next || sessions.length === 0;
}

function renderWebSearchState(): void {
  status.textContent = "Ask-only met corpus, long-term memory en internetzoekfunctie";
}

function scrollToBottom(): void {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function renderMessage(turn: AgentChatTurn): HTMLElement {
  const wrap = el("article", `mv-chatonly-msg mv-chatonly-msg--${turn.role}`);
  const bubble = el("div", "mv-chatonly-bubble");
  if (turn.role === "assistant") {
    bubble.classList.add("mv-prose", "mv-chatonly-prose");
    bubble.innerHTML = renderMarkdown(turn.content).html;
  } else {
    bubble.textContent = turn.content;
  }
  wrap.append(bubble);
  return wrap;
}

function renderMessages(): void {
  messages.replaceChildren();
  if (!history.length) {
    const empty = el("div", "mv-chatonly-empty");
    empty.append(
      el("div", "mv-chatonly-empty-title", "Waar wil je over praten?"),
      el(
        "p",
        "",
        "Deze chat gebruikt dezelfde Ask-logica, corpusinformatie en agent-memory als de volledige editor.",
      ),
    );
    messages.append(empty);
    return;
  }
  for (const turn of history) {
    messages.append(renderMessage(turn));
  }
  scrollToBottom();
}

function renderSessions(): void {
  sessionSelect.replaceChildren();
  for (const session of sessions) {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.title || "Nieuwe chat";
    sessionSelect.append(option);
  }
  sessionSelect.value = activeChatId;
}

function applySessions(payload: { activeChatId: string; sessions: AgentChatSession[] }): void {
  sessions = payload.sessions;
  activeChatId = payload.activeChatId || sessions[0]?.id || "";
  const active = sessions.find((s) => s.id === activeChatId) || sessions[0] || null;
  history = normalizeTurns(active?.messages);
  renderSessions();
  renderMessages();
}

async function persistActiveChat(title?: string): Promise<void> {
  if (!activeChatId) return;
  const payload = await updateAgentChatSession(activeChatId, {
    messages: history,
    ...(title ? { title } : {}),
    active: true,
  });
  applySessions(payload);
}

function pushActivity(ev: CorpusActivityEvent): void {
  activity.hidden = false;
  activity.textContent = activityText(ev);
}

async function loadSessions(): Promise<void> {
  setBusy(true);
  try {
    let payload = await fetchAgentChatSessions();
    if (!payload.sessions.length) {
      payload = await createAgentChatSession("Mobiele chat");
    }
    applySessions(payload);
    renderWebSearchState();
  } catch (e) {
    status.textContent = `Chats laden mislukt: ${String((e as Error).message)}`;
  } finally {
    setBusy(false);
  }
}

async function startNewChat(): Promise<void> {
  setBusy(true);
  try {
    const payload = await createAgentChatSession("Nieuwe mobiele chat");
    applySessions(payload);
    status.textContent = "Nieuwe chat gestart";
    input.focus();
  } catch (e) {
    status.textContent = `Nieuwe chat starten mislukt: ${String((e as Error).message)}`;
  } finally {
    setBusy(false);
  }
}

async function switchSession(id: string): Promise<void> {
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  activeChatId = id;
  history = normalizeTurns(session.messages);
  renderSessions();
  renderMessages();
  try {
    applySessions(await updateAgentChatSession(id, { active: true }));
  } catch (e) {
    status.textContent = `Chat wisselen mislukt: ${String((e as Error).message)}`;
  }
}

async function refreshCorpus(): Promise<void> {
  setBusy(true);
  status.textContent = "Corpusinformatie verversen...";
  try {
    const result = await rebuildCorpusIndex();
    status.textContent = `Corpus ververst: ${result.entryCount} werkdocument(en), ${result.memoryEntryCount} memory-document(en).`;
  } catch (e) {
    status.textContent = `Corpus verversen mislukt: ${String((e as Error).message)}`;
  } finally {
    setBusy(false);
  }
}

async function submitMessage(): Promise<void> {
  const text = input.value.trim();
  if (!text || busy) return;
  if (!activeChatId) {
    await startNewChat();
    if (!activeChatId) return;
  }
  input.value = "";
  activity.hidden = true;
  activity.textContent = "";
  const wasEmpty = history.length === 0;
  history = [...history, { role: "user", content: text, mode: "ask" }];
  renderMessages();
  setBusy(true);
  status.textContent = "Denkt na met corpus, memory en internet...";
  try {
    await persistActiveChat(wasEmpty ? chatTitleFrom(text) : undefined);
    const result = await agentChat(
      {
        mode: "ask",
        message: text,
        markdown: "",
        history,
        corpusWide: true,
        webSearch: true,
        activityStream: true,
        replyMarkdown: true,
      },
      { onCorpusActivity: pushActivity },
    );
    history = [...history, { role: "assistant", content: result.reply || "(geen antwoord)", mode: "ask" }];
    await persistActiveChat();
    renderWebSearchState();
    status.textContent = formatPerformanceStatus(result.performanceMetrics) || status.textContent;
  } catch (e) {
    const message = String((e as Error).message);
    history = [...history, { role: "assistant", content: `Er ging iets mis: ${message}`, mode: "ask" }];
    status.textContent = "Chat-call mislukt";
    try {
      await persistActiveChat();
    } catch {
      /* Beste poging: de UI houdt de foutmelding lokaal zichtbaar. */
    }
  } finally {
    activity.hidden = true;
    setBusy(false);
    renderMessages();
    input.focus();
  }
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitMessage();
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void submitMessage();
  }
});

newChatBtn.addEventListener("click", () => void startNewChat());
refreshCorpusBtn.addEventListener("click", () => void refreshCorpus());
sessionSelect.addEventListener("change", () => void switchSession(sessionSelect.value));

void loadSessions();
