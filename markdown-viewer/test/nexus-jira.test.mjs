import test from "node:test";
import assert from "node:assert/strict";
import { isHostedToolsAuthRedirect } from "../server/nexus/nexus-confluence.mjs";
import {
  adfToPlainText,
  buildJiraAuthorizationHeader,
  buildJiraClientConfig,
  jiraAuthFailure,
  jiraConfigPayload,
  jiraDescriptionToText,
  jiraIssueKeyFromInput,
  jqlFromSearchInput,
  looksLikeJql,
  mapJiraIssue,
  mapJiraSearchIssue,
  probeJiraSsoIntercept,
  readJiraIssue,
  redactJiraSecrets,
  searchJiraIssues,
} from "../server/nexus/nexus-jira.mjs";

function jsonResponse(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headers[String(name).toLowerCase()] || headers[name] || "",
    },
    text: async () => text,
  };
}

test("jira config stays ENV-driven and does not hardcode hosted-tools as required host", () => {
  const config = buildJiraClientConfig({
    JIRA_BASE_URL: "https://jira.example.com/",
    JIRA_PAT: "plain-api-key-string",
  });
  assert.equal(config.baseUrl, "https://jira.example.com");
  assert.equal(config.hasPat, true);
  assert.equal(config.configured, true);
});

test("jira PAT is sent as unstructured Bearer string", () => {
  const headers = buildJiraAuthorizationHeader({ pat: "no-structure-here" });
  assert.equal(headers.Authorization, "Bearer no-structure-here");
  assert.equal(headers.Accept, "application/json");
});

test("hosted-tools SSO intercept is detected on Jira REST like Confluence", () => {
  const response = {
    status: 302,
    headers: { get: (k) => (k === "location" ? "https://auth.hosted-tools.com/?req=jira" : "") },
  };
  assert.equal(isHostedToolsAuthRedirect(response), true);
  const message = jiraAuthFailure(response, "", { hasPat: true, pat: "secret-pat-value" });
  assert.match(message, /hosted-tools SSO/);
  assert.doesNotMatch(message, /secret-pat-value/);
});

test("redactJiraSecrets strips PAT from error text", () => {
  assert.equal(redactJiraSecrets("token=abc-secret-xyz", "abc-secret-xyz"), "token=[redacted]");
});

test("jiraIssueKeyFromInput reads keys and browse URLs", () => {
  assert.equal(jiraIssueKeyFromInput("DHLEXC-376"), "DHLEXC-376");
  assert.equal(jiraIssueKeyFromInput("DHLEXS_DHLEXC-390"), "DHLEXS_DHLEXC-390");
  assert.equal(jiraIssueKeyFromInput("https://jira.hosted-tools.com/browse/ABC-12"), "ABC-12");
  assert.equal(jiraIssueKeyFromInput("https://jira.example.com/issues/?selectedIssue=PROJ-9"), "PROJ-9");
});

test("jqlFromSearchInput uses explicit JQL or text search", () => {
  assert.equal(jqlFromSearchInput({ jql: "project = DHL ORDER BY updated DESC" }), "project = DHL ORDER BY updated DESC");
  assert.equal(jqlFromSearchInput({ query: "DHLEXC-376" }), "key = DHLEXC-376");
  assert.equal(jqlFromSearchInput({ query: 'incident SLA' }), 'text ~ "incident SLA"');
});

test("jqlFromSearchInput treats JQL pasted into query as JQL", () => {
  const raw = "project = STANLEYST_0003 AND updated >= 2026-08-01 AND updated <= 2026-08-31";
  assert.equal(looksLikeJql(raw), true);
  assert.equal(jqlFromSearchInput({ query: raw }), raw);
  assert.equal(looksLikeJql("SLA rapportage stanley"), false);
});

test("ADF description flattens to plain text", () => {
  const adf = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo Jira" }] }],
  };
  assert.match(adfToPlainText(adf), /Hallo Jira/);
  assert.equal(jiraDescriptionToText("plain"), "plain");
});

test("searchJiraIssues maps issues and does not echo the PAT", async () => {
  const env = {
    JIRA_BASE_URL: "https://jira.hosted-tools.com",
    JIRA_PAT: "super-secret-pat",
    CONFLUENCE_BROWSER_SESSION: "0",
  };
  const fetchFn = async (url) => {
    assert.match(String(url), /\/rest\/api\/2\/search/);
    assert.match(String(url), /jql=/);
    return jsonResponse(200, {
      total: 1,
      issues: [
        {
          key: "ABC-1",
          fields: {
            summary: "Rapportage SLA",
            status: { name: "In Progress" },
            assignee: { displayName: "Joost" },
            updated: "2026-09-01T07:00:00.000Z",
            issuetype: { name: "Task" },
            priority: { name: "High" },
          },
        },
      ],
    });
  };
  const payload = await searchJiraIssues({ query: "SLA", fetchFn }, env);
  assert.equal(payload.ok, true);
  assert.equal(payload.results[0].key, "ABC-1");
  assert.equal(payload.results[0].url, "https://jira.hosted-tools.com/browse/ABC-1");
  assert.equal(JSON.stringify(payload).includes("super-secret-pat"), false);
});

test("readJiraIssue maps comments and description", async () => {
  const env = {
    JIRA_BASE_URL: "https://jira.hosted-tools.com",
    JIRA_PAT: "pat",
    CONFLUENCE_BROWSER_SESSION: "0",
  };
  const fetchFn = async () =>
    jsonResponse(200, {
      key: "ABC-2",
      fields: {
        summary: "Root cause",
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Oorzaak X" }] }] },
        status: { name: "Done" },
        comment: {
          comments: [{ author: { displayName: "Carsten" }, created: "2026-08-01T00:00:00.000Z", body: "Ack" }],
        },
        labels: ["dhl"],
        reporter: { displayName: "Eddy" },
      },
    });
  const payload = await readJiraIssue({ key: "ABC-2", fetchFn }, env);
  assert.equal(payload.ok, true);
  assert.match(payload.description, /Oorzaak X/);
  assert.equal(payload.comments[0].author, "Carsten");
});

test("missing PAT without cookie returns a concrete config hint", async () => {
  const payload = await searchJiraIssues(
    { query: "x", fetchFn: async () => jsonResponse(200, { issues: [] }) },
    { JIRA_BASE_URL: "https://jira.hosted-tools.com", CONFLUENCE_BROWSER_SESSION: "0" },
  );
  assert.equal(payload.ok, false);
  assert.match(payload.error, /JIRA_PAT/);
});

test("jiraConfigPayload never includes the PAT", () => {
  const payload = jiraConfigPayload({
    JIRA_BASE_URL: "https://jira.hosted-tools.com",
    JIRA_PAT: "must-not-leak",
  });
  assert.equal(payload.hasPat, true);
  assert.equal(payload.baseUrl, "https://jira.hosted-tools.com");
  assert.equal(JSON.stringify(payload).includes("must-not-leak"), false);
});

test("probeJiraSsoIntercept reports hosted-tools redirect", async () => {
  const fetchFn = async () =>
    jsonResponse(302, "login", { location: "https://auth.hosted-tools.com/?req=abc" });
  const probe = await probeJiraSsoIntercept({ JIRA_BASE_URL: "https://jira.hosted-tools.com" }, fetchFn);
  assert.equal(probe.ssoIntercept, true);
  assert.equal(probe.status, 302);
});

test("map helpers survive empty issue objects", () => {
  assert.equal(mapJiraSearchIssue({}, "https://jira.hosted-tools.com").key, "");
  assert.equal(mapJiraIssue({ key: "A-1", fields: {} }, "https://jira.hosted-tools.com").key, "A-1");
});
