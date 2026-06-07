import "./server/load-env.mjs";
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiPort = Number(process.env.API_PORT || 8787);
const rootDir = fileURLToPath(new URL(".", import.meta.url));
const authEnabled = process.env.IOMS_AUTH_DISABLED !== "1";
const authUser = (process.env.IOMS_AUTH_USER || "joost").trim() || "joost";
const authPassword = (process.env.IOMS_AUTH_PASSWORD || "").trim();

function safeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function parseBasicAuthorization(header: unknown): { user: string; password: string } | null {
  const value = String(header || "");
  const match = /^Basic\s+(.+)$/i.exec(value);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return {
      user: decoded.slice(0, sep),
      password: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

function iomsBasicAuthPlugin() {
  return {
    name: "ioms-basic-auth",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!authEnabled) {
          next();
          return;
        }
        if (!authPassword) {
          res.statusCode = 503;
          res.end("iOMS auth is not configured. Set IOMS_AUTH_PASSWORD before starting Vite.");
          return;
        }
        const credentials = parseBasicAuthorization(req.headers.authorization);
        if (
          credentials &&
          safeEqualString(credentials.user, authUser) &&
          safeEqualString(credentials.password, authPassword)
        ) {
          next();
          return;
        }
        res.statusCode = 401;
        res.setHeader("WWW-Authenticate", 'Basic realm="iOMS", charset="UTF-8"');
        res.end("Authentication required.");
      });
    },
  };
}

/**
 * Standaard `npm run dev` start twee processen:
 * - API: `node server/index.mjs --api-only` → :8787 (of env API_PORT)
 * - Vite: deze dev-server op :5173; `/api` wordt naar die API-poort geproxied.
 *
 * Eén proces (API+Vite op dezelfde poort): `npm run dev:unified` → :5173.
 * Gebruik nooit alleen `npx vite` zonder draaiende API — dan krijg je 404 op /api.
 *
 * `VITE_API_ORIGIN` is vooral voor Word-export die de proxy omzeilt; agent gebruikt in dev altijd `/api` op deze poort.
 */
export default defineConfig({
  root: ".",
  plugins: [iomsBasicAuthPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        chat: resolve(rootDir, "chat.html"),
        nexus: resolve(rootDir, "nexus.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        /** Grote Markdown + Word-generatie mag langer duren dan de default proxy-timeout. */
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
});
