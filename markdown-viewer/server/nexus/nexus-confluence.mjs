/**

 * Confluence HTTP-client — standaard PAT-only (Bearer of Basic username+PAT).

 * Gateway-login (auth.hosted-tools.com) alleen op expliciet verzoek via CONFLUENCE_AUTH_MODE=gateway.

 */



import fs from "node:fs";
import {
  browserSessionStatus,
  browserSessionSyncEnabled,
  mergeConfluenceCookieHeaders,
  primeBrowserCookieFromDisk,
  rememberBrowserSyncedCookie,
  resolveConfluenceCookieHeader,
  syncConfluenceBrowserSession,
} from "./nexus-confluence-browser-session.mjs";



const HOSTED_TOOLS_AUTH_HOST = "auth.hosted-tools.com";



let cachedGatewayCookie = "";

/** Voorkomt parallelle gateway-logins die elkaars sessie overschrijven. */

let gatewayLoginPromise = null;



function trimEnv(value) {

  return String(value || "").trim();

}



export function normalizeConfluenceBaseUrl(raw) {

  return trimEnv(raw).replace(/\/+$/, "");

}



export function isHostedToolsAuthRedirect(response) {

  if (!response) return false;

  if (response.status !== 301 && response.status !== 302 && response.status !== 303 && response.status !== 307) {

    return false;

  }

  const location = String(response.headers?.get?.("location") || "");

  return location.includes(HOSTED_TOOLS_AUTH_HOST);

}



export function isHostedToolsAuthPage(bodyText, finalUrl = "") {

  const hay = `${finalUrl}\n${String(bodyText || "").slice(0, 4000)}`.toLowerCase();

  return (

    hay.includes(HOSTED_TOOLS_AUTH_HOST) ||

    hay.includes("io tools authentication") ||

    hay.includes("welcome to io tools authentication")

  );

}



export function mergeSetCookieHeaders(existingCookie, response) {

  const jar = new Map();

  const ingest = (cookieLine) => {

    const part = String(cookieLine || "").split(";")[0]?.trim();

    if (!part || !part.includes("=")) return;

    const eq = part.indexOf("=");

    jar.set(part.slice(0, eq), part.slice(eq + 1));

  };

  for (const chunk of String(existingCookie || "").split(";")) {

    ingest(chunk);

  }

  const setCookies =

    typeof response?.headers?.getSetCookie === "function"

      ? response.headers.getSetCookie()

      : [response?.headers?.get?.("set-cookie")].filter(Boolean);

  for (const line of setCookies) ingest(line);

  return Array.from(jar.entries())

    .map(([k, v]) => `${k}=${v}`)

    .join("; ");

}



function patAuthFailureHint(config, { hostedToolsRedirect = false } = {}) {

  const parts = [

    "Confluence authenticatie mislukt. Controleer CONFLUENCE_BASE_URL en CONFLUENCE_PAT (geldig, niet verlopen).",

  ];

  if (hostedToolsRedirect) {

    parts.push(

      "confluence.hosted-tools.com stuurt server-side REST-verkeer door naar auth.hosted-tools.com (SSO). Bearer/Basic PAT alleen volstaat daar meestal niet; gebruik browser-sessiesync (POST /api/confluence/sync-browser-session) of CONFLUENCE_COOKIE naast de PAT.",

    );

  }

  if (!config.hasConfluenceUser) {

    parts.push(

      "Optioneel: zet CONFLUENCE_USER op je Confluence-gebruikersnaam of e-mail (PAT als wachtwoord) als Basic auth op de origin zelf wordt geaccepteerd.",

    );

  }

  if (!config.hasGatewayCookie && config.authMode !== "gateway") {

    parts.push(

      "Automatische gateway-login is uitgeschakeld (standaard). Alleen nodig met CONFLUENCE_AUTH_MODE=gateway.",

    );

  } else if (config.hasGatewayCookie && config.authMode !== "gateway") {

    parts.push("CONFLUENCE_COOKIE is geconfigureerd maar de sessie lijkt verlopen of ongeldig.");

  }

  return parts.join(" ");

}



export function hostedToolsGatewayErrorHint(config, loginDiagnostics = null) {

  const parts = [

    "Confluence API-verkeer wordt doorgestuurd naar auth.hosted-tools.com. Gateway-modus is actief maar login mislukte of PAT alleen volstaat niet.",

  ];

  if (config.authUserIncludesEmail) {

    parts.push(

      "CONFLUENCE_AUTH_USER mag geen e-mailadres zijn; gebruik je iO tools gebruikersnaam (zoals IOMS_AUTH_USER), niet je e-mail.",

    );

  }

  if (config.invalidGatewayUsername) {

    parts.push(

      `CONFLUENCE_AUTH_USER="${config.rawAuthUser}" wordt door de gateway afgewezen. Gebruik IOMS_AUTH_USER (${config.preferredGatewayUsername || "IOMS_AUTH_USER"}) of verwijder CONFLUENCE_AUTH_USER.`,

    );

  }

  if (loginDiagnostics?.error || loginDiagnostics?.lastError) {

    parts.push(`Gateway-login: ${loginDiagnostics.error || loginDiagnostics.lastError}`);

  }

  if (!config.hasGatewayCookie && !config.hasGatewayCredentials) {

    parts.push(

      "Zet gateway-credentials (CONFLUENCE_AUTH_USER + wachtwoord), CONFLUENCE_COOKIE, of schakel terug naar PAT-only (verwijder CONFLUENCE_AUTH_MODE=gateway).",

    );

  } else if (config.hasGatewayCredentials) {

    parts.push(

      "Gateway-login mislukte met de geconfigureerde credentials. Controleer het iO tools wachtwoord of gebruik CONFLUENCE_COOKIE na browserlogin.",

    );

  }

  return parts.join(" ");

}



export function resolveGatewayUsername(env = process.env) {

  const iomsUser = trimEnv(env.IOMS_AUTH_USER);

  const explicit = trimEnv(env.CONFLUENCE_AUTH_USER);

  if (iomsUser) return iomsUser;

  if (explicit && !explicit.includes("@")) return explicit;

  if (explicit?.includes("@")) return explicit.split("@")[0];

  return explicit;

}



function normalizeGatewayUsername(value) {

  const user = trimEnv(value);

  if (!user) return "";

  if (user.includes("@")) return user.split("@")[0];

  return user;

}



export function buildGatewayCredentialCandidates(env = process.env) {

  const iomsUser = normalizeGatewayUsername(env.IOMS_AUTH_USER);

  const explicitUser = normalizeGatewayUsername(env.CONFLUENCE_AUTH_USER);

  const iomsPassword = trimEnv(env.IOMS_AUTH_PASSWORD);

  const confluencePassword = trimEnv(env.CONFLUENCE_AUTH_PASSWORD);

  const candidates = [];

  const seen = new Set();

  const add = (user, password, source) => {

    if (!user || !password) return;

    const key = `${user}\0${password}`;

    if (seen.has(key)) return;

    seen.add(key);

    candidates.push({ user, password, source });

  };

  add(iomsUser, iomsPassword, "IOMS_AUTH_USER/IOMS_AUTH_PASSWORD");

  add(explicitUser, confluencePassword, "CONFLUENCE_AUTH_USER/CONFLUENCE_AUTH_PASSWORD");

  return candidates;

}



function readCookieFromFile(env = process.env) {

  const filePath = trimEnv(env.CONFLUENCE_COOKIE_FILE);

  if (!filePath) return "";

  try {

    return trimEnv(fs.readFileSync(filePath, "utf8"));

  } catch {

    return "";

  }

}



export function buildConfluenceClientConfig(env = process.env) {

  const baseUrl = normalizeConfluenceBaseUrl(env.CONFLUENCE_BASE_URL);

  const pat = trimEnv(env.CONFLUENCE_PAT);

  const authUser = resolveGatewayUsername(env);

  const authPassword = trimEnv(env.CONFLUENCE_AUTH_PASSWORD || env.IOMS_AUTH_PASSWORD);

  const manualCookie = trimEnv(env.CONFLUENCE_COOKIE) || readCookieFromFile(env);

  const confluenceUser = trimEnv(env.CONFLUENCE_USER || env.CONFLUENCE_EMAIL);

  const authModeRaw = trimEnv(env.CONFLUENCE_AUTH_MODE).toLowerCase();

  const authMode = authModeRaw === "gateway" ? "gateway" : "pat";

  const rawAuthUser = trimEnv(env.CONFLUENCE_AUTH_USER);

  const preferredGatewayUsername = normalizeGatewayUsername(env.IOMS_AUTH_USER);

  const invalidGatewayUsername =

    !!rawAuthUser &&

    !!preferredGatewayUsername &&

    normalizeGatewayUsername(rawAuthUser) !== preferredGatewayUsername &&

    !rawAuthUser.includes("@");

  const credentialCandidates = buildGatewayCredentialCandidates(env);

  return {

    baseUrl,

    pat,

    authUser,

    authPassword,

    manualCookie,

    confluenceUser,

    authMode,

    configured: !!(baseUrl && (pat || manualCookie || browserSessionSyncEnabled(env))),

    hasPat: !!pat,

    hasGatewayCredentials: credentialCandidates.length > 0,

    hasGatewayCookie: !!manualCookie,

    hasConfluenceUser: !!confluenceUser,

    authUserIncludesEmail: rawAuthUser.includes("@"),

    rawAuthUser,

    preferredGatewayUsername,

    invalidGatewayUsername,

    credentialCandidates,

  };

}



export function useGatewayAuth(config) {

  if (!config) return false;

  if (config.authMode !== "gateway") return false;

  return config.hasGatewayCookie || config.hasGatewayCredentials || !!cachedGatewayCookie;

}



export function confluenceConfigPayload(env = process.env) {

  const config = buildConfluenceClientConfig(env);

  let authStrategy = "pat";

  if (config.authMode === "gateway") {

    if (config.manualCookie || cachedGatewayCookie) authStrategy = "gateway-cookie";

    else if (config.hasGatewayCredentials) authStrategy = "gateway-credentials";

    else authStrategy = "gateway-unconfigured";

  }

  const browserSession = browserSessionStatus(env);

  return {

    configured: config.configured,

    baseUrl: config.baseUrl,

    hasPat: config.hasPat,

    authMode: config.authMode,

    authStrategy,

    hasGatewayCredentials: config.hasGatewayCredentials,

    hasGatewayCookie: config.hasGatewayCookie || !!cachedGatewayCookie || browserSession.hasCookie,

    hasBrowserSession: browserSession.hasCookie,

    browserSessionSyncEnabled: browserSession.enabled,

    browserSessionLastSyncAt: browserSession.lastSyncAt,

    hasConfluenceUser: config.hasConfluenceUser,

    gatewayUsername: config.authMode === "gateway" ? config.authUser || undefined : undefined,

    preferredGatewayUsername: config.authMode === "gateway" ? config.preferredGatewayUsername || undefined : undefined,

    invalidGatewayUsername: config.authMode === "gateway" ? config.invalidGatewayUsername || undefined : undefined,

    credentialCandidateCount: config.authMode === "gateway" ? config.credentialCandidates.length : 0,

    hint: config.configured

      ? config.authMode === "gateway"

        ? config.invalidGatewayUsername

          ? `CONFLUENCE_AUTH_USER (${config.rawAuthUser}) lijkt ongeldig; gebruik ${config.preferredGatewayUsername || "IOMS_AUTH_USER"} of CONFLUENCE_COOKIE.`

          : "Gateway-modus: naast CONFLUENCE_PAT ook gateway-login of CONFLUENCE_COOKIE."

        : config.hasGatewayCookie || browserSession.hasCookie

          ? "PAT + browser SSO-sessie naast CONFLUENCE_PAT."

        : browserSession.enabled

          ? "PAT + browser-sessiesync: start Edge/Chrome met --remote-debugging-port=9222 en roep /api/confluence/sync-browser-session aan."

        : "PAT-only: CONFLUENCE_BASE_URL + CONFLUENCE_PAT (+ optioneel CONFLUENCE_USER of CONFLUENCE_COOKIE bij hosted-tools SSO)."

      : undefined,

  };

}



const CONFLUENCE_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

export async function followConfluenceRedirects(url, init, { maxHops = 12 } = {}) {
  let currentUrl = typeof url === "string" ? url : String(url);
  let headers = { ...(init.headers || {}) };
  let lastResponse = null;
  for (let hop = 0; hop < maxHops; hop += 1) {
    lastResponse = await fetch(currentUrl, { ...init, headers, redirect: "manual" });
    const cookie = mergeSetCookieHeaders(headers.Cookie || "", lastResponse);
    if (cookie) {
      headers = { ...headers, Cookie: cookie };
      rememberBrowserSyncedCookie(cookie, "redirect-jar");
    }
    if (lastResponse.status >= 300 && lastResponse.status < 400) {
      const location = lastResponse.headers.get("location") || "";
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    return {
      response: lastResponse,
      bodyText: await lastResponse.text(),
      cookie: headers.Cookie || "",
      hops: hop,
      finalUrl: currentUrl,
    };
  }
  return {
    response: lastResponse,
    bodyText: lastResponse ? await lastResponse.text() : "",
    cookie: headers.Cookie || "",
    hops: maxHops,
    finalUrl: currentUrl,
  };
}

export function buildAuthorizationHeader(config) {

  const headers = { Accept: "application/json", "User-Agent": CONFLUENCE_BROWSER_UA };

  if (config.confluenceUser && config.pat) {

    headers.Authorization = `Basic ${Buffer.from(`${config.confluenceUser}:${config.pat}`).toString("base64")}`;

  } else if (config.pat) {

    headers.Authorization = `Bearer ${config.pat}`;

  }

  return headers;

}



function gatewayCookieHeader(config) {

  return trimEnv(config.manualCookie || cachedGatewayCookie);

}



function hostedToolsPostUrl(authUrl) {

  const req = String(authUrl || "").match(/[?&]req=([^&]+)/)?.[1] || "";

  return req ? `https://${HOSTED_TOOLS_AUTH_HOST}/?req=${req}` : `https://${HOSTED_TOOLS_AUTH_HOST}/`;

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



async function followGatewayRedirects(startUrl, cookie, config) {

  let nextUrl = startUrl;

  let guard = 0;

  while (nextUrl && guard < 8) {

    guard += 1;

    const absolute = nextUrl.startsWith("http") ? nextUrl : `https://${HOSTED_TOOLS_AUTH_HOST}${nextUrl}`;

    const hop = await fetch(absolute, {

      redirect: "manual",

      headers: {

        Cookie: cookie,

        ...buildAuthorizationHeader(config),

      },

    });

    cookie = mergeSetCookieHeaders(cookie, hop);

    if (hop.status >= 300 && hop.status < 400) {

      nextUrl = hop.headers.get("location") || "";

      continue;

    }

    return { cookie, response: hop };

  }

  return { cookie, response: null };

}



async function loginHostedToolsGatewayOnce(authUrl, config, credentials) {

  const postUrl = hostedToolsPostUrl(authUrl);

  const authPage = await fetch(authUrl, { redirect: "manual" });

  let cookie = mergeSetCookieHeaders("", authPage);

  const html1 = await authPage.text();

  const token1 = extractAuthFormToken(html1);

  if (!token1) {

    return { cookie: "", error: "Geen loginformulier op auth.hosted-tools.com" };

  }



  const step1 = await fetch(postUrl, {

    method: "POST",

    redirect: "manual",

    headers: {

      "Content-Type": "application/x-www-form-urlencoded",

      Cookie: cookie,

    },

    body: new URLSearchParams({

      token: token1,

      user: credentials.user,

      password: "",

    }),

  });

  cookie = mergeSetCookieHeaders(cookie, step1);

  const html2 = await step1.text();

  const token2 = extractAuthFormToken(html2) || token1;

  const step1Error = extractAuthFormError(html2);

  const hasPassField = /name="pass"/i.test(html2);



  if (step1Error && !hasPassField) {

    return {

      cookie: "",

      error: `Gebruikersnaam "${credentials.user}" afgewezen: ${step1Error}`,

      usernameRejected: true,

    };

  }



  let login;

  if (hasPassField) {

    login = await fetch(postUrl, {

      method: "POST",

      redirect: "manual",

      headers: {

        "Content-Type": "application/x-www-form-urlencoded",

        Cookie: cookie,

      },

      body: new URLSearchParams({

        token: token2,

        pass: credentials.password,

      }),

    });

  } else {

    login = await fetch(postUrl, {

      method: "POST",

      redirect: "manual",

      headers: {

        "Content-Type": "application/x-www-form-urlencoded",

        Cookie: cookie,

      },

      body: new URLSearchParams({

        token: token1,

        user: credentials.user,

        password: credentials.password,

      }),

    });

  }



  cookie = mergeSetCookieHeaders(cookie, login);

  const nextUrl = login.headers.get("location") || "";

  const loginHtml = await login.text();

  const loginError = extractAuthFormError(loginHtml);

  if (loginError && !nextUrl) {

    return {

      cookie: "",

      error: `Wachtwoord geweigerd voor "${credentials.user}" (${credentials.source}): ${loginError}`,

      passwordRejected: true,

    };

  }



  if (nextUrl) {

    const followed = await followGatewayRedirects(nextUrl, cookie, config);

    cookie = followed.cookie;

  }



  if (!cookie) {

    return { cookie: "", error: `Geen sessiecookie na login voor "${credentials.user}"` };

  }

  return { cookie, source: credentials.source, user: credentials.user };

}



async function loginHostedToolsGateway(authUrl, config) {

  if (!config.hasGatewayCredentials) return { cookie: "", error: "Geen gateway-credentials geconfigureerd" };

  if (gatewayLoginPromise) return gatewayLoginPromise;

  gatewayLoginPromise = (async () => {

    const candidates = config.credentialCandidates?.length

      ? config.credentialCandidates

      : [{ user: config.authUser, password: config.authPassword, source: "default" }];

    let lastError = "";

    for (const credentials of candidates) {

      const result = await loginHostedToolsGatewayOnce(authUrl, config, credentials);

      if (result.cookie) {

        cachedGatewayCookie = result.cookie;

        return result;

      }

      lastError = result.error || lastError;

      if (result.usernameRejected) continue;

    }

    return { cookie: "", error: lastError || "Gateway-login mislukt voor alle credential-combinaties" };

  })();

  try {

    return await gatewayLoginPromise;

  } finally {

    gatewayLoginPromise = null;

  }

}



export async function ensureGatewaySessionForUrl(url, config) {

  if (!useGatewayAuth(config)) return { cookie: "" };

  if (config.manualCookie) return { cookie: config.manualCookie };

  if (cachedGatewayCookie) return { cookie: cachedGatewayCookie };

  if (!config.hasGatewayCredentials) return { cookie: "" };

  const probe = await fetch(url, {

    redirect: "manual",

    headers: buildAuthorizationHeader(config),

  });

  if (!isHostedToolsAuthRedirect(probe)) return { cookie: "" };

  const authUrl = probe.headers.get("location");

  if (!authUrl) return { cookie: "", error: "Gateway-redirect zonder login-URL" };

  return loginHostedToolsGateway(authUrl, config);

}



export function confluenceAuthFailure(response, bodyText, config, loginDiagnostics = null) {

  const hostedToolsRedirect =

    isHostedToolsAuthRedirect(response) || isHostedToolsAuthPage(bodyText, response?.url);

  if (response?.status === 401 || response?.status === 403) {

    return config.authMode === "gateway"

      ? `Confluence authenticatie mislukt (${response.status}). Controleer CONFLUENCE_PAT en gateway-configuratie.`

      : patAuthFailureHint(config, { hostedToolsRedirect });

  }

  if (hostedToolsRedirect) {

    if (config.authMode === "gateway") {

      return hostedToolsGatewayErrorHint(config, loginDiagnostics);

    }

    return patAuthFailureHint(config, { hostedToolsRedirect: true });

  }

  return "";

}



async function maybeRefreshBrowserSessionOnRedirect(response, config, env, init, probeUrl) {

  if (config.authMode === "gateway" || !isHostedToolsAuthRedirect(response) || !browserSessionSyncEnabled(env)) {

    return null;

  }

  const sync = await syncConfluenceBrowserSession(env);

  if (!sync.cookie) return sync;

  const retry = await fetch(probeUrl, {

    ...init,

    headers: {

      ...init.headers,

      Cookie: mergeConfluenceCookieHeaders(config.manualCookie, sync.cookie),

    },

  });

  return { sync, response: retry, bodyText: await retry.text() };

}



export async function diagnoseConfluenceAuth(env = process.env) {

  primeBrowserCookieFromDisk(env);

  const config = buildConfluenceClientConfig(env);

  const payload = confluenceConfigPayload(env);

  if (!config.configured) {

    return { ok: false, ...payload, error: "CONFLUENCE_BASE_URL plus PAT of een browser-sessie is vereist" };

  }

  const probeUrl = `${config.baseUrl}/rest/api/content/search?cql=type=page&limit=1`;
  const fetched = await confluenceFetch(probeUrl, {}, env);
  const jsonOk = String(fetched.bodyText || "").trim().startsWith("{");
  return {
    ok: !fetched.authError && jsonOk && fetched.response?.ok,
    ...payload,
    probeStatus: fetched.response?.status,
    probeJson: jsonOk,
    hops: fetched.hops,
    error: fetched.authError || (!jsonOk ? "Confluence response was geen JSON" : undefined),
    gatewayLoginError: fetched.loginDiagnostics?.error || undefined,
  };
}

export async function confluenceFetch(url, options = {}, env = process.env) {
  primeBrowserCookieFromDisk(env);
  const config = buildConfluenceClientConfig(env);
  const init = { ...options, redirect: "manual" };
  const extraHeaders = options.headers && typeof options.headers === "object" ? options.headers : {};
  init.headers = { ...buildAuthorizationHeader(config), ...extraHeaders };
  let loginDiagnostics = null;

  if (browserSessionSyncEnabled(env) && !resolveConfluenceCookieHeader(config, env)) {
    const sync = await syncConfluenceBrowserSession(env);
    if (sync.error && !sync.cookie) loginDiagnostics = { error: sync.error };
  }

  const cookieHeader = resolveConfluenceCookieHeader(config, env);
  if (cookieHeader) init.headers.Cookie = cookieHeader;

  if (useGatewayAuth(config)) {
    const session = await ensureGatewaySessionForUrl(url, config);
    if (session.cookie) init.headers.Cookie = session.cookie;
    loginDiagnostics = session.error ? session : loginDiagnostics;
  }

  let followed = await followConfluenceRedirects(url, init);
  let response = followed.response;
  let bodyText = followed.bodyText;
  if (followed.cookie) init.headers.Cookie = followed.cookie;

  if (
    !useGatewayAuth(config) &&
    isHostedToolsAuthRedirect(response) &&
    browserSessionSyncEnabled(env)
  ) {
    const sync = await syncConfluenceBrowserSession(env);
    if (sync.cookie) {
      init.headers.Cookie = mergeConfluenceCookieHeaders(config.manualCookie, sync.cookie);
      followed = await followConfluenceRedirects(url, init);
      response = followed.response;
      bodyText = followed.bodyText;
    } else if (sync.error) {
      loginDiagnostics = { error: sync.error };
    }
  }

  if (useGatewayAuth(config) && isHostedToolsAuthRedirect(response)) {
    cachedGatewayCookie = "";
    const authUrl = response.headers.get("location") || "";
    const login = config.manualCookie
      ? { cookie: config.manualCookie }
      : await loginHostedToolsGateway(authUrl, config);
    loginDiagnostics = login;
    if (login.cookie) {
      init.headers.Cookie = login.cookie;
      followed = await followConfluenceRedirects(url, init);
      response = followed.response;
      bodyText = followed.bodyText;
    }
  }

  const authError = confluenceAuthFailure(response, bodyText, config, loginDiagnostics);
  return { response, bodyText, config, authError, loginDiagnostics, hops: followed.hops };
}



export function resetConfluenceGatewaySession() {

  cachedGatewayCookie = "";

  gatewayLoginPromise = null;

}


