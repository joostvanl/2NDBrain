import { normalizeReviewCommentsList, type ReviewComment } from "./reviewComments";

/** Optioneel: zet `VITE_API_ORIGIN` (bijv. http://127.0.0.1:8787) zodat Word-export niet via de Vite-proxy gaat. */
function docxApiUrl(path: string): string {
  const origin = String(import.meta.env.VITE_API_ORIGIN || "").trim().replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${rel}` : rel;
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

export type AgentRunResult = {
  ok: boolean;
  name: string;
  processed: number;
  changed: number;
  failed: number;
  skipped: number;
  reviewRelativePath: string;
};

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
  const r = await fetch("/api/agent-config");
  if (!r.ok) throw await jsonError(r, `agent-config ${r.status}`);
  const data = (await r.json()) as Partial<AgentConfigPublic>;
  return {
    endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
    model: typeof data.model === "string" ? data.model : "",
    hasApiKey: !!data.hasApiKey,
  };
}

export async function saveAgentConfig(config: AgentConfigInput): Promise<AgentConfigPublic> {
  const r = await fetch("/api/agent-config", {
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

export async function runAgent(name: string): Promise<AgentRunResult> {
  const r = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await jsonError(r, `agent run ${r.status}`);
  return (await r.json()) as AgentRunResult;
}

export type AgentLogEntry = Record<string, unknown>;

export type AgentLogsResponse = {
  entries: AgentLogEntry[];
  total: number;
  max: number;
};

export async function fetchAgentLogs(limit = 200): Promise<AgentLogsResponse> {
  const r = await fetch(`/api/agent/logs?${new URLSearchParams({ limit: String(limit) })}`);
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
  const r = await fetch("/api/agent/logs", { method: "DELETE" });
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

export async function revertMarkdownToLastBackup(name: string): Promise<{ content: string }> {
  const r = await fetch("/api/markdown-revert-last", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
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

export async function fetchReviewComments(name: string): Promise<ReviewComment[]> {
  const r = await fetch(`/api/review-comments?${new URLSearchParams({ name })}`);
  if (!r.ok) throw new Error(`review-comments ${r.status}`);
  const data = (await r.json()) as { comments?: unknown };
  return normalizeReviewCommentsList(data.comments);
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
  const r = await fetch(docxApiUrl("/api/docx/templates"));
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `docx templates ${r.status}`);
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
  const r = await fetch(docxApiUrl("/api/docx/export"), {
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
