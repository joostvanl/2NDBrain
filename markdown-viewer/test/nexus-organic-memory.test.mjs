import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeOrganicMemoryContext,
  shouldRunOrganicMemoryReflection,
  createOrganicMemoryScheduler,
} from "../server/nexus-organic-memory.mjs";
import { classifyNexusIntent } from "../server/nexus/nexus-intent.mjs";

test("looksLikeOrganicMemoryContext detects project and klant context", () => {
  assert.equal(
    looksLikeOrganicMemoryContext("We bespraken het DHL SLA-triageproces en de governance-afspraken."),
    true,
  );
  assert.equal(looksLikeOrganicMemoryContext("Even snel vandaag even kijken"), false);
});

test("shouldRunOrganicMemoryReflection skips when memory already written", () => {
  assert.equal(
    shouldRunOrganicMemoryReflection({
      organicSignal: true,
      executedMemoryCount: 1,
    }),
    false,
  );
});

test("classifyNexusIntent keeps memory write tools for document-edit with organic context", () => {
  const intent = classifyNexusIntent("Werk het Stanley Stella dossier bij in memory", {
    hasDocument: true,
    documentPath: "02-projecten/Stanley/foo.md",
    mode: "agent",
    organicMemoryContext: true,
  });
  assert.equal(intent.profile, "document-edit");
  assert.equal(intent.enabledToolGroups.memoryWrite, true);
});

test("organic memory scheduler rate-limits per chat", async () => {
  let runs = 0;
  const scheduler = createOrganicMemoryScheduler({
    runReflection: async () => {
      runs += 1;
      return { executedMemoryActions: [], targetPath: "onderwerpen/test.md" };
    },
  });
  const first = scheduler.schedule({ chatId: "chat-1", message: "project update", reply: "ok" });
  const second = scheduler.schedule({ chatId: "chat-1", message: "nog een update", reply: "ok" });
  assert.equal(first.scheduled, true);
  assert.equal(second.scheduled, false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runs, 1);
});
