/**
 * Laadt `.env` en `.env.local` vanuit de markdown-viewer-root (shell-waarden hebben voorrang).
 * `.env.local` overschrijft sleutels uit `.env` wanneer de sleutel nog niet in process.env staat.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i <= 0) continue;
    const key = s.slice(0, i).trim();
    let val = s.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

const base = parseEnvFile(path.join(rootDir, ".env"));
const local = parseEnvFile(path.join(rootDir, ".env.local"));
const merged = { ...base, ...local };
for (const [k, v] of Object.entries(merged)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
