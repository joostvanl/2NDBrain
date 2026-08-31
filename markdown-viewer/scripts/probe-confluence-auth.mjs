import "../server/load-env.mjs";
import {
  buildConfluenceClientConfig,
  confluenceFetch,
  diagnoseConfluenceAuth,
  resetConfluenceGatewaySession,
} from "../server/nexus/nexus-confluence.mjs";

const base = process.env.CONFLUENCE_BASE_URL.replace(/\/+$/, "");
const pat = process.env.CONFLUENCE_PAT;
const probeUrl = `${base}/rest/api/content/search?cql=type=page&limit=1`;

async function probeDirect(label, headers) {
  const response = await fetch(probeUrl, { redirect: "manual", headers: { Accept: "application/json", ...headers } });
  const location = response.headers.get("location") || "";
  const body = (await response.text()).slice(0, 80);
  console.log(
    `[direct] ${label}: status=${response.status} gateway=${location.includes("auth.hosted-tools")} json=${body.startsWith("{")}`,
  );
  return response;
}

async function probeGatewayLogin() {
  const probe = await fetch(probeUrl, {
    redirect: "manual",
    headers: { Accept: "application/json", Authorization: `Bearer ${pat}` },
  });
  const authUrl = probe.headers.get("location") || "";
  console.log(`[gateway] probe redirect: ${probe.status} -> ${authUrl.slice(0, 90)}`);
  if (!authUrl) return;

  const authPage = await fetch(authUrl, { redirect: "manual" });
  const html1 = await authPage.text();
  const token1 = html1.match(/name="token"\s+value="([^"]*)"/i)?.[1] || "";
  let cookie = mergeCookies("", authPage);
  console.log(
    `[gateway] auth page: status=${authPage.status} token=${Boolean(token1)} passField=${/name="pass"/i.test(html1)}`,
  );

  const req = authUrl.match(/[?&]req=([^&]+)/)?.[1] || "";
  const postUrl = req ? `https://auth.hosted-tools.com/?req=${req}` : "https://auth.hosted-tools.com/";
  const user = process.env.CONFLUENCE_AUTH_USER || process.env.IOMS_AUTH_USER || "";
  const pass = process.env.CONFLUENCE_AUTH_PASSWORD || process.env.IOMS_AUTH_PASSWORD || "";

  const step1 = await fetch(postUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ token: token1, user, password: "" }),
  });
  cookie = mergeCookies(cookie, step1);
  const html2 = await step1.text();
  const token2 = html2.match(/name="token"\s+value="([^"]*)"/i)?.[1] || token1;
  const hasPass = /name="pass"/i.test(html2);
  const err1 = extractError(html2);
  console.log(`[gateway] step1 user: status=${step1.status} hasPass=${hasPass} err=${err1 || "-"}`);

  const step2 = await fetch(postUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: hasPass
      ? new URLSearchParams({ token: token2, pass })
      : new URLSearchParams({ token: token1, user, password: pass }),
  });
  cookie = mergeCookies(cookie, step2);
  const loc2 = step2.headers.get("location") || "";
  const html3 = await step2.text();
  const err2 = extractError(html3);
  console.log(`[gateway] step2 pass: status=${step2.status} location=${loc2.slice(0, 80) || "-"} err=${err2 || "-"}`);

  if (!loc2) return;
  let next = loc2;
  for (let i = 0; i < 6 && next; i += 1) {
    const hop = await fetch(next.startsWith("http") ? next : `https://auth.hosted-tools.com${next}`, {
      redirect: "manual",
      headers: { Cookie: cookie, Accept: "application/json", Authorization: `Bearer ${pat}` },
    });
    cookie = mergeCookies(cookie, hop);
    const nextLoc = hop.headers.get("location") || "";
    console.log(`[gateway] hop ${i + 1}: status=${hop.status} next=${nextLoc.slice(0, 80) || "-"}`);
    if (hop.status < 300 || hop.status >= 400) break;
    next = nextLoc;
  }

  const final = await fetch(probeUrl, {
    redirect: "manual",
    headers: { Accept: "application/json", Authorization: `Bearer ${pat}`, Cookie: cookie },
  });
  const finalBody = await final.text();
  console.log(
    `[gateway] final api: status=${final.status} json=${finalBody.trim().startsWith("{")} cookieKeys=${cookie.split(";").filter(Boolean).length}`,
  );
}

function mergeCookies(existing, response) {
  const jar = new Map();
  for (const chunk of String(existing || "").split(";")) {
    const part = chunk.trim();
    if (!part.includes("=")) continue;
    const eq = part.indexOf("=");
    jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  for (const line of setCookies) {
    const part = String(line).split(";")[0]?.trim();
    if (!part || !part.includes("=")) continue;
    const eq = part.indexOf("=");
    jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function extractError(html) {
  return (
    String(html || "").match(/class="[^"]*error[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    String(html || "").match(/class="[^"]*alert[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    ""
  );
}

console.log("=== Confluence auth probe ===\n");
await probeDirect("Bearer PAT", { Authorization: `Bearer ${pat}` });
await probeDirect("Basic joostvl", {
  Authorization: `Basic ${Buffer.from(`joostvl:${pat}`).toString("base64")}`,
});
await probeDirect("Basic email", {
  Authorization: `Basic ${Buffer.from(`joost.vanleeuwaarden@iodigital.com:${pat}`).toString("base64")}`,
});

console.log("");
await probeGatewayLogin();

console.log("\n=== Module diagnose (pat) ===");
resetConfluenceGatewaySession();
console.log(JSON.stringify(await diagnoseConfluenceAuth(), null, 2));

console.log("\n=== Module confluenceFetch (gateway mode) ===");
resetConfluenceGatewaySession();
const gatewayEnv = { ...process.env, CONFLUENCE_AUTH_MODE: "gateway" };
const gatewayResult = await confluenceFetch(probeUrl, {}, gatewayEnv);
console.log(
  JSON.stringify(
    {
      status: gatewayResult.response.status,
      json: gatewayResult.bodyText.trim().startsWith("{"),
      authError: gatewayResult.authError || null,
      gatewayLoginError: gatewayResult.loginDiagnostics?.error || null,
    },
    null,
    2,
  ),
);

console.log("\n=== Config (redacted) ===");
const cfg = buildConfluenceClientConfig();
console.log(
  JSON.stringify(
    {
      baseUrl: cfg.baseUrl,
      authMode: cfg.authMode,
      hasPat: cfg.hasPat,
      hasConfluenceUser: cfg.hasConfluenceUser,
      hasGatewayCookie: cfg.hasGatewayCookie,
      hasGatewayCredentials: cfg.hasGatewayCredentials,
      credentialCandidateCount: cfg.credentialCandidates.length,
    },
    null,
    2,
  ),
);
