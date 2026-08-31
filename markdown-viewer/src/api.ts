import { lastReplyIsFromAgent, normalizeReviewCommentsList, type ReviewComment } from "./reviewComments";

/**
 * UI-routes blijven same-origin `/api`.
 * Dat voorkomt dat Basic Auth-sessies op de Vite-origin wegvallen bij directe calls naar `127.0.0.1:8787`.
 */
function viewerApiUrl(path: string): string {
  const rel = path.startsWith("/") ? path : `/${path}`;
  return rel;
}

/**
 * Agent/chat/email/config routes blijven altijd same-origin `/api`.
 * Dat houdt Basic Auth, Vite-proxy en productie-builds op dezelfde origin;
 * `VITE_API_ORIGIN` is alleen voor expliciete externe service-routes.
 */
function agentApiFetchUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

const API_RESTART_RETRY_DELAYS_MS = [0, 200, 400, 800, 1200, 1800];

async function fetchWithRestartRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let i = 0; i < API_RESTART_RETRY_DELAYS_MS.length; i++) {
    const delay = API_RESTART_RETRY_DELAYS_MS[i];
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(url, init);
      if (r.status !== 503 || i === API_RESTART_RETRY_DELAYS_MS.length - 1) return r;
    } catch (err) {
      if (i === API_RESTART_RETRY_DELAYS_MS.length - 1) throw err;
    }
  }
  return fetch(url, init);
}

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetchWithRestartRetry(agentApiFetchUrl(path), init);
}

export type AgentConfigPublic = {
  endpoint: string;
  model: string;
  hasApiKey: boolean;
  modelMode?: "auto" | "fixed";
  autoRouterEnabled?: boolean;
  modelRouter?: {
    explorationRate?: number;
    enableStrategyPhase?: boolean;
    exploreReview?: boolean;
  };
};

export type AgentConfigInput = {
  apiKey?: string;
  endpoint: string;
  model: string;
  modelRouter?: AgentConfigPublic["modelRouter"];
};

export type AgentModelsPayload = {
  models: string[];
};

export type ModelCatalogEntry = {
  id: string;
  toolCalling: boolean;
  jsonReliability: number;
  reasoningTier: "fast" | "balanced" | "strong";
  relativeCost: number;
  relativeLatency: number;
  contextWindow: number;
  phaseAffinity: Record<string, number>;
  label?: string;
};

export type ModelRouterStatsPayload = {
  ok: boolean;
  scores?: { version?: number; updatedAt?: string | null; buckets?: Record<string, unknown> };
  topByPhase?: Record<string, Array<{ model: string; intentProfile?: string; avgScore?: number; count?: number }>>;
  error?: string;
};

export type CorpusIndexRebuildPayload = {
  ok: boolean;
  entryCount: number;
  memoryEntryCount: number;
  generatedAt: string;
  memoryGeneratedAt: string;
};

export type SecondBrainRelationEntry = {
  path: string;
  title: string;
  linkCount: number;
  backlinkCount: number;
  unlinkedMentionCount: number;
  relatedCount: number;
};

export type SecondBrainSummary = {
  scope: "working" | "memory" | string;
  generatedAt: string;
  entryCount: number;
  metadataKeys: string[];
  tagCounts: Record<string, number>;
  relationEntries: SecondBrainRelationEntry[];
  staleCandidates: { path: string; title: string; status?: string }[];
  unlinkedMentions: { from: string; to: string; title: string; mention: string }[];
};

export type SecondBrainContextPayload = {
  generatedAt: string;
  working: SecondBrainSummary;
  memory: SecondBrainSummary;
};

export type SecondBrainUnlinkedMention = {
  id: string;
  scope: "working" | "memory" | string;
  from: string;
  to: string;
  title: string;
  mention: string;
};

export type SecondBrainUnlinkedMentionsPayload = {
  generatedAt: string;
  working: SecondBrainUnlinkedMention[];
  memory: SecondBrainUnlinkedMention[];
  totalCount: number;
};

export type SecondBrainLinkMentionsPayload = {
  ok: boolean;
  scope: "all" | "working" | "memory" | string;
  filesChanged: number;
  appliedCount: number;
  skippedCount: number;
  entryCount?: number;
  memoryEntryCount?: number;
};

export type AgentTranscriptCleanupPayload = {
  text: string;
};

export type ConfluenceConfigPayload = {
  ok: boolean;
  configured: boolean;
  baseUrl: string;
  hasPat: boolean;
  hasBrowserSession?: boolean;
  browserSessionSyncEnabled?: boolean;
};

export type ConfluencePagePayload = {
  ok: boolean;
  id: string;
  type: string;
  status: string;
  title: string;
  space: { key: string; name: string };
  version: { number: number | null; when: string; by: string };
  ancestors: { id: string; title: string }[];
  url: string;
  storageHtml: string;
  text: string;
  markdown: string;
  truncated: boolean;
};

export type ConfluencePageSavePayload = {
  ok: boolean;
  id: string;
  title: string;
  version: number;
  url: string;
};

export type ConfluenceSearchResult = {
  id: string;
  type: string;
  status: string;
  title: string;
  space: { key: string; name: string };
  version: { number: number | null; when: string; by: string };
  url: string;
};

export type ConfluenceSearchPayload = {
  ok: boolean;
  query: string;
  spaceKey: string;
  limit: number;
  size: number;
  results: ConfluenceSearchResult[];
};

export type EmailAgentConfig = {
  enabled: boolean;
  intervalMinutes: number;
  scanWindowHours: number;
  maxPerFolder: number;
  folders: Array<"inbox" | "sent">;
  classifyWithLlm: boolean;
};

export type EmailAgentStatusPayload = {
  ok: boolean;
  config: EmailAgentConfig;
  statePath: string;
  running: boolean;
  lastAttemptAt: string;
  lastSuccessfulScanAt: string;
  lastRunId: string;
  lastError: string;
  consecutiveFailures: number;
  notificationCount: number;
  unreadCount: number;
  nextRunAt?: string;
  nextRunInMs?: number | null;
};

export type EmailAgentNotification = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  status: "unread" | "read" | "archived" | "action_completed";
  messageKey: string;
  entryId: string;
  storeId: string;
  direction: "incoming" | "outgoing" | string;
  folder: "inbox" | "sent" | string;
  subject: string;
  from: string;
  to: string;
  mailDate: string;
  title: string;
  summary: string;
  importanceReason: string;
  action: string;
  userContext: string;
  userContextUpdatedAt?: string;
  processedUserContext: string;
  processedUserContextUpdatedAt?: string;
  requiresAction: boolean;
  priority: "laag" | "middel" | "hoog" | string;
  tags: string[];
  memoryPath: string;
  kanbanTaskId: string;
};

export const KANBAN_STATUSES = ["inbox", "today", "this_week", "waiting", "scheduled", "doing", "done", "ignored"] as const;
export const KANBAN_PRIORITIES = ["laag", "middel", "hoog", "kritiek"] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number];

export type KanbanSourceRef = {
  id: string;
  type: string;
  label: string;
  entryId: string;
  storeId: string;
  notificationId: string;
  path: string;
  timestamp: string;
  url: string;
};

export type KanbanTaskHistory = {
  ts: string;
  actor: "agent" | "joost" | string;
  event: string;
  note: string;
};

export type KanbanCommentReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type KanbanCommentThread = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  replies: KanbanCommentReply[];
};

export type KanbanCommentsPayload = {
  ok: boolean;
  taskId?: string;
  threads: KanbanCommentThread[];
  error?: string;
};

export type KanbanTask = {
  id: string;
  title: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  project: string;
  people: string[];
  dueDate: string;
  nextAction: string;
  summary: string;
  sourceRefs: KanbanSourceRef[];
  history: KanbanTaskHistory[];
  rank: number;
  createdAt: string;
  updatedAt: string;
  matchScore?: number;
};

export type KanbanColumn = {
  status: KanbanStatus;
  label: string;
  tasks: KanbanTask[];
};

export type KanbanBoardPayload = {
  ok: boolean;
  columns: KanbanColumn[];
  tasks: KanbanTask[];
  total: number;
  tasksPath?: string;
  eventsPath?: string;
};

export type EmailAgentNotificationsPayload = {
  ok: boolean;
  notifications: EmailAgentNotification[];
  total: number;
};

export type EmailAgentScanPayload = {
  ok: boolean;
  runId: string;
  dryRun?: boolean;
  forceReprocess?: boolean;
  reactivateActions?: boolean;
  useIntervalWindow?: boolean;
  startedAt: string;
  finishedAt: string;
  fromDate?: string;
  toDate?: string;
  stats: {
    candidates: number;
    stored: number;
    ignored: number;
    skipped: number;
    errors: number;
  };
  stored: EmailAgentNotification[];
  errors: Array<{ folder?: string; subject?: string; error: string }>;
};

export type EmailAgentReplyDraftPayload = {
  ok: boolean;
  runId: string;
  bodyMarkdown: string;
  htmlBody: string;
  draft: {
    ok: boolean;
    entryId?: string;
    subject?: string;
    to?: string;
    cc?: string;
    saved?: boolean;
    displayed?: boolean;
    message?: string;
  };
};

export type OutlookMailReadItem = {
  entryId: string;
  storeId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedTime: string;
  sentOn: string;
  to: string;
  cc: string;
  unread: boolean;
  hasAttachments: boolean;
  importance: number;
  categories: string;
  bodySnippet: string;
  bodyIncluded: boolean;
};

export type OutlookMailReadPayload = {
  ok: boolean;
  item?: OutlookMailReadItem;
  error?: string;
  userFacingInstruction?: string;
};

export type PromptMacro = {
  id: string;
  name: string;
  description: string;
  mode: AgentChatMode;
  prompt: string;
  requiresContent: boolean;
  contentLabel: string;
  contentPlaceholder: string;
  contentPrefix: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptMacrosPayload = {
  ok: boolean;
  version: number;
  macros: PromptMacro[];
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
  performanceMetrics?: AgentPerformanceMetrics;
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
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `markdown-files ${r.status}`);
  }
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
  const r = await apiFetch("/api/agent-config");
  if (!r.ok) throw await jsonError(r, `agent-config ${r.status}`);
  const data = (await r.json()) as Partial<AgentConfigPublic>;
  return {
    endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
    model: typeof data.model === "string" ? data.model : "",
    hasApiKey: !!data.hasApiKey,
    modelMode: data.modelMode === "auto" ? "auto" : "fixed",
    autoRouterEnabled: data.autoRouterEnabled === true,
    modelRouter: data.modelRouter && typeof data.modelRouter === "object" ? data.modelRouter : undefined,
  };
}

export async function saveAgentConfig(config: AgentConfigInput): Promise<AgentConfigPublic> {
  const r = await apiFetch("/api/agent-config", {
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
    modelMode: data.config?.modelMode === "auto" ? "auto" : "fixed",
    autoRouterEnabled: data.config?.autoRouterEnabled === true,
    modelRouter:
      data.config?.modelRouter && typeof data.config.modelRouter === "object"
        ? data.config.modelRouter
        : undefined,
  };
}

export async function fetchAgentModels(config?: Partial<AgentConfigInput>): Promise<AgentModelsPayload> {
  const r = await apiFetch("/api/agent-models", {
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

export async function fetchAgentModelCatalog(): Promise<{
  ok: boolean;
  models: ModelCatalogEntry[];
  modelMode?: "auto" | "fixed";
  autoRouterEnabled?: boolean;
}> {
  const r = await apiFetch("/api/agent/models/catalog");
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    models?: ModelCatalogEntry[];
    modelMode?: "auto" | "fixed";
    autoRouterEnabled?: boolean;
    error?: string;
  };
  if (!r.ok) throw new Error(data.error || `model catalog ${r.status}`);
  return {
    ok: data.ok !== false,
    models: Array.isArray(data.models) ? data.models : [],
    modelMode: data.modelMode,
    autoRouterEnabled: data.autoRouterEnabled,
  };
}

export async function fetchModelRouterStats(): Promise<ModelRouterStatsPayload> {
  const r = await apiFetch("/api/agent/models/router-stats");
  const data = (await r.json().catch(() => ({}))) as ModelRouterStatsPayload;
  if (!r.ok) throw new Error(data.error || `router stats ${r.status}`);
  return data;
}

export async function fetchConfluenceConfig(): Promise<ConfluenceConfigPayload> {
  const r = await apiFetch("/api/confluence/config");
  if (!r.ok) throw await jsonError(r, `confluence config ${r.status}`);
  const data = (await r.json()) as Partial<ConfluenceConfigPayload>;
  return {
    ok: data.ok !== false,
    configured: data.configured === true,
    baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : "",
    hasPat: data.hasPat === true,
    hasBrowserSession: data.hasBrowserSession === true,
    browserSessionSyncEnabled: data.browserSessionSyncEnabled === true,
  };
}

export async function syncConfluenceBrowserSession(): Promise<{
  ok: boolean;
  error?: string;
  help?: string;
  endpoint?: string;
  syncedAt?: string;
}> {
  const r = await apiFetch("/api/confluence/sync-browser-session", { method: "POST" });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    help?: string;
    endpoint?: string;
    syncedAt?: string;
  };
  if (!r.ok) throw new Error(data.error || data.help || `confluence browser session ${r.status}`);
  return data;
}

export async function startConfluenceBrowserSession(): Promise<{
  ok: boolean;
  alreadyRunning?: boolean;
  error?: string;
  endpoint?: string;
}> {
  const r = await apiFetch("/api/confluence/start-browser-session", { method: "POST" });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    alreadyRunning?: boolean;
    error?: string;
    endpoint?: string;
  };
  if (!r.ok) throw new Error(data.error || `confluence start browser ${r.status}`);
  return data;
}

export async function fetchConfluencePage(input: { pageId?: string; url?: string }): Promise<ConfluencePagePayload> {
  const r = await apiFetch("/api/confluence/page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `confluence page ${r.status}`);
  return (await r.json()) as ConfluencePagePayload;
}

export async function searchConfluencePages(input: {
  query: string;
  spaceKey?: string;
  limit?: number;
}): Promise<ConfluenceSearchPayload> {
  const r = await apiFetch("/api/confluence/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `confluence search ${r.status}`);
  const data = (await r.json()) as Partial<ConfluenceSearchPayload>;
  return {
    ok: data.ok !== false,
    query: typeof data.query === "string" ? data.query : input.query,
    spaceKey: typeof data.spaceKey === "string" ? data.spaceKey : input.spaceKey || "",
    limit: typeof data.limit === "number" ? data.limit : input.limit || 10,
    size: typeof data.size === "number" ? data.size : 0,
    results: Array.isArray(data.results) ? data.results : [],
  };
}

export async function saveConfluencePage(input: {
  pageId: string;
  title: string;
  baseVersion: number;
  markdown: string;
}): Promise<ConfluencePageSavePayload> {
  const r = await apiFetch("/api/confluence/page", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `save confluence page ${r.status}`);
  return (await r.json()) as ConfluencePageSavePayload;
}

function normalizeEmailAgentConfig(raw: unknown): EmailAgentConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: o.enabled === true,
    intervalMinutes: typeof o.intervalMinutes === "number" ? o.intervalMinutes : 30,
    scanWindowHours: typeof o.scanWindowHours === "number" ? o.scanWindowHours : 24,
    maxPerFolder: typeof o.maxPerFolder === "number" ? o.maxPerFolder : 20,
    folders: ["inbox", "sent"],
    classifyWithLlm: o.classifyWithLlm !== false,
  };
}

function normalizeEmailAgentStatus(raw: unknown): EmailAgentStatusPayload {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    ok: o.ok !== false,
    config: normalizeEmailAgentConfig(o.config),
    statePath: typeof o.statePath === "string" ? o.statePath : "",
    running: o.running === true,
    lastAttemptAt: typeof o.lastAttemptAt === "string" ? o.lastAttemptAt : "",
    lastSuccessfulScanAt: typeof o.lastSuccessfulScanAt === "string" ? o.lastSuccessfulScanAt : "",
    lastRunId: typeof o.lastRunId === "string" ? o.lastRunId : "",
    lastError: typeof o.lastError === "string" ? o.lastError : "",
    consecutiveFailures: typeof o.consecutiveFailures === "number" ? o.consecutiveFailures : 0,
    notificationCount: typeof o.notificationCount === "number" ? o.notificationCount : 0,
    unreadCount: typeof o.unreadCount === "number" ? o.unreadCount : 0,
    nextRunAt: typeof o.nextRunAt === "string" ? o.nextRunAt : undefined,
    nextRunInMs: typeof o.nextRunInMs === "number" ? o.nextRunInMs : null,
  };
}

function normalizeEmailNotification(raw: unknown): EmailAgentNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  const status =
    o.status === "read" || o.status === "archived" || o.status === "action_completed" ? o.status : "unread";
  return {
    id,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    status,
    messageKey: typeof o.messageKey === "string" ? o.messageKey : "",
    entryId: typeof o.entryId === "string" ? o.entryId : "",
    storeId: typeof o.storeId === "string" ? o.storeId : "",
    direction: typeof o.direction === "string" ? o.direction : "",
    folder: typeof o.folder === "string" ? o.folder : "",
    subject: typeof o.subject === "string" ? o.subject : "",
    from: typeof o.from === "string" ? o.from : "",
    to: typeof o.to === "string" ? o.to : "",
    mailDate: typeof o.mailDate === "string" ? o.mailDate : "",
    title: typeof o.title === "string" ? o.title : "",
    summary: typeof o.summary === "string" ? o.summary : "",
    importanceReason: typeof o.importanceReason === "string" ? o.importanceReason : "",
    action: typeof o.action === "string" ? o.action : "",
    userContext: typeof o.userContext === "string" ? o.userContext : "",
    userContextUpdatedAt: typeof o.userContextUpdatedAt === "string" ? o.userContextUpdatedAt : undefined,
    processedUserContext: typeof o.processedUserContext === "string" ? o.processedUserContext : "",
    processedUserContextUpdatedAt:
      typeof o.processedUserContextUpdatedAt === "string" ? o.processedUserContextUpdatedAt : undefined,
    requiresAction: o.requiresAction === true,
    priority: typeof o.priority === "string" ? o.priority : "middel",
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string") : [],
    memoryPath: typeof o.memoryPath === "string" ? o.memoryPath : "",
    kanbanTaskId: typeof o.kanbanTaskId === "string" ? o.kanbanTaskId : "",
  };
}

function normalizeKanbanStatus(value: unknown): KanbanStatus {
  return KANBAN_STATUSES.includes(value as KanbanStatus) ? (value as KanbanStatus) : "inbox";
}

function normalizeKanbanPriority(value: unknown): KanbanPriority {
  return KANBAN_PRIORITIES.includes(value as KanbanPriority) ? (value as KanbanPriority) : "middel";
}

function normalizeKanbanSourceRef(raw: unknown): KanbanSourceRef {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof o.id === "string" ? o.id : "",
    type: typeof o.type === "string" ? o.type : "manual",
    label: typeof o.label === "string" ? o.label : "Bron",
    entryId: typeof o.entryId === "string" ? o.entryId : "",
    storeId: typeof o.storeId === "string" ? o.storeId : "",
    notificationId: typeof o.notificationId === "string" ? o.notificationId : "",
    path: typeof o.path === "string" ? o.path : "",
    timestamp: typeof o.timestamp === "string" ? o.timestamp : "",
    url: typeof o.url === "string" ? o.url : "",
  };
}

function normalizeKanbanTask(raw: unknown): KanbanTask | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  return {
    id,
    title: typeof o.title === "string" ? o.title : "Taak",
    status: normalizeKanbanStatus(o.status),
    priority: normalizeKanbanPriority(o.priority),
    project: typeof o.project === "string" ? o.project : "",
    people: Array.isArray(o.people) ? o.people.filter((p): p is string => typeof p === "string") : [],
    dueDate: typeof o.dueDate === "string" ? o.dueDate : "",
    nextAction: typeof o.nextAction === "string" ? o.nextAction : "",
    summary: typeof o.summary === "string" ? o.summary : "",
    sourceRefs: Array.isArray(o.sourceRefs) ? o.sourceRefs.map(normalizeKanbanSourceRef) : [],
    history: Array.isArray(o.history)
      ? o.history
          .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
          .map((h) => ({
            ts: typeof h.ts === "string" ? h.ts : "",
            actor: typeof h.actor === "string" ? h.actor : "agent",
            event: typeof h.event === "string" ? h.event : "",
            note: typeof h.note === "string" ? h.note : "",
          }))
      : [],
    rank: typeof o.rank === "number" && Number.isFinite(o.rank) ? o.rank : Number.MAX_SAFE_INTEGER,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    matchScore: typeof o.matchScore === "number" ? o.matchScore : undefined,
  };
}

function normalizeKanbanBoardPayload(raw: unknown): KanbanBoardPayload {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tasks = Array.isArray(o.tasks) ? o.tasks.map(normalizeKanbanTask).filter((t): t is KanbanTask => !!t) : [];
  const columns = Array.isArray(o.columns)
    ? o.columns
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({
          status: normalizeKanbanStatus(c.status),
          label: typeof c.label === "string" ? c.label : String(c.status || ""),
          tasks: Array.isArray(c.tasks) ? c.tasks.map(normalizeKanbanTask).filter((t): t is KanbanTask => !!t) : [],
        }))
    : KANBAN_STATUSES.map((status) => ({
        status,
        label: status,
        tasks: tasks.filter((task) => task.status === status),
      }));
  return {
    ok: o.ok !== false,
    columns,
    tasks,
    total: typeof o.total === "number" ? o.total : tasks.length,
    tasksPath: typeof o.tasksPath === "string" ? o.tasksPath : undefined,
    eventsPath: typeof o.eventsPath === "string" ? o.eventsPath : undefined,
  };
}

export async function fetchEmailAgentStatus(): Promise<EmailAgentStatusPayload> {
  const r = await apiFetch("/api/email-agent/status", { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw await jsonError(r, `email agent status ${r.status}`);
  return normalizeEmailAgentStatus(await r.json());
}

export async function saveEmailAgentConfig(config: Partial<EmailAgentConfig>): Promise<EmailAgentStatusPayload> {
  const r = await apiFetch("/api/email-agent/config", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!r.ok) throw await jsonError(r, `email agent config ${r.status}`);
  const data = (await r.json()) as { status?: unknown };
  return normalizeEmailAgentStatus(data.status);
}

export async function runEmailAgentScan(input: {
  fromDate?: string;
  toDate?: string;
  dryRun?: boolean;
  forceReprocess?: boolean;
  reactivateActions?: boolean;
  useIntervalWindow?: boolean;
  configOverride?: Partial<EmailAgentConfig>;
} = {}): Promise<EmailAgentScanPayload> {
  const r = await apiFetch("/api/email-agent/scan", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok && r.status !== 207) throw await jsonError(r, `email agent scan ${r.status}`);
  const statsRaw = data.stats && typeof data.stats === "object" ? (data.stats as Record<string, unknown>) : {};
  return {
    ok: data.ok !== false,
    runId: typeof data.runId === "string" ? data.runId : "",
    dryRun: data.dryRun === true,
    forceReprocess: data.forceReprocess === true,
    reactivateActions: data.reactivateActions === true,
    useIntervalWindow: data.useIntervalWindow === true,
    startedAt: typeof data.startedAt === "string" ? data.startedAt : "",
    finishedAt: typeof data.finishedAt === "string" ? data.finishedAt : "",
    fromDate: typeof data.fromDate === "string" ? data.fromDate : undefined,
    toDate: typeof data.toDate === "string" ? data.toDate : undefined,
    stats: {
      candidates: typeof statsRaw.candidates === "number" ? statsRaw.candidates : 0,
      stored: typeof statsRaw.stored === "number" ? statsRaw.stored : 0,
      ignored: typeof statsRaw.ignored === "number" ? statsRaw.ignored : 0,
      skipped: typeof statsRaw.skipped === "number" ? statsRaw.skipped : 0,
      errors: typeof statsRaw.errors === "number" ? statsRaw.errors : 0,
    },
    stored: Array.isArray(data.stored)
      ? data.stored.map(normalizeEmailNotification).filter((n): n is EmailAgentNotification => !!n)
      : [],
    errors: Array.isArray(data.errors)
      ? data.errors
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            folder: typeof e.folder === "string" ? e.folder : undefined,
            subject: typeof e.subject === "string" ? e.subject : undefined,
            error: typeof e.error === "string" ? e.error : "Onbekende fout",
          }))
      : [],
  };
}

export async function fetchEmailAgentNotifications(input: {
  status?: string;
  limit?: number;
} = {}): Promise<EmailAgentNotificationsPayload> {
  const qs = new URLSearchParams();
  if (input.status) qs.set("status", input.status);
  if (input.limit) qs.set("limit", String(input.limit));
  const r = await apiFetch(`/api/email-agent/notifications${qs.size ? `?${qs}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!r.ok) throw await jsonError(r, `email agent notifications ${r.status}`);
  const data = (await r.json()) as Record<string, unknown>;
  return {
    ok: data.ok !== false,
    notifications: Array.isArray(data.notifications)
      ? data.notifications.map(normalizeEmailNotification).filter((n): n is EmailAgentNotification => !!n)
      : [],
    total: typeof data.total === "number" ? data.total : 0,
  };
}

export async function updateEmailAgentNotification(
  id: string,
  patch: { status?: EmailAgentNotification["status"]; userContext?: string; kanbanTaskId?: string },
): Promise<EmailAgentNotification> {
  const r = await apiFetch(`/api/email-agent/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw await jsonError(r, `email notification update ${r.status}`);
  const data = (await r.json()) as { notification?: unknown };
  const notification = normalizeEmailNotification(data.notification);
  if (!notification) throw new Error("Ongeldige notificatie-response.");
  return notification;
}

export async function createEmailAgentReplyDraft(
  id: string,
  input: { instruction?: string; display?: boolean } = {},
): Promise<EmailAgentReplyDraftPayload> {
  const r = await apiFetch(`/api/email-agent/notifications/${encodeURIComponent(id)}/reply-draft`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as EmailAgentReplyDraftPayload & { error?: string };
  if (!r.ok) throw new Error(data.error || `email reply draft ${r.status}`);
  return {
    ok: data.ok !== false,
    runId: typeof data.runId === "string" ? data.runId : "",
    bodyMarkdown: typeof data.bodyMarkdown === "string" ? data.bodyMarkdown : "",
    htmlBody: typeof data.htmlBody === "string" ? data.htmlBody : "",
    draft: data.draft && typeof data.draft === "object" ? data.draft : { ok: false },
  };
}

function normalizeOutlookMailReadItem(raw: unknown): OutlookMailReadItem | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    entryId: typeof o.entryId === "string" ? o.entryId : "",
    storeId: typeof o.storeId === "string" ? o.storeId : "",
    subject: typeof o.subject === "string" ? o.subject : "",
    senderName: typeof o.senderName === "string" ? o.senderName : "",
    senderEmail: typeof o.senderEmail === "string" ? o.senderEmail : "",
    receivedTime: typeof o.receivedTime === "string" ? o.receivedTime : "",
    sentOn: typeof o.sentOn === "string" ? o.sentOn : "",
    to: typeof o.to === "string" ? o.to : "",
    cc: typeof o.cc === "string" ? o.cc : "",
    unread: o.unread === true,
    hasAttachments: o.hasAttachments === true,
    importance: typeof o.importance === "number" ? o.importance : 1,
    categories: typeof o.categories === "string" ? o.categories : "",
    bodySnippet: typeof o.bodySnippet === "string" ? o.bodySnippet : "",
    bodyIncluded: o.bodyIncluded === true,
  };
}

export async function readOutlookMail(input: {
  entryId: string;
  storeId?: string;
  bodyMaxChars?: number;
}): Promise<OutlookMailReadPayload> {
  const r = await apiFetch("/api/outlook/mail/read", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as OutlookMailReadPayload & { item?: unknown };
  if (!r.ok) throw new Error(data.error || `outlook mail read ${r.status}`);
  if (data.ok === false) {
    throw new Error(data.error || data.userFacingInstruction || "Outlook-mail lezen mislukt.");
  }
  return {
    ok: true,
    item: normalizeOutlookMailReadItem(data.item),
    error: typeof data.error === "string" ? data.error : undefined,
    userFacingInstruction: typeof data.userFacingInstruction === "string" ? data.userFacingInstruction : undefined,
  };
}

export type KanbanTaskInput = Partial<
  Pick<KanbanTask, "title" | "status" | "priority" | "project" | "people" | "dueDate" | "nextAction" | "summary" | "sourceRefs">
> & { rationale?: string; actor?: "agent" | "joost" };

export async function fetchKanbanMeta(): Promise<{ projects: string[] }> {
  const r = await apiFetch("/api/kanban/meta", { credentials: "same-origin", cache: "no-store" });
  const data = (await r.json().catch(() => ({}))) as { projects?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban meta ${r.status}`);
  return {
    projects: Array.isArray(data.projects) ? data.projects.filter((p): p is string => typeof p === "string") : [],
  };
}

export async function fetchKanbanBoard(input: {
  query?: string;
  status?: KanbanStatus | "";
  project?: string;
  person?: string;
  limit?: number;
} = {}): Promise<KanbanBoardPayload> {
  const qs = new URLSearchParams();
  if (input.query) qs.set("query", input.query);
  if (input.status) qs.set("status", input.status);
  if (input.project) qs.set("project", input.project);
  if (input.person) qs.set("person", input.person);
  if (input.limit) qs.set("limit", String(input.limit));
  const r = await apiFetch(`/api/kanban/tasks${qs.size ? `?${qs}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!r.ok) throw await jsonError(r, `kanban ${r.status}`);
  return normalizeKanbanBoardPayload(await r.json());
}

export async function createKanbanTask(input: KanbanTaskInput): Promise<{ task: KanbanTask; board: KanbanBoardPayload }> {
  const r = await apiFetch("/api/kanban/tasks", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as { task?: unknown; board?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban create ${r.status}`);
  const task = normalizeKanbanTask(data.task);
  if (!task) throw new Error("Kanban gaf geen geldige taak terug.");
  return { task, board: normalizeKanbanBoardPayload(data.board) };
}

export async function updateKanbanTask(
  id: string,
  input: KanbanTaskInput,
): Promise<{ task: KanbanTask; board: KanbanBoardPayload }> {
  const r = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as { task?: unknown; board?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban update ${r.status}`);
  const task = normalizeKanbanTask(data.task);
  if (!task) throw new Error("Kanban gaf geen geldige taak terug.");
  return { task, board: normalizeKanbanBoardPayload(data.board) };
}

export async function moveKanbanTask(
  id: string,
  status: KanbanStatus,
  input: { rationale?: string; actor?: "agent" | "joost"; targetIndex?: number } = {},
): Promise<{ task: KanbanTask; board: KanbanBoardPayload }> {
  const r = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(id)}/move`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, status }),
  });
  const data = (await r.json().catch(() => ({}))) as { task?: unknown; board?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban move ${r.status}`);
  const task = normalizeKanbanTask(data.task);
  if (!task) throw new Error("Kanban gaf geen geldige taak terug.");
  return { task, board: normalizeKanbanBoardPayload(data.board) };
}

export async function mergeKanbanTasks(
  primaryId: string,
  input: KanbanTaskInput & { secondaryId: string },
): Promise<{ task: KanbanTask; archivedTask?: KanbanTask; board: KanbanBoardPayload }> {
  const r = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(primaryId)}/merge`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as { task?: unknown; archivedTask?: unknown; board?: unknown; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban merge ${r.status}`);
  const task = normalizeKanbanTask(data.task);
  if (!task) throw new Error("Kanban gaf geen geldige gefuseerde taak terug.");
  return {
    task,
    archivedTask: normalizeKanbanTask(data.archivedTask) || undefined,
    board: normalizeKanbanBoardPayload(data.board),
  };
}

function normalizeKanbanCommentReply(raw: unknown): KanbanCommentReply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  return {
    id,
    author: typeof o.author === "string" ? o.author : "",
    body: typeof o.body === "string" ? o.body : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

function normalizeKanbanCommentThread(raw: unknown): KanbanCommentThread | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  return {
    id,
    author: typeof o.author === "string" ? o.author : "",
    body: typeof o.body === "string" ? o.body : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    replies: Array.isArray(o.replies)
      ? o.replies.map(normalizeKanbanCommentReply).filter((r): r is KanbanCommentReply => !!r)
      : [],
  };
}

function normalizeKanbanCommentsPayload(raw: unknown): KanbanCommentsPayload {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const threads = Array.isArray(o.threads)
    ? o.threads.map(normalizeKanbanCommentThread).filter((t): t is KanbanCommentThread => !!t)
    : [];
  return {
    ok: o.ok === true,
    taskId: typeof o.taskId === "string" ? o.taskId : undefined,
    threads,
    error: typeof o.error === "string" ? o.error : undefined,
  };
}

export async function fetchKanbanComments(taskId: string): Promise<KanbanCommentsPayload> {
  const r = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(taskId)}/comments`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = normalizeKanbanCommentsPayload(await r.json().catch(() => ({})));
  if (!r.ok) throw new Error(data.error || `kanban comments ${r.status}`);
  return data;
}

export async function addKanbanCommentThread(
  taskId: string,
  body: string,
  author: "joost" | "Nexus" = "joost",
): Promise<KanbanCommentsPayload & { thread?: KanbanCommentThread }> {
  const r = await apiFetch(`/api/kanban/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, author }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = normalizeKanbanCommentsPayload(data);
  if (!r.ok) throw new Error(payload.error || `kanban comment ${r.status}`);
  return {
    ...payload,
    thread: normalizeKanbanCommentThread(data.thread) || undefined,
  };
}

export async function addKanbanCommentReply(
  taskId: string,
  commentId: string,
  body: string,
  author: "joost" | "Nexus" = "joost",
): Promise<KanbanCommentsPayload & { thread?: KanbanCommentThread; reply?: KanbanCommentReply }> {
  const r = await fetch(
    agentApiFetchUrl(`/api/kanban/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/replies`),
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, author }),
    },
  );
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const payload = normalizeKanbanCommentsPayload(data);
  if (!r.ok) throw new Error(payload.error || `kanban reply ${r.status}`);
  return {
    ...payload,
    thread: normalizeKanbanCommentThread(data.thread) || undefined,
    reply: normalizeKanbanCommentReply(data.reply) || undefined,
  };
}

export async function ingestKanbanSignal(input: {
  signal: KanbanTaskInput & { sourceRef?: Partial<KanbanSourceRef>; action?: string };
  decision?: Record<string, unknown> | null;
  actor?: "agent" | "joost";
}): Promise<{ task?: KanbanTask; board: KanbanBoardPayload; action?: string }> {
  const r = await apiFetch("/api/kanban/ingest-signal", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await r.json().catch(() => ({}))) as { task?: unknown; board?: unknown; action?: string; error?: string };
  if (!r.ok) throw new Error(data.error || `kanban ingest ${r.status}`);
  return {
    task: normalizeKanbanTask(data.task) || undefined,
    board: normalizeKanbanBoardPayload(data.board),
    action: typeof data.action === "string" ? data.action : undefined,
  };
}

function normalizePromptMacro(raw: unknown): PromptMacro | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const prompt = typeof o.prompt === "string" ? o.prompt : "";
  if (!id || !name || !prompt.trim()) return null;
  return {
    id,
    name,
    description: typeof o.description === "string" ? o.description : "",
    mode: o.mode === "ask" ? "ask" : "agent",
    prompt,
    requiresContent: o.requiresContent === true,
    contentLabel: typeof o.contentLabel === "string" && o.contentLabel.trim() ? o.contentLabel : "Aanvullende inhoud",
    contentPlaceholder: typeof o.contentPlaceholder === "string" ? o.contentPlaceholder : "",
    contentPrefix: typeof o.contentPrefix === "string" && o.contentPrefix.trim() ? o.contentPrefix : "Aanvullende inhoud:",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

function normalizePromptMacrosPayload(raw: unknown): PromptMacrosPayload {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const macros = Array.isArray(o.macros) ? o.macros.map(normalizePromptMacro).filter((m): m is PromptMacro => !!m) : [];
  return {
    ok: o.ok !== false,
    version: typeof o.version === "number" ? o.version : 1,
    macros,
  };
}

export async function fetchPromptMacros(): Promise<PromptMacrosPayload> {
  const r = await apiFetch("/api/prompt-macros");
  if (!r.ok) throw await jsonError(r, `prompt macros ${r.status}`);
  return normalizePromptMacrosPayload(await r.json());
}

export async function createPromptMacro(input: Partial<PromptMacro>): Promise<PromptMacrosPayload> {
  const r = await apiFetch("/api/prompt-macros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `create prompt macro ${r.status}`);
  return normalizePromptMacrosPayload(await r.json());
}

export async function updatePromptMacro(id: string, input: Partial<PromptMacro>): Promise<PromptMacrosPayload> {
  const r = await apiFetch(`/api/prompt-macros/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `update prompt macro ${r.status}`);
  return normalizePromptMacrosPayload(await r.json());
}

export async function deletePromptMacro(id: string): Promise<PromptMacrosPayload> {
  const r = await apiFetch(`/api/prompt-macros/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw await jsonError(r, `delete prompt macro ${r.status}`);
  return normalizePromptMacrosPayload(await r.json());
}

export type AgentInstructionsPayload = {
  content: string;
  path: string;
};

export async function fetchAgentInstructions(): Promise<AgentInstructionsPayload> {
  const r = await apiFetch("/api/agent/instructions");
  if (!r.ok) throw await jsonError(r, `agent instructions ${r.status}`);
  const data = (await r.json()) as { content?: unknown; path?: unknown };
  return {
    content: typeof data.content === "string" ? data.content : "",
    path: typeof data.path === "string" ? data.path : "",
  };
}

export async function saveAgentInstructions(content: string): Promise<AgentInstructionsPayload> {
  const r = await apiFetch("/api/agent/instructions", {
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
  const r = await apiFetch("/api/agent/run", {
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
  const r = await apiFetch("/api/agent/chats");
  if (!r.ok) throw await jsonError(r, `agent chats ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function createAgentChatSession(title?: string): Promise<AgentChatSessionsPayload> {
  const r = await apiFetch("/api/agent/chats", {
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
  const r = await apiFetch(`/api/agent/chats/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw await jsonError(r, `update agent chat ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function deleteAgentChatSession(id: string): Promise<AgentChatSessionsPayload> {
  const r = await apiFetch(`/api/agent/chats/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw await jsonError(r, `delete agent chat ${r.status}`);
  return normalizeAgentChatSessionsPayload(await r.json());
}

export async function summarizeAgentChatSession(
  id: string,
  options: { keepRecentTurns?: number } = {},
): Promise<AgentChatSessionsPayload & { summarizedMessages?: number; keptMessages?: number; summaryChars?: number }> {
  const r = await apiFetch(`/api/agent/chats/${encodeURIComponent(id)}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!r.ok) throw await jsonError(r, `summarize agent chat ${r.status}`);
  const data = (await r.json()) as Record<string, unknown>;
  return {
    ...normalizeAgentChatSessionsPayload(data),
    summarizedMessages: typeof data.summarizedMessages === "number" ? data.summarizedMessages : undefined,
    keptMessages: typeof data.keptMessages === "number" ? data.keptMessages : undefined,
    summaryChars: typeof data.summaryChars === "number" ? data.summaryChars : undefined,
  };
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
  const r = await apiFetch(`/api/chats/${encodeURIComponent(id)}/promote`, { method: "POST" });
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
  const r = await apiFetch("/api/chats/promote-stale", { method: "POST" });
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
  const r = await apiFetch("/api/memory/index");
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
  const r = await apiFetch(`/api/memory/file?${new URLSearchParams({ name })}`);
  if (!r.ok) throw await jsonError(r, `memory file ${r.status}`);
  const data = (await r.json()) as { content?: unknown };
  return typeof data.content === "string" ? data.content : "";
}

export async function rebuildCorpusIndex(): Promise<CorpusIndexRebuildPayload> {
  const r = await apiFetch("/api/corpus-index/rebuild", { method: "POST" });
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

export async function fetchSecondBrainContext(): Promise<SecondBrainContextPayload> {
  const r = await apiFetch("/api/second-brain/context");
  if (!r.ok) throw await jsonError(r, `second-brain context ${r.status}`);
  return (await r.json()) as SecondBrainContextPayload;
}

export async function fetchSecondBrainUnlinkedMentions(): Promise<SecondBrainUnlinkedMentionsPayload> {
  const r = await apiFetch("/api/second-brain/unlinked-mentions");
  if (!r.ok) throw await jsonError(r, `second-brain unlinked mentions ${r.status}`);
  const data = (await r.json()) as Partial<SecondBrainUnlinkedMentionsPayload>;
  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : "",
    working: Array.isArray(data.working) ? data.working : [],
    memory: Array.isArray(data.memory) ? data.memory : [],
    totalCount: typeof data.totalCount === "number" ? data.totalCount : 0,
  };
}

export async function linkSecondBrainUnlinkedMentions(scope: "all" | "working" | "memory" = "all"): Promise<SecondBrainLinkMentionsPayload> {
  const r = await apiFetch("/api/second-brain/link-mentions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  if (!r.ok) throw await jsonError(r, `second-brain link mentions ${r.status}`);
  const data = (await r.json()) as Partial<SecondBrainLinkMentionsPayload>;
  return {
    ok: data.ok === true,
    scope: typeof data.scope === "string" ? data.scope : scope,
    filesChanged: typeof data.filesChanged === "number" ? data.filesChanged : 0,
    appliedCount: typeof data.appliedCount === "number" ? data.appliedCount : 0,
    skippedCount: typeof data.skippedCount === "number" ? data.skippedCount : 0,
    entryCount: typeof data.entryCount === "number" ? data.entryCount : undefined,
    memoryEntryCount: typeof data.memoryEntryCount === "number" ? data.memoryEntryCount : undefined,
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
  /** Joost verwacht uitvoerbare acties op het actieve object (document, e-mailfollow-up of Kanban-taak). */
  executeOnActiveObject?: boolean;
  /** Nexus-tools beschikbaar maken, ook wanneer documentcontext intern als agent/reviewvoorstel wordt uitgevoerd. */
  toolsEnabled?: boolean;
  /** Corpus-index + tools om volledige `.md`-bestanden te lezen. */
  corpusWide?: boolean;
  /** Laat server-side Tavily-webzoektool toe (API-key blijft op server). */
  webSearch?: boolean;
  /** Toolroute: stream activiteiten als NDJSON waar ondersteund; agent-mode krijgt één JSON-response met `activities`. */
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
  /** Promptmacro-id wanneer de chat via een macro gestart werd (server routeert sommige macro's expliciet). */
  promptMacroId?: string;
  /** Actieve hoofdweergave in de viewer (documents, email, kanban). */
  activeView?: "documents" | "email" | "kanban" | string;
  /** Pad van het geopende Markdown-bestand (ook wanneer activeView niet documents is). */
  openDocumentPath?: string;
  /** Leesbare titel voor extern/Confluence-bestanden. */
  openDocumentLabel?: string;
  /** Inhoud van geopend document wanneer activeView niet documents is. */
  openDocumentMarkdown?: string;
};

/** Activiteit tijdens corpus-chat (server → client). */
export type CorpusActivityEvent = {
  type: "activity";
  phase?: string;
  label?: string;
  path?: string;
  detail?: string;
  model?: string;
  modelRole?: string;
  modelReason?: string;
  ts?: number;
};

export type ModelTraceEntry = {
  phase: string;
  model: string;
  ms?: number;
  experiment?: boolean;
};

export type AgentChatActivityRow = CorpusActivityEvent;

export type AgentChatOptions = {
  onCorpusActivity?: (ev: CorpusActivityEvent) => void;
};

/** Server debug-payload bij `debugLlm`; vooral nuttig bij MCP-assistants zonder JSON in `content`. */
export type AgentChatLlmDebug = Record<string, unknown>;

export type AgentTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AgentPerformanceMetrics = {
  durationMs?: number;
  llmMs?: number;
  llmCallCount?: number;
  toolCallCount?: number;
  contextChars?: number;
  approxContextTokens?: number;
  retrievedChars?: number;
  approxRetrievedTokens?: number;
  replyChars?: number;
  tokenUsage?: AgentTokenUsage;
  retrievalMeta?: unknown;
};

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
  runId?: string;
  markdown?: string;
  changed?: boolean;
  wroteFile?: boolean;
  /** Actueel pad na Corpus Gardener-verplaatsing. */
  documentPath?: string;
  movedFrom?: string;
  movedTo?: string;
  debugLlm?: AgentChatLlmDebug;
  /** Alleen bij corpus zonder NDJSON-stream. */
  activities?: AgentChatActivityRow[];
  /** Alleen corpus Ask met bibliotheek: model kan bronnen laten zien in de viewer. */
  viewerActions?: ViewerAgentAction[];
  /** Performance- en tokenmetadata voor deze call, indien beschikbaar. */
  performanceMetrics?: AgentPerformanceMetrics;
  /** Auto-router: welke modellen per fase zijn gebruikt. */
  modelTrace?: ModelTraceEntry[];
  /** Paden van tijdens deze run nieuw aangemaakte .md-bestanden (corpus Ask). */
  corpusCreatedPaths?: string[];
  /** Geheugenacties die direct door de server zijn uitgevoerd. */
  executedMemoryActions?: AgentMemoryAction[];
  /** Geheugenacties die eerst bevestiging vragen. */
  pendingMemoryActions?: AgentMemoryAction[];
  /** Gestructureerde evidence uit Nexus toolcontext (debug/Ask). */
  structuredToolContext?: {
    reply?: string;
    evidence?: { path: string; sourceType?: string; excerpt?: string; sectionId?: string; possiblyStale?: boolean }[];
    assumptions?: { claim: string; derivedFrom?: string[] }[];
    sourceConflicts?: { summary: string }[];
    nextActions?: unknown[];
  } | null;
  evidenceFooter?: string | null;
  /** Achtergrond-memoryreflectie gepland na deze turn (organisch, niet-blokkerend). */
  organicMemoryReflection?: { scheduled: boolean; reason?: string };
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

function numberOrUndefined(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function normalizeTokenUsageWire(raw: unknown): AgentTokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: AgentTokenUsage = {
    promptTokens: numberOrUndefined(o.promptTokens),
    completionTokens: numberOrUndefined(o.completionTokens),
    totalTokens: numberOrUndefined(o.totalTokens),
  };
  return out.promptTokens || out.completionTokens || out.totalTokens ? out : undefined;
}

function normalizePerformanceMetricsWire(raw: unknown): AgentPerformanceMetrics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: AgentPerformanceMetrics = {
    durationMs: numberOrUndefined(o.durationMs),
    llmMs: numberOrUndefined(o.llmMs),
    llmCallCount: numberOrUndefined(o.llmCallCount),
    toolCallCount: numberOrUndefined(o.toolCallCount),
    contextChars: numberOrUndefined(o.contextChars),
    approxContextTokens: numberOrUndefined(o.approxContextTokens),
    retrievedChars: numberOrUndefined(o.retrievedChars),
    approxRetrievedTokens: numberOrUndefined(o.approxRetrievedTokens),
    replyChars: numberOrUndefined(o.replyChars),
    tokenUsage: normalizeTokenUsageWire(o.tokenUsage),
    retrievalMeta: o.retrievalMeta,
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

function normalizeModelTraceWire(raw: unknown): ModelTraceEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ModelTraceEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const phase = typeof o.phase === "string" ? o.phase : "";
    const model = typeof o.model === "string" ? o.model : "";
    if (!phase || !model) continue;
    out.push({
      phase,
      model,
      ms: numberOrUndefined(o.ms),
      experiment: o.experiment === true,
    });
  }
  return out.length ? out : undefined;
}

export function isNetworkFetchFailure(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "");
  return /failed to fetch|networkerror|load failed|network request failed|aborted|timeout|ECONNRESET|socket hang up/i.test(
    msg,
  );
}

/**
 * Na verbroken verbinding: poll review-state op de server (gespreksverslag/agent kan wél klaar zijn).
 */
export async function recoverAgentDocumentProposal(
  docPath: string,
  userMessageHint = "",
): Promise<AgentChatResponse | null> {
  const hint = userMessageHint.trim();
  const hintHead = hint.slice(0, 120);
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200 + attempt * 500));
    }
    try {
      const pack = await fetchReviewComments(docPath);
      const pending = pack.comments.filter((c) => {
        if (!lastReplyIsFromAgent(c)) return false;
        if (!hintHead) return true;
        const body = (c.body || "").trim();
        return body.includes(hintHead) || hintHead.includes(body.slice(0, 80));
      });
      const match = pending.at(-1) ?? pack.comments.filter(lastReplyIsFromAgent).at(-1);
      if (!match) continue;
      const lastReply = match.replies[match.replies.length - 1];
      const markdown = await fetchMarkdownFile(docPath);
      return {
        reply: lastReply?.body?.trim() || "Reviewvoorstel staat klaar op het document.",
        changed: true,
        markdown,
        wroteFile: true,
      };
    } catch {
      /* volgende poging */
    }
  }
  return null;
}

export async function agentChat(body: AgentChatRequestBody, options?: AgentChatOptions): Promise<AgentChatResponse> {
  const streamCorpus =
    body.activityStream !== false &&
    (body.mode === "agent" ||
      (body.mode === "ask" && (body.corpusWide === true || body.webSearch === true)));

  if (!streamCorpus) {
    const r = await apiFetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as AgentChatResponse & {
      error?: string;
      runId?: string;
      activities?: AgentChatActivityRow[];
    };
    if (!r.ok) {
      const err = new Error(data.error || `Agent-chat (${r.status})`) as Error & {
        partialReply?: string;
        debugLlm?: AgentChatLlmDebug;
        status?: number;
        runId?: string;
      };
      err.status = r.status;
      if (typeof data.runId === "string" && data.runId.trim()) err.runId = data.runId.trim();
      if (typeof data.reply === "string" && data.reply.trim()) err.partialReply = data.reply.trim();
      if (data.debugLlm && typeof data.debugLlm === "object") err.debugLlm = data.debugLlm as AgentChatLlmDebug;
      throw err;
    }
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      runId: typeof data.runId === "string" ? data.runId : undefined,
      markdown: typeof data.markdown === "string" ? data.markdown : undefined,
      changed: !!data.changed,
      wroteFile: !!data.wroteFile,
      documentPath: typeof data.documentPath === "string" ? data.documentPath : undefined,
      movedFrom: typeof data.movedFrom === "string" ? data.movedFrom : undefined,
      movedTo: typeof data.movedTo === "string" ? data.movedTo : undefined,
      debugLlm: data.debugLlm && typeof data.debugLlm === "object" ? (data.debugLlm as AgentChatLlmDebug) : undefined,
      activities: Array.isArray(data.activities) ? data.activities : undefined,
      viewerActions: normalizeViewerActionsWire(data.viewerActions),
      performanceMetrics: normalizePerformanceMetricsWire(data.performanceMetrics),
      modelTrace: normalizeModelTraceWire(data.modelTrace),
      corpusCreatedPaths: normalizeCorpusCreatedPaths(data.corpusCreatedPaths),
      executedMemoryActions: normalizeMemoryActionsWire(data.executedMemoryActions),
      pendingMemoryActions: normalizeMemoryActionsWire(data.pendingMemoryActions),
    };
  }

  const r = await apiFetch("/api/agent/chat", {
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
    let runId = "";
    try {
      const j = JSON.parse(text) as { error?: string; runId?: string };
      if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
      if (typeof j.runId === "string" && j.runId.trim()) runId = j.runId.trim();
    } catch {
      /* platte tekst */
    }
    const err = new Error(msg || `Agent-chat (${r.status})`) as Error & { status?: number; runId?: string };
    err.status = r.status;
    if (runId) err.runId = runId;
    throw err;
  }

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("ndjson")) {
    const data = (await r.json().catch(() => ({}))) as AgentChatResponse & { error?: string; runId?: string };
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      runId: typeof data.runId === "string" ? data.runId : undefined,
      markdown: typeof data.markdown === "string" ? data.markdown : undefined,
      changed: !!data.changed,
      wroteFile: !!data.wroteFile,
      documentPath: typeof data.documentPath === "string" ? data.documentPath : undefined,
      movedFrom: typeof data.movedFrom === "string" ? data.movedFrom : undefined,
      movedTo: typeof data.movedTo === "string" ? data.movedTo : undefined,
      debugLlm: data.debugLlm && typeof data.debugLlm === "object" ? (data.debugLlm as AgentChatLlmDebug) : undefined,
      activities: Array.isArray(data.activities) ? data.activities : undefined,
      viewerActions: normalizeViewerActionsWire(data.viewerActions),
      performanceMetrics: normalizePerformanceMetricsWire(data.performanceMetrics),
      modelTrace: normalizeModelTraceWire(data.modelTrace),
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
          runId: typeof obj.runId === "string" ? obj.runId : undefined,
          changed: !!obj.changed,
          wroteFile: !!obj.wroteFile,
          documentPath: typeof obj.documentPath === "string" ? obj.documentPath : undefined,
          movedFrom: typeof obj.movedFrom === "string" ? obj.movedFrom : undefined,
          movedTo: typeof obj.movedTo === "string" ? obj.movedTo : undefined,
          markdown: typeof obj.markdown === "string" ? obj.markdown : undefined,
          debugLlm:
            obj.debugLlm && typeof obj.debugLlm === "object"
              ? (obj.debugLlm as AgentChatLlmDebug)
              : undefined,
          viewerActions: normalizeViewerActionsWire(obj.viewerActions),
          performanceMetrics: normalizePerformanceMetricsWire(obj.performanceMetrics),
          modelTrace: normalizeModelTraceWire(obj.modelTrace),
          corpusCreatedPaths: normalizeCorpusCreatedPaths(obj.corpusCreatedPaths),
          executedMemoryActions: normalizeMemoryActionsWire(obj.executedMemoryActions),
          pendingMemoryActions: normalizeMemoryActionsWire(obj.pendingMemoryActions),
          organicMemoryReflection:
            obj.organicMemoryReflection && typeof obj.organicMemoryReflection === "object"
              ? {
                  scheduled: (obj.organicMemoryReflection as { scheduled?: boolean }).scheduled === true,
                  reason:
                    typeof (obj.organicMemoryReflection as { reason?: string }).reason === "string"
                      ? (obj.organicMemoryReflection as { reason?: string }).reason
                      : undefined,
                }
              : undefined,
        };
      }
      if (t === "error") {
        const err = new Error(typeof obj.error === "string" ? obj.error : "Corpus-chat fout") as Error & {
          runId?: string;
        };
        if (typeof obj.runId === "string" && obj.runId.trim()) err.runId = obj.runId.trim();
        throw err;
      }
    }
  }

  if (!donePayload) {
    throw new Error("Onvolledige corpus-response (geen afsluitregel).");
  }
  return donePayload;
}

export async function cleanupAgentTranscript(text: string): Promise<AgentTranscriptCleanupPayload> {
  const r = await apiFetch("/api/agent/transcript-cleanup", {
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
  const r = await apiFetch("/api/agent/memory-actions/apply", {
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
  const r = await apiFetch("/api/agent/memory-actions/revert", {
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
  const r = await apiFetch("/api/agent/logs", { method: "DELETE" });
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

export type NexusDebugLog = {
  ok: boolean;
  kind: "error" | "fix";
  path: string;
  content: string;
};

export type NexusDebugLogsResponse = {
  ok: boolean;
  error?: NexusDebugLog;
  fix?: NexusDebugLog;
};

export type NexusErrorLogInput = {
  title: string;
  component?: string;
  tool?: string;
  command?: string;
  error: string;
  context?: string;
  detail?: Record<string, unknown>;
};

export async function fetchNexusDebugLogs(kind: "error" | "fix" | "both" = "both"): Promise<NexusDebugLogsResponse> {
  const r = await apiFetch(`/api/nexus-debug/logs?${new URLSearchParams({ kind })}`);
  if (!r.ok) throw await jsonError(r, `nexus debug logs ${r.status}`);
  const data = (await r.json()) as NexusDebugLogsResponse | NexusDebugLog;
  if (kind === "error" || kind === "fix") {
    return { ok: data.ok === true, [kind]: data as NexusDebugLog };
  }
  return data as NexusDebugLogsResponse;
}

export async function appendNexusErrorLog(input: NexusErrorLogInput): Promise<{ ok: boolean; path?: string }> {
  const r = await apiFetch("/api/nexus-debug/error-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw await jsonError(r, `nexus error log ${r.status}`);
  return (await r.json()) as { ok: boolean; path?: string };
}

export async function cleanupNexusDebugIssue(errorId: string): Promise<{ ok: boolean; removed?: { error: number; fix: number } }> {
  const r = await apiFetch("/api/nexus-debug/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errorId }),
  });
  if (!r.ok) throw await jsonError(r, `nexus debug cleanup ${r.status}`);
  return (await r.json()) as { ok: boolean; removed?: { error: number; fix: number } };
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
    performanceMetrics: normalizePerformanceMetricsWire(o.performanceMetrics),
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
  const resolved = await fetchMarkdownFileResolved(name);
  return resolved.content;
}

export async function fetchMarkdownFileResolved(name: string): Promise<{ path: string; content: string }> {
  let current = name;
  for (let hop = 0; hop < 5; hop += 1) {
    const r = await fetch(`/api/markdown-file?${new URLSearchParams({ name: current })}`);
    if (!r.ok) throw new Error(`markdown-file ${r.status}`);
    const data = (await r.json()) as { content: string; redirectTo?: string; name?: string };
    const redirectTo = typeof data.redirectTo === "string" ? data.redirectTo.trim() : "";
    if (redirectTo && redirectTo !== current) {
      current = redirectTo;
      continue;
    }
    return { path: current, content: data.content };
  }
  throw new Error("Te veel redirect-stappen bij openen van markdown-bestand.");
}

export type CorpusSearchResult = {
  scope: string;
  score: number;
  path: string;
  title: string;
  docId: string | null;
  preview: string;
  tags: string[];
  isRedirect?: boolean;
  redirectTo?: string | null;
};

export type CorpusSearchPayload = {
  ok: boolean;
  query: string;
  results: CorpusSearchResult[];
  meta?: { algorithm?: string; returnedCount?: number; candidateCount?: number };
};

export async function searchCorpus(
  query: string,
  opts: { limit?: number; scope?: "working" | "memory" | "both" } = {},
): Promise<CorpusSearchPayload> {
  const params = new URLSearchParams({ q: query });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.scope) params.set("scope", opts.scope);
  const r = await apiFetch(`/api/corpus-search?${params}`);
  if (!r.ok) throw await jsonError(r, `corpus-search ${r.status}`);
  return (await r.json()) as CorpusSearchPayload;
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

export type SaveMarkdownFileResult = {
  ok: boolean;
  name: string;
  movedFrom?: string;
  movedTo?: string;
};

/** Activiteit van de Corpus Gardener (server → client). */
export type CorpusOrganizerActivityEvent = {
  ts?: string;
  action?: string;
  from?: string;
  to?: string;
  docId?: string;
  path?: string;
  confidence?: number;
  rationale?: string;
  classifier?: string;
  reason?: string;
};

export async function saveMarkdownFile(name: string, content: string): Promise<SaveMarkdownFileResult> {
  const r = await fetch("/api/markdown-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `save markdown ${r.status}`);
  }
  const data = (await r.json()) as SaveMarkdownFileResult;
  return {
    ok: data.ok === true,
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : name,
    movedFrom: typeof data.movedFrom === "string" ? data.movedFrom : undefined,
    movedTo: typeof data.movedTo === "string" ? data.movedTo : undefined,
  };
}

export async function fetchCorpusOrganizerActivity(days = 1): Promise<{
  ok: boolean;
  events: CorpusOrganizerActivityEvent[];
}> {
  const r = await fetch(
    `/api/corpus-organizer/activity?${new URLSearchParams({ days: String(Math.max(1, Math.min(90, days))) })}`,
  );
  if (!r.ok) throw new Error(`corpus-organizer activity ${r.status}`);
  const data = (await r.json()) as { ok?: boolean; events?: CorpusOrganizerActivityEvent[] };
  return {
    ok: data.ok === true,
    events: Array.isArray(data.events) ? data.events : [],
  };
}

/** Naamloos werkdocument in 00-inbox/ (Corpus Gardener hernoemt na voldoende inhoud). */
export async function createNewWorkDocumentDraft(): Promise<{ name: string; content: string; docId?: string }> {
  const r = await fetch("/api/markdown-file/new-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `new draft ${r.status}`);
  }
  const data = (await r.json()) as { name: string; content: string; docId?: string };
  return { name: data.name, content: data.content, docId: data.docId };
}

export async function deleteMarkdownFile(name: string): Promise<void> {
  const r = await fetch(`/api/markdown-file?${new URLSearchParams({ name })}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `delete markdown ${r.status}`);
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
  const r = await apiFetch("/api/docx/templates");
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
  const r = await apiFetch("/api/docx/export", {
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
