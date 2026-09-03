import test from "node:test";
import assert from "node:assert/strict";
import {
  browserSessionSyncEnabled,
  clearBrowserSyncedCookie,
  discoverCdpEndpointCandidates,
  filterRelevantConfluenceCookies,
  formatCookiesForHeader,
  formatCookiesForUrl,
  mergeConfluenceCookieHeaders,
  rememberBrowserSyncedCookies,
  resolveBrowserCookieHeaderForUrl,
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

test("selectCdpPageTarget can prefer a Jira tab when asked", () => {
  const target = selectCdpPageTarget(
    [
      { type: "page", url: "https://confluence.hosted-tools.com/wiki", webSocketDebuggerUrl: "ws://c" },
      { type: "page", url: "https://jira.hosted-tools.com/browse/ABC-1", webSocketDebuggerUrl: "ws://j" },
    ],
    "jira.hosted-tools.com",
  );
  assert.equal(target?.webSocketDebuggerUrl, "ws://j");
});

test("formatCookiesForUrl keeps Jira session cookies separate from Confluence", () => {
  const cookies = [
    { name: "hosted-tools-auth-2", value: "conf-auth", domain: "confluence.hosted-tools.com" },
    { name: "JSESSIONID", value: "conf-session", domain: "confluence.hosted-tools.com" },
    { name: "hosted-tools-auth-2", value: "jira-auth", domain: "jira.hosted-tools.com" },
    { name: "JSESSIONID", value: "jira-session", domain: "jira.hosted-tools.com" },
    { name: "atlassian.xsrf.token", value: "jira-xsrf", domain: "jira.hosted-tools.com" },
  ];
  const jiraHeader = formatCookiesForUrl(cookies, "https://jira.hosted-tools.com/rest/api/2/myself");
  assert.match(jiraHeader, /JSESSIONID=jira-session/);
  assert.match(jiraHeader, /hosted-tools-auth-2=jira-auth/);
  assert.doesNotMatch(jiraHeader, /conf-session/);
  assert.doesNotMatch(jiraHeader, /conf-auth/);
  const confluenceHeader = formatCookiesForUrl(cookies, "https://confluence.hosted-tools.com/rest/api/user/current");
  assert.match(confluenceHeader, /JSESSIONID=conf-session/);
  assert.doesNotMatch(confluenceHeader, /jira-session/);
});

test("resolveBrowserCookieHeaderForUrl uses structured host cookies", () => {
  rememberBrowserSyncedCookies([
    { name: "JSESSIONID", value: "conf-session", domain: "confluence.hosted-tools.com" },
    { name: "JSESSIONID", value: "jira-session", domain: "jira.hosted-tools.com" },
  ]);
  try {
    const header = resolveBrowserCookieHeaderForUrl("https://jira.hosted-tools.com/rest/api/2/search", {});
    assert.equal(header, "JSESSIONID=jira-session");
  } finally {
    clearBrowserSyncedCookie();
  }
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
