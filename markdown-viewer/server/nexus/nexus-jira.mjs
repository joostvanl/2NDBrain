/**
 * Jira HTTP-client — read-only REST v2.
 * PAT (Bearer) plus hosted-tools SSO-detectie; hergebruikt de Confluence/CDP cookie-jar.
 */

import {
  isHostedToolsAuthPage,
  isHostedToolsAuthRedirect,
  mergeSetCookieHeaders,
} from "./nexus-confluence.mjs";
import {
  browserSessionStatus,
  browserSessionSyncEnabled,
  getBrowserSyncedCookie,
  mergeConfluenceCookieHeaders,
  primeBrowserCookieFromDisk,
  resolveBrowserCookieHeaderForUrl,
  syncConfluenceBrowserSession,
} from "./nexus-confluence-browser-session.mjs";

const JIRA_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const DEFAULT_BASE_EXAMPLE = "https://jira.hosted-tools.com";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]+-\d+)\b/;
const SEARCH_FIELDS = "summary,status,assignee,updated,issuetype,priority,created";
const ISSUE_FIELDS = "summary,description,status,priority,assignee,reporter,labels,comment,updated,created,issuetype";

function trimEnv(value) {
  return String(value || "").trim();
}

export function normalizeJiraBaseUrl(raw) {
  return trimEnv(raw).replace(/\/+$/, "");
}

export function redactJiraSecrets(value, pat = "") {
  let out = String(value || "");
  const secret = trimEnv(pat);
  if (secret && out.includes(secret)) out = out.split(secret).join("[redacted]");
  return out;
}

export function buildJiraClientConfig(env = process.env) {
  const baseUrl = normalizeJiraBaseUrl(env.JIRA_BASE_URL);
  const pat = trimEnv(env.JIRA_PAT);
  const timeoutMs = Number(env.JIRA_TIMEOUT_MS);
  return {
    baseUrl,
    pat,
    hasPat: !!pat,
    configured: !!baseUrl && !!pat,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : 20000,
  };
}

export function buildJiraAuthorizationHeader(config) {
  const headers = { Accept: "application/json", "User-Agent": JIRA_BROWSER_UA };
  if (config?.pat) headers.Authorization = `Bearer ${config.pat}`;
  return headers;
}

export function jiraIssueKeyFromInput(input = "") {
  const raw = trimEnv(input);
  if (!raw) return "";
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const browse = url.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (browse) return browse[1].toUpperCase();
    const selected = url.searchParams.get("selectedIssue");
    if (selected && ISSUE_KEY_RE.test(selected)) return selected.toUpperCase();
  } catch {
    /* not a URL */
  }
  const match = raw.toUpperCase().match(ISSUE_KEY_RE);
  return match ? match[1] : "";
}

export function looksLikeJql(value) {
  const s = trimEnv(value);
  if (!s) return false;
  if (
    /\b(project|key|issuekey|status|assignee|reporter|issuetype|priority|updated|created|resolved|resolutiondate|sprint|labels|fixVersion|component|summary|comment|cf\[\d+\])\s*(=|!=|~|>|<|>=|<=|\bin\b|\bnot in\b|\bis\b|\bwas\b)/i.test(
      s,
    )
  ) {
    return true;
  }
  return /\b(AND|OR|ORDER BY)\b/i.test(s) && /\bproject\b/i.test(s);
}

export function jqlFromSearchInput({ jql = "", query = "" } = {}) {
  const explicit = trimEnv(jql);
  if (explicit) return explicit;
  const q = trimEnv(query);
  if (!q) return "";
  if (looksLikeJql(q)) return q;
  const key = jiraIssueKeyFromInput(q);
  if (key && key === q.toUpperCase()) return `key = ${key}`;
  return `text ~ "${q.replace(/"/g, '\\"')}"`;
}

function displayName(user) {
  if (!user || typeof user !== "object") return "";
  return trimEnv(user.displayName || user.name || user.emailAddress);
}

function statusName(issue) {
  return trimEnv(issue?.fields?.status?.name);
}

export function adfToPlainText(node, depth = 0) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";
  if (node.type === "text") return String(node.text || "");
  const kids = Array.isArray(node.content) ? node.content.map((child) => adfToPlainText(child, depth + 1)).join("") : "";
  if (node.type === "paragraph" || node.type === "heading") return `${kids}\n`;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "listItem") return `- ${kids}\n`;
  return kids;
}

export function jiraDescriptionToText(description) {
  if (description == null) return "";
  if (typeof description === "string") return description;
  return adfToPlainText(description).trim();
}

function truncate(value, max = 4000) {
  const s = String(value || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function mapJiraSearchIssue(issue, baseUrl) {
  const key = trimEnv(issue?.key);
  const browseUrl = key && baseUrl ? `${normalizeJiraBaseUrl(baseUrl)}/browse/${key}` : "";
  return {
    key,
    summary: trimEnv(issue?.fields?.summary),
    status: statusName(issue),
    issueType: trimEnv(issue?.fields?.issuetype?.name),
    priority: trimEnv(issue?.fields?.priority?.name),
    assignee: displayName(issue?.fields?.assignee),
    updated: trimEnv(issue?.fields?.updated),
    url: browseUrl,
  };
}

export function mapJiraIssue(issue, baseUrl, { commentLimit = 8, maxChars = 8000 } = {}) {
  const mapped = mapJiraSearchIssue(issue, baseUrl);
  const comments = Array.isArray(issue?.fields?.comment?.comments) ? issue.fields.comment.comments : [];
  const description = truncate(jiraDescriptionToText(issue?.fields?.description), maxChars);
  return {
    ...mapped,
    reporter: displayName(issue?.fields?.reporter),
    labels: Array.isArray(issue?.fields?.labels) ? issue.fields.labels.map((item) => String(item)) : [],
    created: trimEnv(issue?.fields?.created),
    description,
    comments: comments.slice(-commentLimit).map((item) => ({
      author: displayName(item?.author),
      created: trimEnv(item?.created),
      body: truncate(jiraDescriptionToText(item?.body), 1200),
    })),
  };
}

export function jiraAuthFailure(response, bodyText, config) {
  const hostedToolsRedirect =
    isHostedToolsAuthRedirect(response) || isHostedToolsAuthPage(bodyText, response?.url);
  if (!config?.hasPat && !hostedToolsRedirect) {
    return "Jira is niet geconfigureerd. Zet JIRA_BASE_URL en JIRA_PAT in .env (voorbeeld: https://jira.hosted-tools.com).";
  }
  if (hostedToolsRedirect) {
    return (
      "Jira REST wordt onderschept door hosted-tools SSO (auth.hosted-tools.com), net als Confluence. " +
      "PAT-only volstaat daar meestal niet. Open Jira in dezelfde debug-Edge (poort 9224) als Confluence " +
      "en sync de browser-sessie. Geen Jira-knop in de UI."
    );
  }
  if (response?.status === 401 || response?.status === 403) {
    return `Jira authenticatie mislukt (${response.status}). Controleer JIRA_PAT en JIRA_BASE_URL.`;
  }
  return "";
}

export function jiraConfigPayload(env = process.env) {
  const config = buildJiraClientConfig(env);
  const browserSession = browserSessionStatus(env);
  return {
    configured: config.configured,
    baseUrl: config.baseUrl || undefined,
    hasPat: config.hasPat,
    browserSession: {
      enabled: browserSession.enabled,
      hasCookie: browserSession.hasCookie,
      lastSyncAt: browserSession.lastSyncAt,
      lastError: browserSession.lastError,
    },
    help: config.configured
      ? undefined
      : "Zet JIRA_BASE_URL en JIRA_PAT. URL is configurabel; iO-voorbeeld is https://jira.hosted-tools.com.",
  };
}

function resolveJiraCookieHeader(env = process.env) {
  const config = buildJiraClientConfig(env);
  return resolveBrowserCookieHeaderForUrl(config.baseUrl || DEFAULT_BASE_EXAMPLE, env);
}

async function followJiraRedirects(url, init, fetchFn, { maxHops = 12 } = {}) {
  let currentUrl = String(url);
  let headers = { ...(init.headers || {}) };
  let lastResponse = null;
  for (let hop = 0; hop < maxHops; hop += 1) {
    lastResponse = await fetchFn(currentUrl, { ...init, headers, redirect: "manual" });
    const cookie = mergeSetCookieHeaders(headers.Cookie || "", lastResponse);
    if (cookie) headers = { ...headers, Cookie: cookie };
    if (lastResponse.status >= 300 && lastResponse.status < 400) {
      const location = lastResponse.headers.get("location") || "";
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    return {
      response: lastResponse,
      bodyText: await lastResponse.text(),
      hops: hop,
      finalUrl: currentUrl,
    };
  }
  return {
    response: lastResponse,
    bodyText: lastResponse ? await lastResponse.text() : "",
    hops: maxHops,
    finalUrl: currentUrl,
  };
}

export async function jiraFetch(url, options = {}, env = process.env) {
  const config = buildJiraClientConfig(env);
  const fetchFn = options.fetchFn || fetch;
  const extraHeaders = options.headers && typeof options.headers === "object" ? options.headers : {};
  const init = {
    method: options.method || "GET",
    redirect: "manual",
    headers: { ...buildJiraAuthorizationHeader(config), ...extraHeaders },
  };

  const skipBrowserSync = typeof options.fetchFn === "function" || !browserSessionSyncEnabled(env);
  if (!skipBrowserSync) {
    await syncConfluenceBrowserSession(env, { preferHost: "jira.hosted-tools.com" });
  }
  const cookieHeader = resolveJiraCookieHeader(env);
  if (cookieHeader) init.headers.Cookie = cookieHeader;

  let followed = await followJiraRedirects(url, init, fetchFn);
  const intercepted =
    isHostedToolsAuthRedirect(followed.response) ||
    isHostedToolsAuthPage(followed.bodyText, followed.finalUrl);
  if (!skipBrowserSync && intercepted) {
    const sync = await syncConfluenceBrowserSession(env, { preferHost: "jira.hosted-tools.com" });
    if (sync.cookie) {
      init.headers.Cookie = resolveJiraCookieHeader(env) || mergeConfluenceCookieHeaders(sync.cookie);
      followed = await followJiraRedirects(url, init, fetchFn);
    }
  }

  const authError = jiraAuthFailure(followed.response, followed.bodyText, config);
  return {
    ...followed,
    authError: authError ? redactJiraSecrets(authError, config.pat) : "",
    ssoIntercept:
      isHostedToolsAuthRedirect(followed.response) ||
      isHostedToolsAuthPage(followed.bodyText, followed.finalUrl),
  };
}

function apiUrl(config, apiPath, params = {}) {
  const url = new URL(`${config.baseUrl}${apiPath}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.href;
}

export async function searchJiraIssues({ jql = "", query = "", maxResults = 20, startAt = 0, fetchFn } = {}, env = process.env) {
  const config = buildJiraClientConfig(env);
  if (!config.baseUrl) {
    return { ok: false, error: "JIRA_BASE_URL ontbreekt.", results: [] };
  }
  if (!config.hasPat && !getBrowserSyncedCookie() && !primeBrowserCookieFromDisk(env)) {
    return { ok: false, error: jiraAuthFailure(null, "", config), results: [] };
  }
  const resolvedJql = jqlFromSearchInput({ jql, query });
  if (!resolvedJql) return { ok: false, error: "Geef jql of query op.", results: [] };
  const limit = Math.min(100, Math.max(1, Number(maxResults) || 20));
  const offset = Math.max(0, Number(startAt) || 0);
  const fetched = await jiraFetch(
    apiUrl(config, "/rest/api/2/search", {
      jql: resolvedJql,
      startAt: offset,
      maxResults: limit,
      fields: SEARCH_FIELDS,
    }),
    { fetchFn },
    env,
  );
  if (fetched.authError) {
    return { ok: false, error: fetched.authError, ssoIntercept: fetched.ssoIntercept, results: [] };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fetched.bodyText || "{}");
  } catch {
    return { ok: false, error: "Jira search response was geen JSON.", ssoIntercept: fetched.ssoIntercept, results: [] };
  }
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const total = Number(parsed.total) || issues.length;
  const nextStartAt = offset + issues.length < total ? offset + issues.length : undefined;
  return {
    ok: true,
    jql: resolvedJql,
    total,
    startAt: offset,
    nextStartAt,
    results: issues.map((issue) => mapJiraSearchIssue(issue, config.baseUrl)),
  };
}

export async function readJiraIssue({ key = "", url = "", fetchFn } = {}, env = process.env) {
  const config = buildJiraClientConfig(env);
  const issueKey = jiraIssueKeyFromInput(key || url);
  if (!issueKey) return { ok: false, error: "Geef een Jira issue-key of browse-URL op." };
  if (!config.baseUrl) return { ok: false, error: "JIRA_BASE_URL ontbreekt." };
  const fetched = await jiraFetch(
    apiUrl(config, `/rest/api/2/issue/${encodeURIComponent(issueKey)}`, { fields: ISSUE_FIELDS }),
    { fetchFn },
    env,
  );
  if (fetched.authError) {
    return { ok: false, error: fetched.authError, ssoIntercept: fetched.ssoIntercept, key: issueKey };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fetched.bodyText || "{}");
  } catch {
    return { ok: false, error: "Jira issue response was geen JSON.", ssoIntercept: fetched.ssoIntercept, key: issueKey };
  }
  if (!parsed.key) {
    return {
      ok: false,
      error: redactJiraSecrets(parsed.errorMessages?.[0] || "Jira issue niet gevonden.", config.pat),
      key: issueKey,
    };
  }
  return { ok: true, ...mapJiraIssue(parsed, config.baseUrl) };
}

export async function probeJiraSsoIntercept(env = process.env, fetchFn = fetch) {
  const baseUrl = normalizeJiraBaseUrl(env.JIRA_BASE_URL) || DEFAULT_BASE_EXAMPLE;
  const probeUrl = `${baseUrl}/rest/api/2/myself`;
  try {
    const response = await fetchFn(probeUrl, {
      redirect: "manual",
      headers: { Accept: "application/json", "User-Agent": JIRA_BROWSER_UA },
    });
    const location = response.headers?.get?.("location") || "";
    const bodyText = await response.text().catch(() => "");
    const ssoIntercept =
      isHostedToolsAuthRedirect(response) || isHostedToolsAuthPage(bodyText, location || probeUrl);
    return {
      ok: true,
      probeUrl,
      status: response.status,
      location: location || undefined,
      ssoIntercept,
      json: String(bodyText || "").trim().startsWith("{"),
    };
  } catch (error) {
    return { ok: false, probeUrl, error: String(error?.message || error) };
  }
}

export { DEFAULT_BASE_EXAMPLE as JIRA_DEFAULT_BASE_EXAMPLE };
