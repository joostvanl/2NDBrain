import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "nexus-protected-paths.json");

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    cachedConfig = { patterns: [], rules: { blockReplaceAll: true, requireRationale: true } };
  }
  return cachedConfig;
}

export function isProtectedDocumentPath(docPath) {
  const normalized = String(docPath || "").replace(/\\/g, "/").replace(/^Files\//i, "");
  const config = loadConfig();
  const patterns = Array.isArray(config.patterns) ? config.patterns : [];
  return patterns.some((pattern) => {
    const p = String(pattern).replace(/\\/g, "/").replace(/^Files\//i, "");
    if (p.endsWith("/")) return normalized.startsWith(p) || normalized.includes(`/${p}`);
    return normalized === p || normalized.startsWith(`${p}/`) || normalized.includes(`/${p}/`);
  });
}

export function assertPatchAllowed(docPath, changesRaw) {
  if (!isProtectedDocumentPath(docPath)) return { ok: true };
  const config = loadConfig();
  const rules = config.rules || {};
  const changes = Array.isArray(changesRaw) ? changesRaw : [];
  const violations = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (!change || typeof change !== "object") continue;
    if (rules.blockReplaceAll && change.replaceAll === true) {
      violations.push(`Change ${i + 1}: replaceAll is niet toegestaan op beschermde documenten.`);
    }
    if (rules.requireRationale) {
      const rationale = typeof change.rationale === "string" ? change.rationale.trim() : "";
      if (!rationale) {
        violations.push(`Change ${i + 1}: rationale is verplicht op beschermde documenten.`);
      }
    }
  }

  if (violations.length) {
    return {
      ok: false,
      error: `Patch geweigerd voor beschermd document "${docPath}": ${violations.join(" ")}`,
      violations,
    };
  }
  return { ok: true };
}
