/**
 * Single-flight corpus-index rebuild scheduler.
 * Coalesces overlapping triggers and yields the event loop between rebuild passes.
 */

export function createCorpusIndexScheduler(runRebuild) {
  const state = {
    status: "idle",
    runningReason: "",
    pendingReason: "",
    lastReason: "",
    lastStartedAt: "",
    lastFinishedAt: "",
    lastDurationMs: 0,
    lastEntryCount: { working: 0, memory: 0 },
    lastError: "",
  };

  let loopPromise = null;
  let pending = false;
  let pendingReason = "scheduled";
  let lastResult = null;

  async function drain() {
    while (pending) {
      pending = false;
      const reason = pendingReason || "scheduled";
      pendingReason = "scheduled";
      state.status = "running";
      state.runningReason = reason;
      state.lastStartedAt = new Date().toISOString();
      state.lastError = "";
      const started = Date.now();
      try {
        const result = await runRebuild(reason);
        lastResult = result;
        state.lastDurationMs = Date.now() - started;
        state.lastReason = reason;
        state.lastFinishedAt = new Date().toISOString();
        if (result?.working && result?.memory) {
          state.lastEntryCount = {
            working: result.working.entryCount || 0,
            memory: result.memory.entryCount || 0,
          };
        }
      } catch (e) {
        state.lastError = String(e?.message || e);
        lastResult = null;
      }
      if (pending) state.status = "queued";
    }
    state.status = "idle";
    state.runningReason = "";
    loopPromise = null;
  }

  function schedule(reason = "scheduled") {
    pendingReason = reason;
    pending = true;
    if (!loopPromise) {
      state.status = "running";
      loopPromise = drain();
    } else {
      state.status = "queued";
      state.pendingReason = reason;
    }
    return loopPromise;
  }

  async function runAndWait(reason = "scheduled") {
    schedule(reason);
    if (loopPromise) await loopPromise;
    return lastResult;
  }

  function snapshot() {
    return {
      status: state.status,
      runningReason: state.runningReason,
      pendingReason: state.status === "queued" ? state.pendingReason || pendingReason : "",
      lastReason: state.lastReason,
      lastStartedAt: state.lastStartedAt,
      lastFinishedAt: state.lastFinishedAt,
      lastDurationMs: state.lastDurationMs,
      lastEntryCount: { ...state.lastEntryCount },
      lastError: state.lastError,
    };
  }

  return { schedule, runAndWait, snapshot };
}
