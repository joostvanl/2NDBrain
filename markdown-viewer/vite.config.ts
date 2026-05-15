import { defineConfig } from "vite";

const apiPort = Number(process.env.API_PORT || 8787);

/**
 * Standaard `npm run dev` start twee processen:
 * - API: `node server/index.mjs --api-only` → :8787 (of env API_PORT)
 * - Vite: deze dev-server op :5173; `/api` wordt naar die API-poort geproxied.
 *
 * Eén proces (API+Vite op dezelfde poort): `npm run dev:unified` → :5173.
 * Gebruik nooit alleen `npx vite` zonder draaiende API — dan krijg je 404 op /api.
 */
export default defineConfig({
  root: ".",
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
