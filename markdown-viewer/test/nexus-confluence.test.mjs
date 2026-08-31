import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfluenceClientConfig,
  buildGatewayCredentialCandidates,
  confluenceAuthFailure,
  followConfluenceRedirects,
  hostedToolsGatewayErrorHint,
  isHostedToolsAuthPage,
  isHostedToolsAuthRedirect,
  mergeSetCookieHeaders,
  resolveGatewayUsername,
  useGatewayAuth,
} from "../server/nexus/nexus-confluence.mjs";

test("isHostedToolsAuthRedirect detects auth.hosted-tools.com redirect", () => {
  const response = {
    status: 302,
    headers: { get: (k) => (k === "location" ? "https://auth.hosted-tools.com/?req=abc" : "") },
  };
  assert.equal(isHostedToolsAuthRedirect(response), true);
});

test("isHostedToolsAuthPage detects iO tools authentication HTML", () => {
  assert.equal(
    isHostedToolsAuthPage('<html><title>iO tools authentication</title><body>Welcome</body></html>'),
    true,
  );
  assert.equal(isHostedToolsAuthPage('{"results":[]}'), false);
});

test("mergeSetCookieHeaders merges cookie values", () => {
  const merged = mergeSetCookieHeaders("A=1", {
    headers: { getSetCookie: () => ["B=2; Path=/; Secure", "A=9; Path=/"] },
  });
  assert.equal(merged, "A=9; B=2");
});

test("resolveGatewayUsername prefers IOMS_AUTH_USER over CONFLUENCE_AUTH_USER", () => {
  assert.equal(
    resolveGatewayUsername({
      CONFLUENCE_AUTH_USER: "joost.vanleeuwaarden",
      IOMS_AUTH_USER: "joostvl",
    }),
    "joostvl",
  );
  assert.equal(
    resolveGatewayUsername({
      CONFLUENCE_AUTH_USER: "joost.vanleeuwaarden@iodigital.com",
      IOMS_AUTH_USER: "joostvl",
    }),
    "joostvl",
  );
  assert.equal(resolveGatewayUsername({ CONFLUENCE_AUTH_USER: "joostvl" }), "joostvl");
});

test("buildGatewayCredentialCandidates tries IOMS user with matching passwords only", () => {
  const candidates = buildGatewayCredentialCandidates({
    IOMS_AUTH_USER: "joostvl",
    IOMS_AUTH_PASSWORD: "a",
    CONFLUENCE_AUTH_USER: "joost.vanleeuwaarden",
    CONFLUENCE_AUTH_PASSWORD: "b",
  });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].user, "joostvl");
  assert.equal(candidates[0].password, "a");
  assert.equal(candidates[1].user, "joost.vanleeuwaarden");
  assert.equal(candidates[1].password, "b");
});

test("buildConfluenceClientConfig defaults to pat auth mode without gateway", () => {
  const config = buildConfluenceClientConfig({
    CONFLUENCE_BASE_URL: "https://confluence.hosted-tools.com",
    CONFLUENCE_PAT: "secret",
    CONFLUENCE_AUTH_USER: "joostvl",
    IOMS_AUTH_PASSWORD: "pw",
  });
  assert.equal(config.authMode, "pat");
  assert.equal(useGatewayAuth(config), false);
});

test("useGatewayAuth only when CONFLUENCE_AUTH_MODE=gateway", () => {
  const patConfig = buildConfluenceClientConfig({
    CONFLUENCE_BASE_URL: "https://confluence.example.com",
    CONFLUENCE_PAT: "x",
    CONFLUENCE_AUTH_USER: "u",
    CONFLUENCE_AUTH_PASSWORD: "p",
  });
  assert.equal(useGatewayAuth(patConfig), false);
  const gatewayConfig = buildConfluenceClientConfig({
    CONFLUENCE_BASE_URL: "https://confluence.example.com",
    CONFLUENCE_PAT: "x",
    CONFLUENCE_AUTH_MODE: "gateway",
    CONFLUENCE_AUTH_USER: "u",
    CONFLUENCE_AUTH_PASSWORD: "p",
  });
  assert.equal(useGatewayAuth(gatewayConfig), true);
});

test("confluenceAuthFailure in pat mode does not mention gateway login as default", () => {
  const config = buildConfluenceClientConfig({ CONFLUENCE_PAT: "x" });
  const message = confluenceAuthFailure(
    { status: 200, url: "https://auth.hosted-tools.com/" },
    "<title>iO tools authentication</title>",
    config,
  );
  assert.match(message, /CONFLUENCE_PAT/);
  assert.match(message, /auth\.hosted-tools\.com/);
  assert.doesNotMatch(message, /Gateway-login mislukte/);
});

test("followConfluenceRedirects follows SSO hops and merges cookies", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    if (calls === 1) {
      return {
        status: 302,
        headers: {
          get: (name) => (name === "location" ? "https://auth.hosted-tools.com/?req=1" : null),
          getSetCookie: () => ["AHTSID=abc; Path=/"],
        },
        text: async () => "",
      };
    }
    return {
      status: 200,
      ok: true,
      headers: {
        get: () => null,
        getSetCookie: () => ["JSESSIONID=xyz; Path=/"],
      },
      text: async () => '{"results":[]}',
    };
  };
  try {
    const result = await followConfluenceRedirects("https://confluence.hosted-tools.com/rest/api/user/current", {
      headers: { Accept: "application/json" },
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.hops, 1);
    assert.match(result.cookie, /AHTSID=abc/);
    assert.match(result.cookie, /JSESSIONID=xyz/);
    assert.equal(result.bodyText, '{"results":[]}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confluenceAuthFailure in gateway mode explains hosted-tools gateway", () => {
  const config = buildConfluenceClientConfig({ CONFLUENCE_PAT: "x", CONFLUENCE_AUTH_MODE: "gateway" });
  const message = confluenceAuthFailure(
    { status: 200, url: "https://auth.hosted-tools.com/" },
    "<title>iO tools authentication</title>",
    config,
  );
  assert.match(message, /auth\.hosted-tools\.com/);
  assert.match(hostedToolsGatewayErrorHint(config), /CONFLUENCE_COOKIE/);
});
