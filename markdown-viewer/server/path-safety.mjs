import path from "node:path";

export const MEMORY_DIRNAME = ".memory";

/** Zelfde regel als LLM2DOCX `paths.safe_docx_filename` (basename, veilige tekens). */
export const SAFE_DOCX_BASENAME = /^[a-zA-Z0-9. _-]+\.docx$/;

export function safeMarkdownName(raw) {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw);
  if (!base.endsWith(".md") || base !== raw.trim() || base.includes("..")) return null;
  return base;
}

export function safeMarkdownPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  const last = parts.at(-1);
  if (!last?.endsWith(".md")) return null;
  return parts.join("/");
}

export function safeMemoryMarkdownPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^Files\//i, "")
    .replace(new RegExp(`^${MEMORY_DIRNAME.replace(".", "\\.")}/`, "i"), "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  const last = parts.at(-1);
  if (!last?.endsWith(".md")) return null;
  return parts.join("/");
}

export function safeFolderPath(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized === "") return "";
  if (normalized.includes("\0") || normalized.includes("..")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith(".") || /[<>:"|?*]/.test(p))) return null;
  return parts.join("/");
}

export function safeTemplateName(raw) {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw);
  if (!base.endsWith(".json") || base !== raw.trim() || base.includes("..")) return null;
  return base;
}

export function safeDocxTemplateName(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.includes("..") || t.includes("/") || t.includes("\\")) return null;
  if (path.basename(t) !== t) return null;
  if (!SAFE_DOCX_BASENAME.test(t)) return null;
  return t;
}

/** Naam voor een nieuw .md-bestand na DOCX-import (alleen basename; veilig voor Files/). */
export function suggestedMdNameFromDocxUpload(originalName) {
  const fallback = `Geimporteerd-${Date.now()}.md`;
  const raw = typeof originalName === "string" ? originalName.trim() : "";
  const base = raw ? path.basename(raw.replace(/\\/g, "/")) : "";
  if (!base || !base.toLowerCase().endsWith(".docx")) return fallback;
  const stem = base.slice(0, -5);
  if (!stem || stem.startsWith(".") || /[<>:"|?*\\/]/.test(stem)) return fallback;
  const candidate = `${stem}.md`;
  return safeMarkdownPath(candidate) ? candidate : fallback;
}

export function safeDocxDownloadName(raw, fallback) {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  let t = path.basename(raw.trim().replace(/\\/g, "/"));
  if (t.includes("..")) return fallback;
  if (!/\.docx$/i.test(t)) {
    const stem = t.replace(/\.[^.]+$/, "") || "export";
    t = `${stem}.docx`;
  }
  if (/[<>:"/\\|?*\x00-\x1f]/.test(t)) return fallback;
  if (t.length > 180 || t.length < 6) return fallback;
  return t;
}
