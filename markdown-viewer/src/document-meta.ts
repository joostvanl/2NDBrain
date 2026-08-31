/** Verborgen iOMS corpus-metadata (HTML-comment) die niet in de visuele editor hoort. */
const CORPUS_META_PREFIX_RE = /^\s*<!--[\s\S]*?ioms-corpus-meta[\s\S]*?-->\s*/;

export function extractHiddenDocumentPrefix(markdown: string): string {
  const m = CORPUS_META_PREFIX_RE.exec(String(markdown || ""));
  if (!m) return "";
  return `${m[0].trimEnd()}\n\n`;
}

export function stripHiddenDocumentPrefix(markdown: string): string {
  return String(markdown || "").replace(CORPUS_META_PREFIX_RE, "").replace(/^\n+/, "");
}

/** Voeg corpus-meta weer toe vóór zichtbare body (editor/agent-export). */
export function mergeHiddenDocumentPrefix(prefix: string, body: string): string {
  const visible = stripHiddenDocumentPrefix(body).trimStart();
  const meta = prefix.trim() || extractHiddenDocumentPrefix(body).trim();
  if (!meta) return visible;
  if (CORPUS_META_PREFIX_RE.test(String(body || ""))) return String(body || "").trimEnd() + "\n";
  return visible ? `${meta}\n\n${visible}\n` : `${meta}\n`;
}

export function isWorkDraftPath(relPath: string): boolean {
  const base = relPath.includes("/") ? relPath.slice(relPath.lastIndexOf("/") + 1) : relPath;
  return base.startsWith("_draft-") && base.toLowerCase().endsWith(".md");
}
