/**
 * Start API (--api-only) en Vite na elkaar; wait-on gebruikt dezelfde poort als env API_PORT (default 8787).
 * Zo matcht de Vite-proxy in vite.config.ts (leest API_PORT) altijd met de API-server.
 *
 * `.env` / `.env.local` worden door `server/load-env.mjs` ingeladen (ook bij de API in het eerste child-proces).
 * Zet hierin o.a. DOCX_EXPORT_URL + DOCX_EXPORT_STYLE (portaal :8080 of docx-export :8790), zie .env.example.
 */
import "../server/load-env.mjs";
import concurrently from "concurrently";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = process.env.API_PORT || "8787";

try {
  await concurrently(
    [
      `node server/index.mjs --api-only`,
      `npx wait-on tcp:127.0.0.1:${port} && vite`,
    ],
    {
      cwd: rootDir,
      killOthersOn: {
        failure: true,
        success: true,
      },
      env: { ...process.env, API_PORT: port },
    },
  );
} catch (e) {
  console.error(e);
  process.exit(1);
}
