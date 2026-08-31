import test from "node:test";
import assert from "node:assert/strict";
import { createCorpusIndexScheduler } from "../server/corpus-index-scheduler.mjs";

test("coalesces overlapping rebuild requests into one drain loop", async () => {
  let runs = 0;
  const scheduler = createCorpusIndexScheduler(async () => {
    runs += 1;
    await new Promise((r) => setImmediate(r));
    return { working: { entryCount: 1 }, memory: { entryCount: 2 } };
  });

  const p1 = scheduler.schedule("save");
  const p2 = scheduler.schedule("corpus-organizer-move");
  assert.equal(scheduler.snapshot().status, "queued");

  await Promise.all([p1, p2]);
  assert.equal(runs, 2);
  assert.equal(scheduler.snapshot().status, "idle");
  assert.equal(scheduler.snapshot().lastEntryCount.working, 1);
});

test("runAndWait returns last successful result", async () => {
  const scheduler = createCorpusIndexScheduler(async () => ({
    working: { entryCount: 3 },
    memory: { entryCount: 4 },
  }));
  const result = await scheduler.runAndWait("manual");
  assert.equal(result.working.entryCount, 3);
  assert.equal(scheduler.snapshot().lastReason, "manual");
});
