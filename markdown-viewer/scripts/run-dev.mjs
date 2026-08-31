/**
 * Start API (--api-only) en Vite na elkaar; wait-on gebruikt dezelfde poort als env API_PORT (default 8787).
 * Zo matcht de Vite-proxy in vite.config.ts (leest API_PORT) altijd met de API-server.
 *
 * De API draait met `node --watch`: wijzigingen in server/*.mjs laden automatisch (geen handmatige herstart).
 * Vite wacht via api-restart-gate tot de API-poort weer open is — geen ECONNREFUSED-spam tijdens herstart.
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
const uiHost = process.env.UI_HOST || "127.0.0.1";
const uiPort = process.env.UI_PORT || "5173";

const { result } = concurrently(
  [
    `node --watch server/index.mjs --api-only`,
    `npx wait-on tcp:127.0.0.1:${port} && vite --host ${uiHost} --port ${uiPort}`,
  ],
  {
    cwd: rootDir,
    killOthersOn: {
      failure: true,
      success: false,
    },
    env: { ...process.env, API_PORT: port },
  },
);

try {
  await result;
} catch (e) {
  if (Array.isArray(e)) {
    for (const item of e) console.error(item);
  } else {
    console.error(e);
  }
  process.exit(1);
}
