import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { apiRestartGatePlugin } from "../vite/api-restart-proxy.mjs";

function listenOnEphemeral() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        server,
        port: typeof addr === "object" && addr ? addr.port : 0,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test("api restart gate passes through when API port is open", async () => {
  const listener = await listenOnEphemeral();
  const stack = [];
  const plugin = apiRestartGatePlugin(listener.port);
  plugin.configureServer({
    middlewares: {
      use(fn) {
        stack.push(fn);
      },
    },
  });

  let nextCalled = false;
  const req = { url: "/api/agent-config", method: "GET" };
  const res = { statusCode: 0, headers: {}, setHeader() {}, end() {} };
  await stack[0](req, res, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled);
  await listener.close();
});

test("api restart gate returns 503 when API port stays closed", async () => {
  const listener = await listenOnEphemeral();
  const closedPort = listener.port;
  await listener.close();

  const stack = [];
  apiRestartGatePlugin(closedPort).configureServer({
    middlewares: { use: (fn) => stack.push(fn) },
  });

  let nextCalled = false;
  let body = "";
  const req = { url: "/api/health", method: "GET" };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(chunk) {
      body = String(chunk || "");
    },
  };

  const prevTimeout = process.env.API_RESTART_GATE_TEST_TIMEOUT_MS;
  process.env.API_RESTART_GATE_TEST_TIMEOUT_MS = "300";
  try {
    await stack[0](req, res, () => {
      nextCalled = true;
    });
  } finally {
    if (prevTimeout === undefined) delete process.env.API_RESTART_GATE_TEST_TIMEOUT_MS;
    else process.env.API_RESTART_GATE_TEST_TIMEOUT_MS = prevTimeout;
  }

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.match(body, /niet bereikbaar/i);
});
