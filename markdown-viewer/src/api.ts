import { normalizeReviewCommentsList, type ReviewComment } from "./reviewComments";

/**
 * Optioneel: zet `VITE_API_ORIGIN` (bijv. http://127.0.0.1:8787) voor routes die de proxy omzeilen
 * (o.a. Word-export). **Agent-config/chat** gebruikt in development altijd `/api` via de Vite-proxy (zelfde origin).
 */
function viewerApiUrl(path: string): string {
  const origin = String(import.meta.env.VITE_API_ORIGIN || "").trim().replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${rel}` : rel;
}

/**
 * Agent-chat/config/run/logs: in Vite-dev altijd same-origin `/api` (proxy → API_PORT).
 * Anders roept de browser `VITE_API_ORIGIN` (vaak 127.0.0.1) aan vanaf de UI op localhost:5173 →
 * cross-origin + ontbrekende of mismatchende CORS-headers.
 */
function agentApiFetchUrl(path: string): string {
  if (import.meta.env.DEV) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  return viewerApiUrl(path);
}

export type AgentConfigPublic = {
  endpoint: string;
  model: string;
  hasApiKey: boolean;
};

export type AgentConfigInput = {
  apiKey?: string;
  endpoint: string;
  model: string;
};

export type AgentModelsPayload = {
  models: string[];
};

export type CorpusIndexRebuildPayload = {
  ok: boolean;
  entryCount: number;
  memoryEntryCount: number;
  generatedAt: string;
  memoryGeneratedAt: string;
};

export type AgentTranscriptCleanupPayload = {
  text: string;
};

export type AgentActivityLogEntry = {
  id: string;
  ts: string;
  localDate: string;
  localTime: string;
  runId: string;
  chatId: string;
  chatTitle: string;
  mode: "ask" | "agent" | "unknown";
  status: string;
  documentPath: string;
  request: string;
  reply: string;
  durationMs: number;
  changed: boolean;
  wroteFile: boolean;
  corpusWide: boolean;
  webSearch: boolean;
  memoryActionCount: number;
  corpusCreatedPaths: string[];
  error: string;
};

export type AgentActivityLogsPayload = {
  path: string;
  entries: AgentActivityLogEntry[];
};

export type AgentRunResult = {
  ok: boolean;
  name: string;
  processed: number;
  changed: number;
  failed: number;
  skipped: number;
  reviewRelativePath: string;
  /** Alleen bij external run: definitieve Markdown om terug te schrijven naar schijf. */
  markdown?: string;
};

export type AgentRunRequestBody =
  | { name: string; replyMarkdown?: boolean }
  | { name: string; external: true; markdown: string; replyMarkdown?: boolean };

async function jsonError(r: Response, fallback: string): Promise<Error> {
  const err = (await r.json().catch(() => ({}))) as { error?: string };
  return new Error(err.error || fallback);
}

export type MarkdownFileDetail = {
  name: string;
  folder: string;
  size: number;
  mtimeMs: number;
};

export type MarkdownIndex = {
  files: string[];
  folders: string[];
  fileDetails: MarkdownFileDetail[];
};

export async function fetchMarkdownIndex(): Promise<MarkdownIndex> {
  const r = await fetch("/api/markdown-files");
  if (!r.ok) throw new Error(`markdown-files ${r.status}`);
  const data = (await r.json()) as {
    files?: string[];
    folders?: string[];
    fileDetails?: MarkdownFileDetail[];
  };
  return {
    files: Array.isArray(data.files) ? data.files : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
    fileDetails: Array.isArray(data.fileDetails) ? data.fileDetails : [],
  };
}

export async function fetchMarkdownFiles(): Promise<string[]> {
  const { files } = await fetchMarkdownIndex();
  return files;
}

export async function fetchAgentConfig(): Promise<AgentConfigPublic> {
  const r = await fetch(agentApiFetchUrl("/api/agent-config"));
  if (!r.ok) throw await jsonError(r, `agent-config ${r.status}`);
  const data = (await r.json()) as Partial<AgentConfigPublic>;
  return {
    endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
    model: typeof data.model === "string" ? data.model : "",
    hasApiKey: !!data.hasApiKey,
  };
}

export async function saveAgentConfig(config: AgentConfigInput): Promise<AgentConfigPublic> {
  const r = await fetch(agentApiFetchUrl("/api/agent-config"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!r.ok) throw await jsonError(r, `save agent-config ${r.status}`);
  const data = (await r.json()) as { config?: Partial<AgentConfigPublic> };
  return {
    endpoint: typeof data.config?.endpoint === "string" ? data.config.endpoint : "",
    model: typeof data.config?.model === "string" ? data.config.model : "",
    hasApiKey: !!data.config?.hasApiKey,
  };
}

export async function fetchAgentModels(config?: Partial<AgentConfigInput>): Promise<AgentModelsPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent-models"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config || {}),
  });
  const data = (await r.json().catch(() => ({}))) as { models?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `agent models ${r.status}`);
  return {
    models: Array.isArray(data.models)
      ? data.models.filter((m): m is string => typeof m === "string" && !!m.trim())
      : [],
  };
}

export type AgentInstructionsPayload = {
  content: string;
  path: string;
};

export async function fetchAgentInstructions(): Promise<AgentInstructionsPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent/instructions"));
  if (!r.ok) throw await jsonError(r, `agent instructions ${r.status}`);
  const data = (await r.json()) as { content?: unknown; path?: unknown };
  return {
    content: typeof data.content === "string" ? data.content : "",
    path: typeof data.path === "string" ? data.path : "",
  };
}

export async function saveAgentInstructions(content: string): Promise<AgentInstructionsPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent/instructions"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw await jsonError(r, `save agent instructions ${r.status}`);
  const data = (await r.json()) as { content?: unknown; path?: unknown };
  return {
    content: typeof data.content === "string" ? data.content : "",
    path: typeof data.path === "string" ? data.path : "",
  };
}

export async function runAgent(body: AgentRunRequestBody): Promise<AgentRunResult> {
  const r = await fetch(agentApiFetchUrl("/api/agent/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await jsonError(r, `agent run ${r.status}`);
  return (await r.json()) as AgentRunResult;
}

export type AgentChatMode = "ask" | "agent";

export type AgentChatTurn = { role: "user" | "assistant"; content: string; mode?: AgentChatMode };

function normalizeAgentChatUiHistory(raw: unknown): AgentChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const roleRaw = (m as { role?: unknown }).role;
    const role = roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
    if (!role) continue;
    const content =
      typeof (m as { content?: unknown }).content === "string" ? (m as { content: string }).content : "";
    if (!content.trim()) continue;
    const modeRaw = (m as { mode?: unknown }).mode;
    const mode = modeRaw === "ask" || modeRaw === "agent" ? modeRaw : undefined;
    out.push({ role, content, ...(mode ? { mode } : {}) });
  }
  return out;
}

export type AgentChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lifecycleStatus?: "active" | "stale" | "summarized" | "promoted" | "archived";
  promotedAt?: string;
  structuredMemoryAt?: string;
  structuredMemoryStatus?: string;
  summary?: string;
  messages: AgentChatTurn[];
};

export type AgentChatSessionsPayload = {
  activeChatId: string;
  sessions: AgentChatSession[];
};

function normalizeAgentChatSession(raw: unknown): AgentChatSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  return {
    id,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Nieuwe chat",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    lifecycleStatus:
      o.lifecycleStatus === "active" ||
      o.lifecycleStatus === "stale" ||
      o.lifecycleStatus === "summarized" ||
      o.lifecycleStatus === "promoted" ||
      o.lifecycleStatus === "archived"
        ? o.lifecycleStatus
        : undefined,
    promotedAt: typeof o.promotedAt === "string" ? o.promotedAt : undefined,
    structuredMemoryAt: typeof o.structuredMemoryAt === "string" ? o.structuredMemoryAt : undefined,
    structuredMemoryStatus: typeof o.structuredMemoryStatus === "string" ? o.structuredMemoryStatus : undefined,
    summary: typeof o.summary === "string" ? o.summary : undefined,
    messages: normalizeAgentChatUiHistory(o.messages),
  };
}

function normalizeAgentChatSessionsPayload(raw: unknown): AgentChatSessionsPayload {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sessions = Array.isArray(o.sessions)
    ? o.sessions.map(normalizeAgentChatSession).filter((s): s is AgentChatSession => !!s)
    : [];
  const activeRaw = typeof o.activeChatId === "string" ? o.activeChatId : "";
  const activeChatId = sessions.some((s) => s.id === activeRaw) ? activeRaw : sessions[0]?.id || "";
  return { activeChatId, sessions };
}

export async function fetchAgentChatSessions(): Promise<AgentChatSessionsPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent/chats"));
  if (!r.ok) throw await jsonError(r, `agent chats ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function createAgentChatSession(title?: string): Promise<AgentChatSessionsPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent/chats"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(title ? { title } : {}) }),
  });
  if (!r.ok) throw await jsonError(r, `create agent chat ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function updateAgentChatSession(
  id: string,
  patch: { title?: string; messages?: AgentChatTurn[]; active?: boolean },
): Promise<AgentChatSessionsPayload> {
  const r = await fetch(agentApiFetchUrl(`/api/agent/chats/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw await jsonError(r, `update agent chat ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function deleteAgentChatSession(id: string): Promise<AgentChatSessionsPayload> {
  const r = await fetch(agentApiFetchUrl(`/api/agent/chats/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
  if (!r.ok) throw await jsonError(r, `delete agent chat ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export type MemoryFileDetail = {
  name: string;
  displayName?: string;
  folder: string;
  size: number;
  mtimeMs: number;
};

export type MemoryIndexPayload = {
  root: string;
  files: string[];
  fileDetails: MemoryFileDetail[];
};

function normalizeAgentChatSessionsWithMemoryActions(raw: unknown): AgentChatSessionsPayload & {
  executedMemoryActions?: AgentMemoryAction[];
  corpusCreatedPaths?: string[];
} {
  const payload = normalizeAgentChatSessionsPayload(raw);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    ...payload,
    executedMemoryActions: normalizeMemoryActionsWire(o.executedMemoryActions),
    corpusCreatedPaths: normalizeCorpusCreatedPaths(o.corpusCreatedPaths),
  };
}

export async function promoteAgentChatSession(id: string): Promise<
  AgentChatSessionsPayload & { executedMemoryActions?: AgentMemoryAction[]; corpusCreatedPaths?: string[] }
> {
  const r = await fetch(agentApiFetchUrl(`/api/chats/${encodeURIComponent(id)}/promote`), { method: "POST" });
  if (!r.ok) throw await jsonError(r, `promote agent chat ${r.status}`);
  return normalizeAgentChatSessionsWithMemoryActions(await r.json());
}

export async function promoteStaleAgentChats(): Promise<
  AgentChatSessionsPayload & {
    executedMemoryActions?: AgentMemoryAction[];
    corpusCreatedPaths?: string[];
    errors?: { id?: string; error: string }[];
  }
> {
  const r = await fetch(agentApiFetchUrl("/api/chats/promote-stale"), { method: "POST" });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw await jsonError(r, `promote stale chats ${r.status}`);
  return {
    ...normalizeAgentChatSessionsWithMemoryActions(data),
    errors: Array.isArray(data.errors)
      ? data.errors
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : undefined,
            error: typeof e.error === "string" ? e.error : "Onbekende fout",
          }))
      : [],
  };
}

export async function fetchMemoryIndex(): Promise<MemoryIndexPayload> {
  const r = await fetch(agentApiFetchUrl("/api/memory/index"));
  if (!r.ok) throw await jsonError(r, `memory index ${r.status}`);
  const data = (await r.json()) as {
    root?: unknown;
    files?: unknown;
    fileDetails?: unknown;
  };
  return {
    root: typeof data.root === "string" ? data.root : ".memory",
    files: Array.isArray(data.files) ? data.files.filter((f): f is string => typeof f === "string") : [],
    fileDetails: Array.isArray(data.fileDetails)
      ? data.fileDetails
          .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
          .map((d) => ({
            name: typeof d.name === "string" ? d.name : "",
            displayName: typeof d.displayName === "string" ? d.displayName : undefined,
            folder: typeof d.folder === "string" ? d.folder : "",
            size: typeof d.size === "number" ? d.size : 0,
            mtimeMs: typeof d.mtimeMs === "number" ? d.mtimeMs : 0,
          }))
          .filter((d) => !!d.name)
      : [],
  };
}

export async function fetchMemoryFile(name: string): Promise<string> {
  const r = await fetch(agentApiFetchUrl(`/api/memory/file?${new URLSearchParams({ name })}`));
  if (!r.ok) throw await jsonError(r, `memory file ${r.status}`);
  const data = (await r.json()) as { content?: unknown };
  return typeof data.content === "string" ? data.content : "";
}

export async function rebuildCorpusIndex(): Promise<CorpusIndexRebuildPayload> {
  const r = await fetch(agentApiFetchUrl("/api/corpus-index/rebuild"), { method: "POST" });
  if (!r.ok) throw await jsonError(r, `corpus-index rebuild ${r.status}`);
  const data = (await r.json()) as Partial<CorpusIndexRebuildPayload>;
  return {
    ok: data.ok === true,
    entryCount: typeof data.entryCount === "number" ? data.entryCount : 0,
    memoryEntryCount: typeof data.memoryEntryCount === "number" ? data.memoryEntryCount : 0,
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : "",
    memoryGeneratedAt: typeof data.memoryGeneratedAt === "string" ? data.memoryGeneratedAt : "",
  };
}

export type ReviewCommentsPayload = {
  comments: ReviewComment[];
  agentChatUiHistory: AgentChatTurn[];
};

export type AgentChatRequestBody = {
  mode: AgentChatMode;
  message: string;
  markdown: string;
  chatId?: string;
  chatTitle?: string;
  /** Vereist voor agent-modus; bij Ask alleen nodig voor geschiedenis-koppeling aan document. */
  name?: string;
  history: AgentChatTurn[];
  /** Ask-modus: corpus-index + tools om volledige `.md`-bestanden te lezen. */
  corpusWide?: boolean;
  /** Ask-modus: laat server-side Tavily-webzoektool toe (API-key blijft op server). */
  webSearch?: boolean;
  /** Ask corpus: stream activiteiten als NDJSON (default true); zet false voor één JSON-response met `activities`. */
  activityStream?: boolean;
  /** Optioneel: anker uit de editor (tekst selecteren + Agent-bericht). */
  selection?: { quote: string; prefix: string; suffix: string };
  /**
   * Zet aan in Instellingen: server stuurt dan `debugLlm` terug met o.a. ruwe `message`, `tool_calls`, parse-fout.
   * Ook aan te zetten via server-omgeving `AGENT_LLM_DEBUG=1` (dan niet op elke request nodig).
   */
  debugLlm?: boolean;
  /**
   * Standaard true. Bij false: server vraagt platte tekst in `reply` (geen Markdown in chat-antwoord).
   */
  replyMarkdown?: boolean;
};

/** Activiteit tijdens corpus-chat (server → client). */
export type CorpusActivityEvent = {
  type: "activity";
  phase?: string;
  label?: string;
  path?: string;
  detail?: string;
  ts?: number;
};

export type AgentChatActivityRow = CorpusActivityEvent;

export type AgentChatOptions = {
  onCorpusActivity?: (ev: CorpusActivityEvent) => void;
};

/** Server debug-payload bij `debugLlm`; vooral nuttig bij MCP-assistants zonder JSON in `content`. */
export type AgentChatLlmDebug = Record<string, unknown>;

/** Server-normalised hints na corpus-chat: open een .md en/of markeer een fragment in de viewer. */
export type ViewerAgentAction =
  | { type: "open"; path: string }
  | { type: "highlight"; path: string; snippet: string };

export type AgentMemoryAction = {
  id: string;
  kind: "create" | "update" | "delete_suggestion";
  path: string;
  reason: string;
  content?: string;
  find?: string;
  replace?: string;
  sources?: string[];
  risk?: "low" | "medium" | "high";
  rollbackContent?: string;
  rollbackCreated?: boolean;
};

export type AgentChatResponse = {
  reply: string;
  markdown?: string;
  changed?: boolean;
  wroteFile?: boolean;
  debugLlm?: AgentChatLlmDebug;
  /** Alleen bij corpus zonder NDJSON-stream. */
  activities?: AgentChatActivityRow[];
  /** Alleen corpus Ask met bibliotheek: model kan bronnen laten zien in de viewer. */
  viewerActions?: ViewerAgentAction[];
  /** Paden van tijdens deze run nieuw aangemaakte .md-bestanden (corpus Ask). */
  corpusCreatedPaths?: string[];
  /** Geheugenacties die direct door de server zijn uitgevoerd. */
  executedMemoryActions?: AgentMemoryAction[];
  /** Geheugenacties die eerst bevestiging vragen. */
  pendingMemoryActions?: AgentMemoryAction[];
};

export type ApplyMemoryActionsResponse = {
  ok: boolean;
  executedMemoryActions: AgentMemoryAction[];
  corpusCreatedPaths: string[];
  errors: { id?: string; path?: string; error: string }[];
};

export type RevertMemoryActionsResponse = {
  ok: boolean;
  revertedMemoryActions: AgentMemoryAction[];
  errors: { id?: string; path?: string; error: string }[];
};

function normalizeCorpusCreatedPaths(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => p.trim());
  return out.length ? out : undefined;
}

function normalizeViewerActionsWire(raw: unknown): ViewerAgentAction[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ViewerAgentAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const typ = o.type;
    if (typ === "open" && typeof o.path === "string" && o.path.trim()) {
      out.push({ type: "open", path: o.path.trim() });
    } else if (typ === "highlight" && typeof o.path === "string" && typeof o.snippet === "string") {
      const sn = o.snippet.trim();
      if (sn) out.push({ type: "highlight", path: o.path.trim(), snippet: sn });
    }
  }
  return out.length ? out : undefined;
}

function normalizeMemoryActionsWire(raw: unknown): AgentMemoryAction[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AgentMemoryAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kindRaw = o.kind;
    const kind =
      kindRaw === "create" || kindRaw === "update" || kindRaw === "delete_suggestion" ? kindRaw : null;
    const path = typeof o.path === "string" ? o.path.trim() : "";
    if (!kind || !path) continue;
    const riskRaw = o.risk;
    const risk = riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : undefined;
    out.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : `${kind}:${path}:${out.length}`,
      kind,
      path,
      reason: typeof o.reason === "string" ? o.reason : "",
      content: typeof o.content === "string" ? o.content : undefined,
      find: typeof o.find === "string" ? o.find : undefined,
      replace: typeof o.replace === "string" ? o.replace : undefined,
      sources: Array.isArray(o.sources) ? o.sources.filter((s): s is string => typeof s === "string") : undefined,
      risk,
      rollbackContent: typeof o.rollbackContent === "string" ? o.rollbackContent : undefined,
      rollbackCreated: o.rollbackCreated === true ? true : undefined,
    });
  }
  return out.length ? out : undefined;
}

export async function agentChat(body: AgentChatRequestBody, options?: AgentChatOptions): Promise<AgentChatResponse> {
  const streamCorpus =
    body.mode === "ask" && (body.corpusWide === true || body.webSearch === true) && body.activityStream !== false;

  if (!streamCorpus) {
    const r = await fetch(agentApiFetchUrl("/api/agent/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as AgentChatResponse & {
      error?: string;
      activities?: AgentChatActivityRow[];
    };
    if (!r.ok) {
      const err = new Error(data.error || `Agent-chat (${r.status})`) as Error & {
        partialReply?: string;
        debugLlm?: AgentChatLlmDebug;
        status?: number;
      };
      err.status = r.status;
      if (typeof data.reply === "string" && data.reply.trim()) err.partialReply = data.reply.trim();
      if (data.debugLlm && typeof data.debugLlm === "object") err.debugLlm = data.debugLlm as AgentChatLlmDebug;
      throw err;
    }
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      markdown: typeof data.markdown === "string" ? data.markdown : undefined,
      changed: !!data.changed,
      wroteFile: !!data.wroteFile,
      debugLlm: data.debugLlm && typeof data.debugLlm === "object" ? (data.debugLlm as AgentChatLlmDebug) : undefined,
      activities: Array.isArray(data.activities) ? data.activities : undefined,
      viewerActions: normalizeViewerActionsWire(data.viewerActions),
      corpusCreatedPaths: normalizeCorpusCreatedPaths(data.corpusCreatedPaths),
      executedMemoryActions: normalizeMemoryActionsWire(data.executedMemoryActions),
      pendingMemoryActions: normalizeMemoryActionsWire(data.pendingMemoryActions),
    };
  }

  const r = await fetch(agentApiFetchUrl("/api/agent/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson, application/json",
    },
    body: JSON.stringify({ ...body, activityStream: true }),
  });

  if (!r.ok) {
    const text = await r.text();
    let msg = text.slice(0, 1200);
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
    } catch {
      /* platte tekst */
    }
    const err = new Error(msg || `Agent-chat (${r.status})`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("ndjson")) {
    const data = (await r.json().catch(() => ({}))) as AgentChatResponse & { error?: string };
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      markdown: typeof data.markdown === "string" ? data.markdown : undefined,
      changed: !!data.changed,
      wroteFile: !!data.wroteFile,
      debugLlm: data.debugLlm && typeof data.debugLlm === "object" ? (data.debugLlm as AgentChatLlmDebug) : undefined,
      activities: Array.isArray(data.activities) ? data.activities : undefined,
      viewerActions: normalizeViewerActionsWire(data.viewerActions),
      corpusCreatedPaths: normalizeCorpusCreatedPaths(data.corpusCreatedPaths),
      executedMemoryActions: normalizeMemoryActionsWire(data.executedMemoryActions),
      pendingMemoryActions: normalizeMemoryActionsWire(data.pendingMemoryActions),
    };
  }

  const reader = r.body?.getReader();
  if (!reader) {
    throw new Error("Geen response body voor corpus-stream.");
  }

  const dec = new TextDecoder();
  let buffer = "";
  let donePayload: AgentChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    for (;;) {
      const nl = buffer.indexOf("\n");
      if (nl < 0) break;
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const t = obj.type;
      if (t === "activity" && options?.onCorpusActivity) {
        options.onCorpusActivity(obj as CorpusActivityEvent);
      }
      if (t === "done") {
        donePayload = {
          reply: typeof obj.reply === "string" ? obj.reply : "",
          changed: !!obj.changed,
          wroteFile: !!obj.wroteFile,
          markdown: typeof obj.markdown === "string" ? obj.markdown : undefined,
          debugLlm:
            obj.debugLlm && typeof obj.debugLlm === "object"
              ? (obj.debugLlm as AgentChatLlmDebug)
              : undefined,
          viewerActions: normalizeViewerActionsWire(obj.viewerActions),
          corpusCreatedPaths: normalizeCorpusCreatedPaths(obj.corpusCreatedPaths),
          executedMemoryActions: normalizeMemoryActionsWire(obj.executedMemoryActions),
          pendingMemoryActions: normalizeMemoryActionsWire(obj.pendingMemoryActions),
        };
      }
      if (t === "error") {
        throw new Error(typeof obj.error === "string" ? obj.error : "Corpus-chat fout");
      }
    }
  }

  if (!donePayload) {
    throw new Error("Onvolledige corpus-response (geen afsluitregel).");
  }
  return donePayload;
}

export async function cleanupAgentTranscript(text: string): Promise<AgentTranscriptCleanupPayload> {
  const r = await fetch(agentApiFetchUrl("/api/agent/transcript-cleanup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw await jsonError(r, `transcript-cleanup ${r.status}`);
  const data = (await r.json()) as Partial<AgentTranscriptCleanupPayload>;
  return {
    text: typeof data.text === "string" ? data.text : "",
  };
}

export async function applyAgentMemoryActions(actions: AgentMemoryAction[]): Promise<ApplyMemoryActionsResponse> {
  const r = await fetch(agentApiFetchUrl("/api/agent/memory-actions/apply"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "agent", actions }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw await jsonError(r, `apply memory actions ${r.status}`);
  return {
    ok: data.ok === true,
    executedMemoryActions: normalizeMemoryActionsWire(data.executedMemoryActions) || [],
    corpusCreatedPaths: normalizeCorpusCreatedPaths(data.corpusCreatedPaths) || [],
    errors: Array.isArray(data.errors)
      ? data.errors
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : undefined,
            path: typeof e.path === "string" ? e.path : undefined,
            error: typeof e.error === "string" ? e.error : "Onbekende fout",
          }))
      : [],
  };
}

export async function revertAgentMemoryActions(actions: AgentMemoryAction[]): Promise<RevertMemoryActionsResponse> {
  const r = await fetch(agentApiFetchUrl("/api/agent/memory-actions/revert"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "agent", actions }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw await jsonError(r, `revert memory actions ${r.status}`);
  return {
    ok: data.ok === true,
    revertedMemoryActions: normalizeMemoryActionsWire(data.revertedMemoryActions) || [],
    errors: Array.isArray(data.errors)
      ? data.errors
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : undefined,
            path: typeof e.path === "string" ? e.path : undefined,
            error: typeof e.error === "string" ? e.error : "Onbekende fout",
          }))
      : [],
  };
}

export type AgentLogEntry = Record<string, unknown>;

export type AgentLogsResponse = {
  entries: AgentLogEntry[];
  total: number;
  max: number;
};

export async function fetchAgentLogs(limit = 200): Promise<AgentLogsResponse> {
  const r = await fetch(
    agentApiFetchUrl(`/api/agent/logs?${new URLSearchParams({ limit: String(limit) })}`),
  );
  if (!r.ok) {
    if (r.status === 404) {
      throw new Error(
        "404: de API die je raakt heeft geen /api/agent/logs (vaak een oud proces op de API-poort). " +
          "Stop alle `node server/index.mjs`-processen en start opnieuw (bijv. npm run dev of npm run dev:unified).",
      );
    }
    throw await jsonError(r, `agent logs ${r.status}`);
  }
  const data = (await r.json()) as {
    entries?: AgentLogEntry[];
    total?: number;
    max?: number;
  };
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    total: typeof data.total === "number" ? data.total : 0,
    max: typeof data.max === "number" ? data.max : 0,
  };
}

export async function clearAgentLogs(): Promise<number> {
  const r = await fetch(agentApiFetchUrl("/api/agent/logs"), { method: "DELETE" });
  if (!r.ok) {
    if (r.status === 404) {
      throw new Error(
        "404: de API die je raakt heeft geen agentlog-endpoint. Herstart de server na de update; controleer of poort " +
          "(API_PORT / 8787) niet door een oud proces wordt gebruikt.",
      );
    }
    throw await jsonError(r, `clear agent logs ${r.status}`);
  }
  const data = (await r.json()) as { cleared?: number };
  return typeof data.cleared === "number" ? data.cleared : 0;
}

function normalizeAgentActivityLogEntry(raw: unknown): AgentActivityLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "ask" || o.mode === "agent" ? o.mode : "unknown";
  return {
    id: typeof o.id === "string" ? o.id : "",
    ts: typeof o.ts === "string" ? o.ts : "",
    localDate: typeof o.localDate === "string" ? o.localDate : "",
    localTime: typeof o.localTime === "string" ? o.localTime : "",
    runId: typeof o.runId === "string" ? o.runId : "",
    chatId: typeof o.chatId === "string" ? o.chatId : "",
    chatTitle: typeof o.chatTitle === "string" ? o.chatTitle : "",
    mode,
    status: typeof o.status === "string" ? o.status : "",
    documentPath: typeof o.documentPath === "string" ? o.documentPath : "",
    request: typeof o.request === "string" ? o.request : "",
    reply: typeof o.reply === "string" ? o.reply : "",
    durationMs: typeof o.durationMs === "number" ? o.durationMs : 0,
    changed: o.changed === true,
    wroteFile: o.wroteFile === true,
    corpusWide: o.corpusWide === true,
    webSearch: o.webSearch === true,
    memoryActionCount: typeof o.memoryActionCount === "number" ? o.memoryActionCount : 0,
    corpusCreatedPaths: Array.isArray(o.corpusCreatedPaths)
      ? o.corpusCreatedPaths.filter((p): p is string => typeof p === "string")
      : [],
    error: typeof o.error === "string" ? o.error : "",
  };
}

export async function fetchAgentActivityLogs(limit = 200): Promise<AgentActivityLogsPayload> {
  const r = await fetch(
    agentApiFetchUrl(`/api/agent/activity-logs?${new URLSearchParams({ limit: String(limit) })}`),
  );
  if (!r.ok) throw await jsonError(r, `agent activity logs ${r.status}`);
  const data = (await r.json()) as { path?: unknown; entries?: unknown };
  return {
    path: typeof data.path === "string" ? data.path : "",
    entries: Array.isArray(data.entries)
      ? data.entries.map(normalizeAgentActivityLogEntry).filter((e): e is AgentActivityLogEntry => !!e)
      : [],
  };
}

export async function fetchMarkdownFolders(): Promise<string[]> {
  const { folders } = await fetchMarkdownIndex();
  return folders;
}

export async function fetchMarkdownFile(name: string): Promise<string> {
  const r = await fetch(`/api/markdown-file?${new URLSearchParams({ name })}`);
  if (!r.ok) throw new Error(`markdown-file ${r.status}`);
  const data = (await r.json()) as { content: string };
  return data.content;
}

export async function fetchTemplateFiles(): Promise<string[]> {
  const r = await fetch("/api/templates");
  if (!r.ok) throw new Error(`templates ${r.status}`);
  const data = (await r.json()) as { files: string[] };
  return data.files;
}

export type TemplatePayload = Record<string, unknown>;

export async function fetchTemplate(name: string): Promise<TemplatePayload> {
  const r = await fetch(`/api/template?${new URLSearchParams({ name })}`);
  if (!r.ok) throw new Error(`template ${r.status}`);
  const data = (await r.json()) as { template: TemplatePayload };
  return data.template;
}

export async function saveMarkdownFile(name: string, content: string): Promise<void> {
  const r = await fetch("/api/markdown-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `save markdown ${r.status}`);
  }
}

export async function createMarkdownFolder(folder: string): Promise<void> {
  const r = await fetch("/api/markdown-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-folder ${r.status}`);
  }
}

export async function deleteEmptyMarkdownFolder(folder: string): Promise<void> {
  const r = await fetch(`/api/markdown-folder?${new URLSearchParams({ folder })}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `delete folder ${r.status}`);
  }
}

export async function renameMarkdownPath(from: string, to: string): Promise<void> {
  const r = await fetch("/api/markdown-rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-rename ${r.status}`);
  }
}

export async function backupMarkdownCurrent(name: string): Promise<void> {
  const r = await fetch("/api/markdown-backup-current", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-backup-current ${r.status}`);
  }
}

export async function fetchMarkdownRevertAvailable(name: string): Promise<boolean> {
  const r = await fetch(`/api/markdown-revert-available?${new URLSearchParams({ name })}`);
  if (!r.ok) return false;
  const data = (await r.json()) as { available?: boolean };
  return !!data.available;
}

export async function fetchMarkdownBackupFile(name: string): Promise<string | null> {
  const r = await fetch(`/api/markdown-backup-file?${new URLSearchParams({ name })}`);
  if (r.status === 404) return null;
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-backup-file ${r.status}`);
  }
  const data = (await r.json()) as { content?: unknown };
  return typeof data.content === "string" ? data.content : null;
}

export async function revertMarkdownToLastBackup(
  name: string,
  options?: { external?: boolean },
): Promise<{ content: string }> {
  const r = await fetch("/api/markdown-revert-last", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      ...(options?.external ? { external: true } : {}),
    }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-revert-last ${r.status}`);
  }
  const data = (await r.json()) as { content?: unknown };
  if (typeof data.content !== "string") {
    throw new Error("revert response mist content");
  }
  return { content: data.content };
}

export async function fetchReviewComments(name: string): Promise<ReviewCommentsPayload> {
  const r = await fetch(`/api/review-comments?${new URLSearchParams({ name })}`);
  if (!r.ok) throw new Error(`review-comments ${r.status}`);
  const data = (await r.json()) as { comments?: unknown; agentChatUiHistory?: unknown };
  return {
    comments: normalizeReviewCommentsList(data.comments),
    agentChatUiHistory: normalizeAgentChatUiHistory(data.agentChatUiHistory),
  };
}

export async function saveReviewComments(
  name: string,
  comments: ReviewComment[],
): Promise<{ reviewRelativePath: string }> {
  const r = await fetch("/api/review-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, comments }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `save review-comments ${r.status}`);
  }
  const data = (await r.json()) as { reviewRelativePath?: string };
  return { reviewRelativePath: data.reviewRelativePath ?? `.reviews/${name}.json` };
}

export type DocxTemplatesResponse = {
  templates: string[];
  directory: string;
  llm2docxRoot?: string;
  hint?: string;
  mode?: "docker" | "local" | "portal";
  docxServiceUrl?: string;
};

export async function fetchDocxTemplates(): Promise<DocxTemplatesResponse> {
  const r = await fetch(viewerApiUrl("/api/docx/templates"));
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string; suggestion?: string };
    const parts = [err.error || `docx templates ${r.status}`, err.suggestion].filter(Boolean);
    throw new Error(parts.join(" — "));
  }
  const data = (await r.json()) as DocxTemplatesResponse;
  return {
    templates: Array.isArray(data.templates) ? data.templates : [],
    directory: typeof data.directory === "string" ? data.directory : "",
    llm2docxRoot: data.llm2docxRoot,
    hint: data.hint,
    mode: data.mode,
    docxServiceUrl: data.docxServiceUrl,
  };
}

export type DocxTemplatePlaceholdersResponse = {
  template_name?: string;
  placeholders: string[];
  hint?: string;
  error?: string;
};

export async function fetchDocxTemplatePlaceholders(templateName: string): Promise<DocxTemplatePlaceholdersResponse> {
  const r = await fetch(
    viewerApiUrl(`/api/docx/template-placeholders?name=${encodeURIComponent(templateName)}`),
  );
  const data = (await r.json().catch(() => ({}))) as DocxTemplatePlaceholdersResponse;
  if (!r.ok) {
    throw new Error(data.error || `template-placeholders ${r.status}`);
  }
  return {
    template_name: data.template_name,
    placeholders: Array.isArray(data.placeholders) ? data.placeholders : [],
    hint: typeof data.hint === "string" ? data.hint : undefined,
  };
}

/** POST /api/docx/export — retourneert het .docx als Blob. */
export async function exportMarkdownToDocx(params: {
  markdown_content: string;
  template_name: string;
  metadata_dict?: Record<string, unknown>;
  download_name?: string;
}): Promise<{ blob: Blob; filename: string }> {
  let bodyStr: string;
  try {
    bodyStr = JSON.stringify(params);
  } catch (e) {
    throw new Error(
      `Markdown/metadata kon niet naar JSON worden omgezet: ${String((e as Error).message)}. Probeer metadata (Jinja) te vereenvoudigen.`,
    );
  }
  const r = await fetch(viewerApiUrl("/api/docx/export"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });
  const cd = r.headers.get("Content-Disposition");
  let filename = "document.docx";
  if (cd) {
    const m = /filename="([^"]+)"/.exec(cd);
    if (m) filename = m[1];
  }
  if (!r.ok) {
    const raw = await r.text();
    let msg = "";
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json") || raw.trim().startsWith("{")) {
      try {
        const j = JSON.parse(raw) as { error?: string; detail?: string | unknown[] };
        if (typeof j.error === "string") msg = j.error;
        else if (typeof j.detail === "string") msg = j.detail;
        else if (Array.isArray(j.detail)) {
          msg = j.detail
            .map((d) =>
              typeof d === "object" && d && "msg" in d
                ? `${String((d as { loc?: unknown }).loc ?? "")}: ${(d as { msg: string }).msg}`
                : JSON.stringify(d),
            )
            .join("; ");
        }
      } catch {
        /* ignore */
      }
    }
    if (!msg) {
      msg = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    }
    throw new Error(msg || `docx export ${r.status}`);
  }
  const blob = await r.blob();
  return { blob, filename };
}

async function fileToDocxBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

export type DocxImportResult = {
  markdown: string;
  suggestedName: string;
  mammothMessages?: string[];
};

/** DOCX → Markdown in één API-stap (server: mammoth). */
export async function importDocxToMarkdown(file: File): Promise<DocxImportResult> {
  const docxBase64 = await fileToDocxBase64(file);
  const r = await fetch("/api/docx/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docxBase64, originalName: file.name }),
  });
  const data = (await r.json().catch(() => ({}))) as DocxImportResult & { error?: string };
  if (!r.ok) {
    throw new Error(data.error || `docx import ${r.status}`);
  }
  if (typeof data.markdown !== "string") {
    throw new Error("Server gaf geen markdown terug.");
  }
  if (typeof data.suggestedName !== "string" || !data.suggestedName.endsWith(".md")) {
    throw new Error("Server gaf geen geldige bestandsnaam.");
  }
  return {
    markdown: data.markdown,
    suggestedName: data.suggestedName,
    mammothMessages: Array.isArray(data.mammothMessages) ? data.mammothMessages : undefined,
  };
}
