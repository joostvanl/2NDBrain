/**
 * Losse Confluence-toegang PoC.
 * Beste pad: cookies uit een echt browservenster (PoC-Edge via CDP of geplakte Cookie-header).
 * Fallback: formulierlogin op auth.hosted-tools.com.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.POC_PORT || 3480);
const CDP_PORT = Number(process.env.POC_CDP_PORT || 9224);
const DEFAULT_BASE = "https://confluence.hosted-tools.com";
const SSO_HOST = "auth.hosted-tools.com";
const EDGE_PROFILE = path.join(ROOT, ".edge-profile");
const CDP_TIMEOUT_MS = 8000;

let cachedBrowserCookie = "";
let cachedCookieSource = "";
let cachedCookieAt = "";

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serveIndex(res) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function trim(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(raw) {
  const value = trim(raw).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("Base URL moet met http:// of https:// beginnen.");
  }
  return value;
}

function normalizeSsoUser(raw) {
  const value = trim(raw);
  if (!value) return "";
  return value.includes("@") ? value.split("@")[0] : value;
}

function looksLikeJson(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function cookieNames(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

function formatCookies(cookies = []) {
  const jar = new Map();
  for (const cookie of cookies) {
    const name = trim(cookie?.name);
    if (!name) continue;
    jar.set(name, String(cookie?.value ?? ""));
  }
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function mergeSetCookieHeaders(existingCookie, response) {
  const jar = new Map();
  const ingest = (cookieLine) => {
    const part = String(cookieLine || "").split(";")[0]?.trim();
    if (!part || !part.includes("=")) return;
    const eq = part.indexOf("=");
    jar.set(part.slice(0, eq), part.slice(eq + 1));
  };
  for (const chunk of String(existingCookie || "").split(";")) ingest(chunk);
  const setCookies =
    typeof response?.headers?.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response?.headers?.get?.("set-cookie")].filter(Boolean);
  for (const line of setCookies) ingest(line);
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function normalizeCookieHeader(raw) {
  let text = trim(raw).replace(/^cookie:\s*/i, "");
  if (!text) return "";
  if (text.includes("\n") && !text.includes("=")) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^cookie:\s*/i, ""))
    .filter(Boolean)
    .join("; ")
    .replace(/\s*;\s*/g, "; ");
}

function rememberCookie(cookie, source) {
  if (!cookie) return;
  cachedBrowserCookie = cookie;
  cachedCookieSource = source;
  cachedCookieAt = new Date().toISOString();
}

function isSsoIntercept(response, bodyText) {
  const location = String(response.headers.get("location") || "");
  const hay = `${location}\n${response.url || ""}\n${String(bodyText || "").slice(0, 4000)}`.toLowerCase();
  return (
    location.includes(SSO_HOST) ||
    hay.includes(SSO_HOST) ||
    hay.includes("io tools authentication") ||
    hay.includes("welcome to io tools authentication")
  );
}

function extractAuthFormToken(html) {
  return String(html || "").match(/name="token"\s+value="([^"]*)"/i)?.[1] || "";
}

function extractAuthFormError(html) {
  return (
    String(html || "").match(/class="[^"]*error[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    String(html || "").match(/class="[^"]*alert[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    ""
  );
}

function summarizeUser(data) {
  if (!data || typeof data !== "object") return null;
  return {
    displayName: data.displayName || data.publicName || null,
    username: data.username || data.accountId || null,
    email: data.email || data.emailAddress || null,
    type: data.type || null,
  };
}

function summarizeSearch(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    size: Number(data?.size ?? results.length) || results.length,
    pages: results.slice(0, 5).map((item) => ({
      id: item.id || null,
      title: item.title || "(zonder titel)",
      type: item.type || "page",
    })),
  };
}

function findEdge() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
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

async function resolveCdp() {
  const base = `http://127.0.0.1:${CDP_PORT}`;
  const version = await fetchJson(`${base}/json/version`);
  if (!version) return null;
  const targets = (await fetchJson(`${base}/json`)) || [];
  const pages = targets.filter(
    (target) =>
      target?.type === "page" &&
      target.webSocketDebuggerUrl &&
      !String(target.url || "").startsWith("devtools://"),
  );
  const preferred =
    pages.find((target) => String(target.url || "").includes("confluence.hosted-tools.com")) ||
    pages.find((target) => String(target.url || "").includes("hosted-tools.com")) ||
    pages[0];
  const webSocketDebuggerUrl = preferred?.webSocketDebuggerUrl || version.webSocketDebuggerUrl;
  if (!webSocketDebuggerUrl) return null;
  return {
    base,
    browser: version.Browser || "Edge",
    webSocketDebuggerUrl,
    browserWebSocketDebuggerUrl: version.webSocketDebuggerUrl,
    pageUrl: preferred?.url,
  };
}

function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP-verbinding timeout")), CDP_TIMEOUT_MS);
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
      }, CDP_TIMEOUT_MS);
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

async function syncBrowserCookies(baseUrl) {
  const endpoint = await resolveCdp();
  if (!endpoint) {
    return {
      ok: false,
      cdpAvailable: false,
      error: `Geen PoC-Edge op poort ${CDP_PORT}. Klik “Open Confluence in PoC-Edge” of plak een Cookie-header.`,
    };
  }
  const urls = Array.from(
    new Set([baseUrl, DEFAULT_BASE, `https://${SSO_HOST}`, "https://login.microsoftonline.com"].filter(Boolean)),
  );
  const client = createCdpClient(endpoint.webSocketDebuggerUrl);
  try {
    await client.call("Network.enable");
    let cookies = [];
    try {
      const all = await client.call("Network.getAllCookies");
      cookies = (all?.cookies || []).filter((item) => {
        const hay = `${item.domain || ""} ${item.name || ""}`.toLowerCase();
        return (
          hay.includes("hosted-tools") ||
          hay.includes("confluence") ||
          hay.includes("atlassian") ||
          hay.includes("microsoftonline") ||
          hay.includes("login.microsoft")
        );
      });
    } catch {
      cookies = [];
    }
    if (!cookies.length) {
      const result = await client.call("Network.getCookies", { urls });
      cookies = result?.cookies || [];
    }
    const cookie = formatCookies(cookies);
    if (!cookie) {
      return {
        ok: false,
        cdpAvailable: true,
        endpoint: endpoint.base,
        browser: endpoint.browser,
        error: "PoC-Edge is verbonden, maar heeft nog geen Confluence-cookies. Log in in dat venster en probeer opnieuw.",
      };
    }
    rememberCookie(cookie, "poc-edge");
    return {
      ok: true,
      cdpAvailable: true,
      endpoint: endpoint.base,
      browser: endpoint.browser,
      cookie,
      cookieKeys: cookieNames(cookie),
      source: "poc-edge",
    };
  } catch (error) {
    return {
      ok: false,
      cdpAvailable: true,
      endpoint: endpoint.base,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close();
  }
}

async function waitForCdp(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const endpoint = await resolveCdp();
    if (endpoint) return endpoint;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

async function openConfluenceInCdp(baseUrl) {
  const endpoint = await resolveCdp();
  if (!endpoint) return { ok: false, error: "CDP niet beschikbaar" };
  const client = createCdpClient(endpoint.browserWebSocketDebuggerUrl || endpoint.webSocketDebuggerUrl);
  try {
    await client.call("Target.createTarget", { url: baseUrl || DEFAULT_BASE });
    return { ok: true, alreadyRunning: true, endpoint: endpoint.base, browser: endpoint.browser };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.close();
  }
}

async function startPocEdge(baseUrl) {
  const existing = await resolveCdp();
  if (existing) {
    const opened = await openConfluenceInCdp(baseUrl);
    return {
      ok: opened.ok,
      alreadyRunning: true,
      endpoint: existing.base,
      browser: existing.browser,
      error: opened.error,
    };
  }
  const edge = findEdge();
  if (!edge) {
    return { ok: false, error: "Microsoft Edge niet gevonden. Plak de Cookie-header uit je gewone browser." };
  }
  fs.mkdirSync(EDGE_PROFILE, { recursive: true });
  const child = spawn(
    edge,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${EDGE_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      baseUrl || DEFAULT_BASE,
    ],
    { detached: true, stdio: "ignore", windowsHide: false },
  );
  child.unref();
  const endpoint = await waitForCdp();
  if (!endpoint) {
    return {
      ok: false,
      error: `Edge is gestart maar CDP op ${CDP_PORT} kwam niet omhoog. Plak anders de Cookie-header.`,
    };
  }
  return { ok: true, alreadyRunning: false, endpoint: endpoint.base, browser: endpoint.browser };
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

async function probe(url, { pat = "", cookie = "" } = {}) {
  const started = Date.now();
  let currentUrl = url;
  let currentCookie = cookie;
  let response = null;
  let bodyText = "";
  let hops = 0;
  for (; hops < 12; hops += 1) {
    const headers = {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
    };
    if (pat) headers.Authorization = `Bearer ${pat}`;
    if (currentCookie) headers.Cookie = currentCookie;
    response = await fetch(currentUrl, { redirect: "manual", headers });
    currentCookie = mergeSetCookieHeaders(currentCookie, response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    bodyText = await response.text();
    break;
  }
  if (response && !bodyText && response.status >= 300 && response.status < 400) {
    bodyText = await response.text();
  }
  const location = response?.headers.get("location") || (currentUrl !== url ? currentUrl : "");
  const jsonOk = looksLikeJson(bodyText);
  let data = null;
  if (jsonOk) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = null;
    }
  }
  if (currentCookie !== cookie) rememberCookie(currentCookie, "redirect-jar");
  return {
    url,
    finalUrl: currentUrl,
    hops,
    status: response?.status || 0,
    ok: Boolean(response?.ok && jsonOk && data),
    ms: Date.now() - started,
    location,
    json: jsonOk,
    ssoIntercept: isSsoIntercept(response, bodyText) || String(currentUrl).includes(SSO_HOST),
    data,
    cookie: currentCookie,
    snippet: String(bodyText || "").replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

function hostedToolsPostUrl(authUrl) {
  const req = String(authUrl || "").match(/[?&]req=([^&]+)/)?.[1] || "";
  return req ? `https://${SSO_HOST}/?req=${req}` : `https://${SSO_HOST}/`;
}

async function followSsoRedirects(startUrl, cookie, pat) {
  let nextUrl = startUrl;
  let guard = 0;
  while (nextUrl && guard < 8) {
    guard += 1;
    const absolute = nextUrl.startsWith("http") ? nextUrl : `https://${SSO_HOST}${nextUrl}`;
    const headers = { Cookie: cookie };
    if (pat) headers.Authorization = `Bearer ${pat}`;
    const hop = await fetch(absolute, { redirect: "manual", headers });
    cookie = mergeSetCookieHeaders(cookie, hop);
    if (hop.status >= 300 && hop.status < 400) {
      nextUrl = hop.headers.get("location") || "";
      continue;
    }
    return { cookie, status: hop.status };
  }
  return { cookie, status: 0 };
}

async function loginHostedToolsSso(authUrl, user, password, pat) {
  const started = Date.now();
  const postUrl = hostedToolsPostUrl(authUrl);
  const authPage = await fetch(authUrl, { redirect: "manual" });
  let cookie = mergeSetCookieHeaders("", authPage);
  const html1 = await authPage.text();
  const token1 = extractAuthFormToken(html1);
  if (!token1) {
    return { ok: false, user, ms: Date.now() - started, cookieKeys: [], error: "Geen loginformulier op auth.hosted-tools.com" };
  }
  const step1 = await fetch(postUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ token: token1, user, password: "" }),
  });
  cookie = mergeSetCookieHeaders(cookie, step1);
  const html2 = await step1.text();
  const token2 = extractAuthFormToken(html2) || token1;
  const step1Error = extractAuthFormError(html2);
  const hasPassField = /name="pass"/i.test(html2);
  if (step1Error && !hasPassField) {
    return { ok: false, user, ms: Date.now() - started, cookieKeys: cookieNames(cookie), error: `Gebruikersnaam "${user}" afgewezen: ${step1Error}` };
  }
  const login = await fetch(postUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: hasPassField
      ? new URLSearchParams({ token: token2, pass: password })
      : new URLSearchParams({ token: token1, user, password }),
  });
  cookie = mergeSetCookieHeaders(cookie, login);
  const nextUrl = login.headers.get("location") || "";
  const loginHtml = await login.text();
  const loginError = extractAuthFormError(loginHtml);
  if (loginError && !nextUrl) {
    return { ok: false, user, ms: Date.now() - started, cookieKeys: cookieNames(cookie), error: `Wachtwoord geweigerd voor "${user}": ${loginError}` };
  }
  if (nextUrl) {
    const followed = await followSsoRedirects(nextUrl, cookie, pat);
    cookie = followed.cookie;
  }
  if (!cookie) {
    return { ok: false, user, ms: Date.now() - started, cookieKeys: [], error: `Geen sessiecookie na SSO-login voor "${user}"` };
  }
  return { ok: true, user, ms: Date.now() - started, cookie, cookieKeys: cookieNames(cookie) };
}

function interpret({ whoami, search, cookieSource, sso }) {
  if (whoami.ok) {
    const viaBrowser = cookieSource === "poc-edge" || cookieSource === "pasted" || cookieSource === "cached";
    return {
      ok: true,
      title: viaBrowser ? "Toegang via browser-sessie" : cookieSource === "sso-form" ? "Toegang via SSO" : "Toegang bevestigd",
      detail: viaBrowser
        ? "Confluence accepteert de hergebruikte browsersessie. PAT-only en de formulierlogin waren hiervoor niet genoeg."
        : cookieSource === "sso-form"
          ? "SSO-login gaf een werkende sessiecookie."
          : "De PAT wordt als Bearer-token geaccepteerd.",
    };
  }
  if (sso && !sso.ok) {
    return { ok: false, title: "SSO-login mislukt", detail: sso.error || "auth.hosted-tools.com wees de credentials af." };
  }
  if (whoami.ssoIntercept || search?.ssoIntercept) {
    return {
      ok: false,
      title: cookieSource ? "Sessie dekt REST-verkeer niet" : "SSO onderschept de API",
      detail: cookieSource
        ? "Er is een cookie gebruikt, maar Confluence stuurt nog naar auth.hosted-tools.com. Log in in PoC-Edge of plak de Cookie-header van een request die wél JSON teruggeeft."
        : "Open Confluence in PoC-Edge (echte browser-SSO) of plak een Cookie-header uit je gewone Edge.",
    };
  }
  if (whoami.status === 401 || whoami.status === 403) {
    return { ok: false, title: "Confluence weigerde de sessie", detail: "HTTP 401/403. Cookie of PAT heeft geen REST-rechten." };
  }
  return { ok: false, title: "Geen geldige API-response", detail: "Confluence gaf geen JSON terug." };
}

function packProbe(probeResult) {
  if (!probeResult) return null;
  return {
    status: probeResult.status,
    ms: probeResult.ms,
    json: probeResult.json,
    ssoIntercept: probeResult.ssoIntercept,
    location: probeResult.location || undefined,
    user: probeResult.ok ? summarizeUser(probeResult.data) : null,
    snippet: probeResult.ok ? undefined : probeResult.snippet,
    ...(probeResult.ok && probeResult.data?.results ? summarizeSearch(probeResult.data) : {}),
  };
}

function cookieSummary(cookie, source) {
  if (!cookie) return null;
  return { source, cookieCount: cookieNames(cookie).length, cookieKeys: cookieNames(cookie) };
}

async function statusPayload(baseUrl = DEFAULT_BASE) {
  const cdp = await resolveCdp();
  return {
    cdp: cdp
      ? { ok: true, endpoint: cdp.base, browser: cdp.browser, port: CDP_PORT }
      : { ok: false, port: CDP_PORT },
    cachedCookie: cachedBrowserCookie
      ? { has: true, source: cachedCookieSource, syncedAt: cachedCookieAt, keys: cookieNames(cachedBrowserCookie) }
      : { has: false },
    edgeInstalled: Boolean(findEdge()),
    baseUrl,
  };
}

async function checkAccess(body) {
  const pat = trim(body?.pat);
  const ssoUser = normalizeSsoUser(body?.ssoUser);
  const ssoPassword = String(body?.ssoPassword || "");
  const pasted = normalizeCookieHeader(body?.cookie);
  const baseUrl = normalizeBaseUrl(body?.baseUrl || DEFAULT_BASE);
  const whoamiUrl = `${baseUrl}/rest/api/user/current`;
  const searchUrl = `${baseUrl}/rest/api/content/search?cql=type=page&limit=3`;
  const steps = [];

  let cookie = "";
  let cookieSource = "";
  let browserSync = null;
  let sso = null;

  if (pasted) {
    cookie = pasted;
    cookieSource = "pasted";
    rememberCookie(cookie, "pasted");
    steps.push(`Geplakte Cookie-header: ${cookieNames(cookie).length} keys.`);
  } else {
    browserSync = await syncBrowserCookies(baseUrl);
    if (browserSync.ok) {
      cookie = browserSync.cookie;
      cookieSource = "poc-edge";
      steps.push(`Cookies uit PoC-Edge: ${browserSync.cookieKeys.length} keys.`);
    } else if (cachedBrowserCookie && cachedCookieSource !== "pasted") {
      cookie = cachedBrowserCookie;
      cookieSource = "cached";
      steps.push(`Eerder opgehaalde cookies (${cachedCookieSource}): ${cookieNames(cookie).length} keys.`);
    } else {
      steps.push(browserSync.error || "Geen browsercookies beschikbaar.");
    }
  }

  if (!pat && !cookie && !(ssoUser && ssoPassword)) {
    throw new Error("Geen sessie. Open Confluence in PoC-Edge, plak een Cookie-header, of vul SSO-gegevens in.");
  }

  let whoami = await probe(whoamiUrl, { pat, cookie });
  steps.push(
    whoami.ok
      ? `${cookieSource || "PAT"}: /rest/api/user/current gaf JSON.`
      : whoami.ssoIntercept
        ? `${cookieSource || "PAT-only"}: ${whoami.status} redirect naar auth.hosted-tools.com.`
        : `${cookieSource || "PAT-only"}: status ${whoami.status}.`,
  );

  if (!whoami.ok && whoami.ssoIntercept && ssoUser && ssoPassword) {
    sso = await loginHostedToolsSso(whoami.location || `https://${SSO_HOST}/`, ssoUser, ssoPassword, pat);
    steps.push(sso.ok ? `SSO-formulier als "${sso.user}" gaf ${sso.cookieKeys.length} cookies.` : `SSO-formulier mislukt: ${sso.error}`);
    if (sso.ok) {
      cookie = sso.cookie;
      cookieSource = "sso-form";
      whoami = await probe(whoamiUrl, { pat, cookie });
      steps.push(whoami.ok ? "Retry met SSO-formuliercookie: OK." : `Retry met SSO-formuliercookie: ${whoami.status}.`);
    }
  }

  let search = null;
  if (whoami.ok) {
    cookie = whoami.cookie || cookie;
    search = await probe(searchUrl, { pat, cookie });
    steps.push(search.ok ? `Search OK: ${search.data?.size ?? search.data?.results?.length ?? 0} pagina’s.` : `Search status ${search.status}.`);
  }

  const verdict = interpret({ whoami, search, cookieSource, sso });
  const authParts = [];
  if (pat) authParts.push("Bearer PAT");
  if (cookieSource === "poc-edge") authParts.push("PoC-Edge cookies");
  if (cookieSource === "pasted") authParts.push("geplakte cookie");
  if (cookieSource === "cached") authParts.push(`cached cookie (${cachedCookieSource})`);
  if (cookieSource === "sso-form") authParts.push(`SSO-formulier (${sso?.user})`);

  return {
    ok: verdict.ok,
    title: verdict.title,
    detail: verdict.detail,
    auth: authParts.join(" + ") || "geen",
    baseUrl,
    steps,
    browser: browserSync
      ? { ok: browserSync.ok, cdpAvailable: browserSync.cdpAvailable, error: browserSync.error, endpoint: browserSync.endpoint }
      : null,
    cookie: cookieSummary(cookie, cookieSource),
    sso: sso
      ? { ok: sso.ok, user: sso.user, ms: sso.ms, cookieCount: sso.cookieKeys.length, cookieKeys: sso.cookieKeys, error: sso.error }
      : null,
    whoami: packProbe(whoami),
    search: packProbe(search),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 256_000) {
        reject(new Error("Request te groot."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      serveIndex(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, await statusPayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/start-edge") {
      const body = await parseJsonBody(req);
      const baseUrl = normalizeBaseUrl(body.baseUrl || DEFAULT_BASE);
      json(res, 200, await startPocEdge(baseUrl));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sync-browser") {
      const body = await parseJsonBody(req);
      const baseUrl = normalizeBaseUrl(body.baseUrl || DEFAULT_BASE);
      json(res, 200, await syncBrowserCookies(baseUrl));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/check") {
      const body = await parseJsonBody(req);
      json(res, 200, await checkAccess(body));
      return;
    }
    json(res, 404, { ok: false, title: "Niet gevonden", detail: `${req.method} ${url.pathname}` });
  } catch (error) {
    json(res, 500, {
      ok: false,
      title: "Check mislukt",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Confluence PoC: http://127.0.0.1:${PORT}`);
  console.log(`PoC-Edge CDP-poort: ${CDP_PORT}. Cookies worden niet naar disk geschreven.`);
});
