import net from "node:net";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForApiPort(host, port, { timeoutMs = 20_000, intervalMs = 120 } = {}) {
  const envTimeout = Number(process.env.API_RESTART_GATE_TEST_TIMEOUT_MS || 0);
  const effectiveTimeout = envTimeout > 0 ? envTimeout : timeoutMs;
  const started = Date.now();
  while (Date.now() - started < effectiveTimeout) {
    if (await probeTcp(host, port, 80)) return true;
    await sleep(intervalMs);
  }
  return false;
}

/**
 * Wacht kort tot de API-poort weer open is na `node --watch` herstart,
 * zodat Vite's proxy geen ECONNREFUSED spamt.
 */
export function apiRestartGatePlugin(apiPort) {
  const host = "127.0.0.1";
  const port = Number(apiPort) || 8787;

  return {
    name: "api-restart-gate",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api")) {
          next();
          return;
        }
        if (await probeTcp(host, port, 60)) {
          next();
          return;
        }
        const ready = await waitForApiPort(host, port);
        if (!ready) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Retry-After", "2");
          res.end(
            JSON.stringify({
              error: "API is tijdelijk niet bereikbaar (herstart). Probeer opnieuw.",
            }),
          );
          return;
        }
        next();
      });
    },
  };
}

export function configureApiProxyResilience(proxy) {
  proxy.on("error", (err, _req, res) => {
    const code = err?.code || "";
    if (!res || res.headersSent) return;
    if (code === "ECONNREFUSED" || code === "ECONNRESET") {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Retry-After", "1");
      res.end(
        JSON.stringify({
          error: "API-verbinding verbroken tijdens herstart. Probeer opnieuw.",
        }),
      );
    }
  });
}
