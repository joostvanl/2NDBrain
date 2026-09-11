import test from "node:test";
import assert from "node:assert/strict";
import { shouldMergeDocumentChatIntoSession } from "../src/nexus-chat-session-policy.mjs";

test("document load must not merge review-sidecar chat into the active session", () => {
  assert.equal(shouldMergeDocumentChatIntoSession("document-load"), false);
});

test("agent run may merge new document review turns into the active session", () => {
  assert.equal(shouldMergeDocumentChatIntoSession("agent-run"), true);
});
