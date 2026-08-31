import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../server/load-env.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const pats = [];
for (const line of envText.split("\n")) {
  const trimmed = line.trim();
  const match = trimmed.match(/^#?\s*CONFLUENCE_PAT=(.+)$/i);
  if (!match) continue;
  const value = match[1].trim().replace(/^['"]|['"]$/g, "");
  if (value) pats.push({ active: !trimmed.startsWith("#"), label: trimmed.startsWith("#") ? "commented" : "active" });
}

const base = process.env.CONFLUENCE_BASE_URL.replace(/\/+$/, "");
const probeUrl = `${base}/rest/api/content/search?cql=type=page&limit=1`;

async function probePat(pat, label) {
  const response = await fetch(probeUrl, {
    redirect: "manual",
    headers: { Accept: "application/json", Authorization: `Bearer ${pat}` },
  });
  const location = response.headers.get("location") || "";
  const body = (await response.text()).slice(0, 60);
  return {
    label,
    status: response.status,
    gatewayRedirect: location.includes("auth.hosted-tools.com"),
    json: body.trim().startsWith("{"),
  };
}

const uniquePats = [];
const seen = new Set();
for (const line of envText.split("\n")) {
  const trimmed = line.trim();
  const match = trimmed.match(/^#?\s*CONFLUENCE_PAT=(.+)$/i);
  if (!match) continue;
  const value = match[1].trim().replace(/^['"]|['"]$/g, "");
  if (!value || seen.has(value)) continue;
  seen.add(value);
  uniquePats.push({ value, label: trimmed.startsWith("#") ? "commented" : "active" });
}

console.log(`Testing ${uniquePats.length} PAT variant(s) against ${base}`);
for (const item of uniquePats) {
  console.log(JSON.stringify(await probePat(item.value, item.label)));
}
