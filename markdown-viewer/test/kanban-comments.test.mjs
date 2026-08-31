import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createKanbanCommentsStore } from "../server/kanban-comments.mjs";

function tmpCommentsStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ioms-kanban-comments-"));
  return { rootDir, store: createKanbanCommentsStore({ rootDir }) };
}

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID_2 = "22222222-2222-4222-8222-222222222222";

test("kanban comments store adds threads and replies", () => {
  const { store } = tmpCommentsStore();
  const created = store.addThread(TASK_ID, { body: "Wanneer is de deadline?", author: "joost" });
  assert.equal(created.ok, true);
  assert.equal(created.thread.body, "Wanneer is de deadline?");

  const replied = store.addReply(TASK_ID, created.thread.id, { body: "Volgende week vrijdag.", author: "joost" });
  assert.equal(replied.ok, true);
  assert.equal(replied.thread.replies.length, 1);

  const listed = store.listThreads(TASK_ID);
  assert.equal(listed.ok, true);
  assert.equal(listed.threads.length, 1);
  assert.equal(listed.threads[0].replies[0].body, "Volgende week vrijdag.");
});

test("kanban comments merge moves secondary threads into primary", () => {
  const { rootDir, store } = tmpCommentsStore();
  const first = store.addThread(TASK_ID, { body: "Primair commentaar", author: "joost" });
  assert.equal(first.ok, true);
  const second = store.addThread(TASK_ID_2, { body: "Secundair commentaar", author: "joost" });
  assert.equal(second.ok, true);

  const merged = store.mergeTasks(TASK_ID, TASK_ID_2);
  assert.equal(merged.ok, true);
  assert.equal(merged.mergedCount, 1);

  const primary = store.listThreads(TASK_ID);
  assert.equal(primary.threads.length, 2);
  assert.ok(primary.threads.some((thread) => thread.body.includes("Secundair commentaar")));

  const secondaryPath = path.join(rootDir, `${TASK_ID_2}.json`);
  assert.equal(fs.existsSync(secondaryPath), false);
});

test("kanban comments deleteForTask removes sidecar file", () => {
  const { rootDir, store } = tmpCommentsStore();
  store.addThread(TASK_ID, { body: "Tijdelijk", author: "joost" });
  const filePath = path.join(rootDir, `${TASK_ID}.json`);
  assert.equal(fs.existsSync(filePath), true);
  store.deleteForTask(TASK_ID);
  assert.equal(fs.existsSync(filePath), false);
});
