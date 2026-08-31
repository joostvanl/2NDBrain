import test from "node:test";
import assert from "node:assert/strict";
import {
  browserSessionSyncEnabled,
  discoverCdpEndpointCandidates,
  filterRelevantConfluenceCookies,
  formatCookiesForHeader,
  mergeConfluenceCookieHeaders,
  selectCdpPageTarget,
} from "../server/nexus/nexus-confluence-browser-session.mjs";

test("browserSessionSyncEnabled defaults to true on win32", () => {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    assert.equal(browserSessionSyncEnabled({}), true);
    assert.equal(browserSessionSyncEnabled({ CONFLUENCE_BROWSER_SESSION: "0" }), false);
    assert.equal(browserSessionSyncEnabled({ CONFLUENCE_BROWSER_SESSION: "auto" }), true);
  } finally {
    Object.defineProperty(process, "platform", { value: original });
  }
});

test("discoverCdpEndpointCandidates prefers configured URL", () => {
  const candidates = discoverCdpEndpointCandidates({ CONFLUENCE_BROWSER_CDP_URL: "http://127.0.0.1:9333/json" });
  assert.deepEqual(candidates, ["http://127.0.0.1:9333"]);
});

test("formatCookiesForHeader dedupes cookie names", () => {
  const header = formatCookiesForHeader([
    { name: "a", value: "1" },
    { name: "b", value: "2" },
    { name: "a", value: "9" },
  ]);
  assert.equal(header, "a=9; b=2");
});

test("selectCdpPageTarget prefers a Confluence tab over DevTools or other pages", () => {
  const target = selectCdpPageTarget([
    { type: "page", url: "devtools://devtools/bundled/devtools_app.html", webSocketDebuggerUrl: "ws://a" },
    { type: "page", url: "https://example.com", webSocketDebuggerUrl: "ws://b" },
    { type: "page", url: "https://confluence.hosted-tools.com/wiki", webSocketDebuggerUrl: "ws://c" },
  ]);
  assert.equal(target?.webSocketDebuggerUrl, "ws://c");
});

test("filterRelevantConfluenceCookies keeps hosted-tools and Azure AD cookies", () => {
  const filtered = filterRelevantConfluenceCookies([
    { name: "JSESSIONID", domain: "confluence.hosted-tools.com" },
    { name: "hosted-tools-auth-2", domain: ".hosted-tools.com" },
    { name: "ESTSAUTH", domain: "login.microsoftonline.com" },
    { name: "random", domain: "ads.example.com" },
  ]);
  assert.deepEqual(
    filtered.map((item) => item.name),
    ["JSESSIONID", "hosted-tools-auth-2", "ESTSAUTH"],
  );
});

test("mergeConfluenceCookieHeaders combines manual and browser cookies", () => {
  const merged = mergeConfluenceCookieHeaders("a=1; b=2", "b=9; c=3");
  assert.match(merged, /a=1/);
  assert.match(merged, /b=9/);
  assert.match(merged, /c=3/);
});
