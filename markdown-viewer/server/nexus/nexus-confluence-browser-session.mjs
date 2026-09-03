/**
 * Haal Confluence SSO-cookies op uit de lokale Chrome/Edge-sessie via CDP.
 * Vereist dat de browser met --remote-debugging-port draait (zelfde Windows-profiel).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeSetCookieHeaders, normalizeConfluenceBaseUrl } from "./nexus-confluence.mjs";

const DEFAULT_CDP_PORTS = [9224, 9222, 9223];
const CDP_CALL_TIMEOUT_MS = 8000;
const EDGE_PROFILE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".confluence-edge-profile");
const DEFAULT_CONFLUENCE_URL = "https://confluence.hosted-tools.com";

let cachedBrowserCookie = "";
let cachedBrowserCookies = [];
let lastSyncAt = "";
let lastSyncError = "";
let lastSyncSource = "";

function trimEnv(value) {
  return String(value || "").trim();
}

export function browserSessionSyncEnabled(env = process.env) {
  const raw = trimEnv(env.CONFLUENCE_BROWSER_SESSION).toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "disabled") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "auto") return true;
  return process.platform === "win32";
}

export function getBrowserSyncedCookie() {
  return cachedBrowserCookie;
}

export function clearBrowserSyncedCookie() {
  cachedBrowserCookie = "";
  cachedBrowserCookies = [];
  lastSyncAt = "";
  lastSyncError = "";
  lastSyncSource = "";
}

export function getCachedBrowserCookies() {
  return cachedBrowserCookies.slice();
}

export function browserSessionStatus(env = process.env) {
  return {
    enabled: browserSessionSyncEnabled(env),
    hasCookie: !!cachedBrowserCookie,
    lastSyncAt: lastSyncAt || undefined,
    lastSyncSource: lastSyncSource || undefined,
    lastError: lastSyncError || undefined,
    cdpCandidates: discoverCdpEndpointCandidates(env),
  };
}

export function discoverCdpEndpointCandidates(env = process.env) {
  const configured = trimEnv(env.CONFLUENCE_BROWSER_CDP_URL);
  if (configured) {
    return [normalizeCdpBase(configured)];
  }
  return DEFAULT_CDP_PORTS.map((port) => `http://127.0.0.1:${port}`);
}

function normalizeCdpBase(raw) {
  return trimEnv(raw).replace(/\/json(?:\/.*)?$/i, "").replace(/\/+$/, "");
}

export function selectCdpPageTarget(targets = [], preferHost = "") {
  const pages = targets.filter(
    (target) =>
      target?.type === "page" &&
      target.webSocketDebuggerUrl &&
      !String(target.url || "").startsWith("devtools://"),
  );
  const needle = String(preferHost || "").toLowerCase();
  if (needle) {
    const preferred = pages.find((target) => String(target.url || "").toLowerCase().includes(needle));
    if (preferred) return preferred;
  }
  return (
    pages.find((target) => String(target.url || "").includes("confluence.hosted-tools.com")) ||
    pages.find((target) => String(target.url || "").includes("jira.hosted-tools.com")) ||
    pages.find((target) => String(target.url || "").includes("hosted-tools.com")) ||
    pages[0] ||
    null
  );
}

export function filterRelevantConfluenceCookies(cookies = []) {
  return (cookies || []).filter((item) => {
    const hay = `${item.domain || ""} ${item.name || ""}`.toLowerCase();
    return (
      hay.includes("hosted-tools") ||
      hay.includes("confluence") ||
      hay.includes("jira") ||
      hay.includes("atlassian") ||
      hay.includes("microsoftonline") ||
      hay.includes("login.microsoft")
    );
  });
}

export function rememberBrowserSyncedCookie(cookie, source = "manual") {
  const value = trimEnv(cookie);
  if (!value) return;
  cachedBrowserCookie = value;
  lastSyncAt = new Date().toISOString();
  lastSyncSource = source;
  lastSyncError = "";
}

export function formatCookiesForHeader(cookies = []) {
  const jar = new Map();
  for (const cookie of cookies) {
    const name = trimEnv(cookie?.name);
    if (!name) continue;
    jar.set(name, String(cookie?.value ?? ""));
  }
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function cookieMatchesUrl(cookie, urlString) {
  if (!cookie || !urlString) return false;
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const rawDomain = String(cookie.domain || "").toLowerCase();
  const allowSubdomains = rawDomain.startsWith(".");
  const domain = rawDomain.replace(/^\./, "") || host;
  if (allowSubdomains) {
    if (host !== domain && !host.endsWith(`.${domain}`)) return false;
  } else if (host !== domain) {
    return false;
  }
  const path = cookie.path || "/";
  const reqPath = url.pathname || "/";
  if (path !== "/" && reqPath !== path && !reqPath.startsWith(path.endsWith("/") ? path : `${path}/`)) {
    return false;
  }
  return true;
}

export function formatCookiesForUrl(cookies = [], urlString = "") {
  const jar = new Map();
  for (const cookie of cookies) {
    const name = trimEnv(cookie?.name);
    if (!name || !cookieMatchesUrl(cookie, urlString)) continue;
    const domain = String(cookie.domain || "").replace(/^\./, "");
    const specificity = domain.length;
    const existing = jar.get(name);
    if (!existing || specificity >= existing.specificity) {
      jar.set(name, { value: String(cookie.value ?? ""), specificity });
    }
  }
  return Array.from(jar.entries())
    .map(([name, item]) => `${name}=${item.value}`)
    .join("; ");
}

export function rememberBrowserSyncedCookies(cookies, source = "manual") {
  cachedBrowserCookies = Array.isArray(cookies) ? cookies.filter((item) => trimEnv(item?.name)) : [];
  rememberBrowserSyncedCookie(formatCookiesForHeader(cachedBrowserCookies), source);
}

export function resolveBrowserCookieHeaderForUrl(urlString, env = process.env) {
  primeBrowserCookieFromDisk(env);
  const structured = getCachedBrowserCookies();
  if (structured.length && urlString) {
    return formatCookiesForUrl(structured, urlString);
  }
  return getBrowserSyncedCookie();
}

function cookieFilePath(env = process.env) {
  const filePath = trimEnv(env.CONFLUENCE_COOKIE_FILE);
  if (!filePath) return "";
  const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

function persistBrowserCookie(cookie, env = process.env) {
  const target = cookieFilePath(env);
  if (!target || !cookie) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${cookie}\n`, "utf8");
}

function loadPersistedBrowserCookie(env = process.env) {
  const target = cookieFilePath(env);
  if (!target || !fs.existsSync(target)) return "";
  try {
    return trimEnv(fs.readFileSync(target, "utf8"));
  } catch {
    return "";
  }
}

export function primeBrowserCookieFromDisk(env = process.env) {
  if (cachedBrowserCookie) return cachedBrowserCookie;
  const fromDisk = loadPersistedBrowserCookie(env);
  if (fromDisk) {
    cachedBrowserCookie = fromDisk;
    lastSyncSource = "cookie-file";
  }
  return cachedBrowserCookie;
}

async function fetchJson(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveCdpEndpoint(env = process.env, preferHost = "") {
  for (const base of discoverCdpEndpointCandidates(env)) {
    const version = await fetchJson(`${base}/json/version`);
    if (!version) continue;
    const targets = (await fetchJson(`${base}/json`)) || [];
    const page = selectCdpPageTarget(targets, preferHost);
    const webSocketDebuggerUrl = page?.webSocketDebuggerUrl || version.webSocketDebuggerUrl;
    if (!webSocketDebuggerUrl) continue;
    return {
      base,
      browser: version.Browser || "Edge",
      webSocketDebuggerUrl,
      browserWebSocketDebuggerUrl: version.webSocketDebuggerUrl,
      pageUrl: page?.url,
    };
  }
  return null;
}

function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP-verbinding timeout")), CDP_CALL_TIMEOUT_MS);
    ws.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("CDP-verbinding mislukt"));
      },
      { once: true },
    );
  });

  ws.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data || ""));
    } catch {
      return;
    }
    if (!message?.id || !pending.has(message.id)) return;
    pending.get(message.id)(message);
    pending.delete(message.id);
  });

  async function call(method, params = {}) {
    await ready;
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP-timeout voor ${method}`));
      }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(message.error.message || `CDP-fout bij ${method}`));
          return;
        }
        resolve(message.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function close() {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    } catch {
      // ignore
    }
  }

  return { call, close };
}

export function browserSessionHelpText(env = process.env) {
  const ports = discoverCdpEndpointCandidates(env)
    .map((base) => base.match(/:(\d+)$/)?.[1])
    .filter(Boolean)
    .join(" of ");
  return [
    "Nexus hergebruikt een echte Edge-SSO-sessie via Chrome DevTools Protocol (CDP).",
    "Klik in iOMS op Browser-sessie / Open Edge, of start zelf:",
    `msedge.exe --remote-debugging-port=${ports.split(" of ")[0] || "9224"} --user-data-dir=<iOMS>/.confluence-edge-profile`,
    "Log in tot je de Confluence-wiki ziet, daarna opnieuw synchroniseren.",
    `CDP-poorten: ${ports || "9224"}.`,
  ].join(" ");
}

function findEdgeExecutable() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function cdpPortFromEnv(env = process.env) {
  const configured = trimEnv(env.CONFLUENCE_BROWSER_CDP_URL);
  const fromUrl = configured.match(/:(\d+)/)?.[1];
  return Number(fromUrl || env.CONFLUENCE_BROWSER_CDP_PORT || DEFAULT_CDP_PORTS[0]) || 9224;
}

export async function startConfluenceDebugEdge(env = process.env) {
  const baseUrl = normalizeConfluenceBaseUrl(env.CONFLUENCE_BASE_URL) || DEFAULT_CONFLUENCE_URL;
  const existing = await resolveCdpEndpoint(env);
  if (existing) {
    return { ok: true, alreadyRunning: true, endpoint: existing.base, browser: existing.browser, pageUrl: existing.pageUrl };
  }
  const edge = findEdgeExecutable();
  if (!edge) {
    return { ok: false, error: "Microsoft Edge niet gevonden. Start Edge zelf met --remote-debugging-port=9224." };
  }
  const port = cdpPortFromEnv(env);
  fs.mkdirSync(EDGE_PROFILE_DIR, { recursive: true });
  const child = spawn(
    edge,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${EDGE_PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      baseUrl,
    ],
    { detached: true, stdio: "ignore", windowsHide: false },
  );
  child.unref();
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const endpoint = await resolveCdpEndpoint({ ...env, CONFLUENCE_BROWSER_CDP_URL: `http://127.0.0.1:${port}` });
    if (endpoint) {
      return { ok: true, alreadyRunning: false, endpoint: endpoint.base, browser: endpoint.browser, pageUrl: endpoint.pageUrl };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { ok: false, error: `Edge is gestart maar CDP op ${port} kwam niet omhoog.` };
}

export async function syncConfluenceBrowserSession(env = process.env, { preferHost = "" } = {}) {
  if (!browserSessionSyncEnabled(env)) {
    return { ok: false, cookie: "", error: "Browser-sessiesync is uitgeschakeld (CONFLUENCE_BROWSER_SESSION=0)." };
  }

  const baseUrl = normalizeConfluenceBaseUrl(env.CONFLUENCE_BASE_URL);
  const jiraBase = trimEnv(env.JIRA_BASE_URL).replace(/\/+$/, "");
  const urls = Array.from(
    new Set(
      [
        baseUrl,
        DEFAULT_CONFLUENCE_URL,
        jiraBase,
        "https://jira.hosted-tools.com",
        "https://auth.hosted-tools.com",
        "https://login.microsoftonline.com",
      ].filter(Boolean),
    ),
  );

  const endpoint = await resolveCdpEndpoint(env, preferHost);
  if (!endpoint) {
    lastSyncError = browserSessionHelpText(env);
    return { ok: false, cookie: "", error: lastSyncError, cdpAvailable: false };
  }

  const client = createCdpClient(endpoint.webSocketDebuggerUrl);
  try {
    await client.call("Network.enable");
    let cookies = [];
    try {
      const all = await client.call("Network.getAllCookies");
      cookies = filterRelevantConfluenceCookies(all?.cookies || []);
    } catch {
      cookies = [];
    }
    if (!cookies.length) {
      const result = await client.call("Network.getCookies", { urls });
      cookies = result?.cookies || [];
    }
    const cookie = formatCookiesForHeader(cookies);
    if (!cookie) {
      lastSyncError = "Geen Confluence SSO-cookies gevonden in de browser. Open Confluence eerst in die browser.";
      return { ok: false, cookie: "", error: lastSyncError, cdpAvailable: true, endpoint: endpoint.base };
    }
    rememberBrowserSyncedCookies(cookies, endpoint.base);
    persistBrowserCookie(cookie, env);
    return {
      ok: true,
      cookie,
      cookieCount: cookies.length,
      cookieKeys: cookies.map((item) => item.name).filter(Boolean),
      endpoint: endpoint.base,
      pageUrl: endpoint.pageUrl,
      syncedAt: lastSyncAt,
    };
  } catch (error) {
    lastSyncError = String(error?.message || error);
    return { ok: false, cookie: "", error: lastSyncError, cdpAvailable: true, endpoint: endpoint.base };
  } finally {
    await client.close();
  }
}

function cookieHeaderToSetCookieLines(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .map((part) => `${part}; Path=/`);
}

export function mergeConfluenceCookieHeaders(...cookieHeaders) {
  let merged = "";
  for (const header of cookieHeaders) {
    if (!header) continue;
    merged = mergeSetCookieHeaders(merged, {
      headers: {
        getSetCookie: () => cookieHeaderToSetCookieLines(header),
        get: () => null,
      },
    });
  }
  return merged;
}

export function resolveConfluenceCookieHeader(config, env = process.env) {
  const manual = trimEnv(config?.manualCookie);
  if (manual) return mergeConfluenceCookieHeaders(manual, "");
  const target = config?.baseUrl || DEFAULT_CONFLUENCE_URL;
  if (getCachedBrowserCookies().length) return resolveBrowserCookieHeaderForUrl(target, env);
  const browser = primeBrowserCookieFromDisk(env) || getBrowserSyncedCookie();
  return mergeConfluenceCookieHeaders(manual, browser);
}
