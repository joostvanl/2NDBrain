/**
 * Automatische corpus-index onder MARKDOWN_DIR/.mv-index/
 * — manifest.json + Markdown-overzichten voor second-brain / corpus-vragen.
 */
import fs from "fs";
import path from "path";

export const CORPUS_INDEX_DIRNAME = ".mv-index";
const MANIFEST_FILE = "manifest.json";
export const CORPUS_OVERVIEW_FILE = "CORPUS_OVERVIEW.md";
export const CORPUS_GRAPH_FILE = "CORPUS_GRAPH.md";

const DEFAULT_YIELD_EVERY = 15;

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Nederlandse / Engelse stopwords voor lichte retrieval */
const STOP = new Set([
  "de",
  "het",
  "een",
  "van",
  "en",
  "voor",
  "met",
  "aan",
  "bij",
  "naar",
  "die",
  "dat",
  "dit",
  "welke",
  "wat",
  "wie",
  "hoe",
  "waar",
  "the",
  "and",
  "or",
  "for",
  "with",
  "that",
  "this",
]);

const WORD_RE = /[a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœ]{2,}/gi;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const BROAD_QUESTION_RE =
  /\b(alles|alle|volledig|hele|breed|overzicht|inventarisatie|inventariseer|vergelijk|vergelijking|samenvatting|analyse|rapport|matrix|landschap|corpus|kennisbank)\b/i;
const FOCUSED_QUESTION_RE =
  /\b(wie|wat|waar|wanneer|waarom|hoeveel|welke|toon|zoek|vind|noem|geef)\b/i;

export function retrievalBudgetForQuestion(question, opts = {}) {
  const q = String(question || "").trim();
  const words = tokenizeForRetrieval(q);
  const isBroad = BROAD_QUESTION_RE.test(q) || words.length >= 12;
  const isFocused = !isBroad && (FOCUSED_QUESTION_RE.test(q) || words.length <= 6);
  const profile = opts.profile || (isBroad ? "broad" : isFocused ? "focused" : "balanced");
  const budgets = {
    focused: {
      profile: "focused",
      maxDocs: 6,
      hintDocs: 6,
      compactDocs: 24,
      compactPreviewChars: 90,
      maxCompactChars: 3200,
      sectionLimit: 10,
      sectionPreviewChars: 140,
    },
    balanced: {
      profile: "balanced",
      maxDocs: 10,
      hintDocs: 10,
      compactDocs: 42,
      compactPreviewChars: 100,
      maxCompactChars: 4500,
      sectionLimit: 12,
      sectionPreviewChars: 150,
    },
    broad: {
      profile: "broad",
      maxDocs: 18,
      hintDocs: 18,
      compactDocs: 90,
      compactPreviewChars: 140,
      maxCompactChars: 10000,
      sectionLimit: 28,
      sectionPreviewChars: 190,
    },
  };
  const budget = budgets[profile] || budgets.balanced;
  return { ...budget, queryTokenCount: words.length };
}

function tokenizeForRetrieval(text) {
  const out = [];
  const raw = String(text || "").toLowerCase();
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(raw))) {
    const w = m[0];
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

function termFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
  return tf;
}

function bm25Search(question, docs, opts = {}) {
  const startedAt = Date.now();
  const queryTokens = [...new Set(tokenizeForRetrieval(question))];
  const limit = Math.max(1, Number(opts.limit || docs.length || 1));
  const prepared = docs
    .map((doc) => {
      const tokens = tokenizeForRetrieval(doc.text);
      return {
        ...doc,
        tokens,
        tf: termFrequency(tokens),
        length: tokens.length,
      };
    })
    .filter((doc) => doc.length > 0);

  if (!prepared.length) {
    return {
      results: [],
      meta: {
        algorithm: "bm25",
        queryTokens,
        candidateCount: docs.length,
        indexedCount: 0,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const docCount = prepared.length;
  const avgLength = prepared.reduce((sum, doc) => sum + doc.length, 0) / docCount || 1;
  const df = new Map();
  for (const token of queryTokens) {
    let count = 0;
    for (const doc of prepared) {
      if (doc.tf.has(token)) count += 1;
    }
    df.set(token, count);
  }

  const results = prepared
    .map((doc) => {
      let score = 0;
      for (const token of queryTokens) {
        const freq = doc.tf.get(token) || 0;
        if (!freq) continue;
        const docsWithTerm = df.get(token) || 0;
        const idf = Math.log(1 + (docCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
        const denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * (doc.length / avgLength));
        score += idf * ((freq * (BM25_K1 + 1)) / denom);
      }
      return { ...doc, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    results,
    meta: {
      algorithm: "bm25",
      queryTokens,
      candidateCount: docs.length,
      indexedCount: docCount,
      returnedCount: results.length,
      avgDocLength: Math.round(avgLength * 100) / 100,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

export function corpusIndexRoot(markdownDir, opts = {}) {
  return opts.indexDir ? path.resolve(opts.indexDir) : path.join(markdownDir, CORPUS_INDEX_DIRNAME);
}

function walkMarkdownFiles(dir, prefix, out, opts = {}) {
  if (!fs.existsSync(dir)) return;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".") && opts.includeDotDirs !== true) continue;
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walkMarkdownFiles(full, rel, out, opts);
    else if (d.isFile() && d.name.toLowerCase().endsWith(".md")) out.push(rel.replace(/\\/g, "/"));
  }
}

/** Alle .md relatief tot markdownDir (geen verborgen mappen — naam begint met .). */
export function listAllMarkdownRelative(markdownDir, opts = {}) {
  const out = [];
  walkMarkdownFiles(markdownDir, "", out, opts);
  return out.sort((a, b) => a.localeCompare(b));
}

function safeDecodeUriComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripMarkdownLinkTitle(target) {
  const s = String(target || "").trim();
  if (s.startsWith("<")) {
    const close = s.indexOf(">");
    return close >= 0 ? s.slice(1, close) : s.slice(1);
  }
  return s;
}

function normalizeObsidianMarkdownTarget(rawTarget, fromRelPath) {
  let target = stripMarkdownLinkTitle(rawTarget)
    .trim()
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\/g, "/");
  if (!target) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) return null;
  target = safeDecodeUriComponent(target);
  const hash = target.indexOf("#");
  if (hash >= 0) target = target.slice(0, hash);
  const query = target.indexOf("?");
  if (query >= 0) target = target.slice(0, query);
  target = target.trim().replace(/^Files\//i, "").replace(/^\.\//, "");
  if (!target || target.startsWith("/")) return null;
  if (!/\.(?:md|markdown)$/i.test(target)) target = `${target}.md`;

  const folder = path.posix.dirname(String(fromRelPath || "").replace(/\\/g, "/"));
  const resolved =
    folder === "." || folder === ""
      ? target.replace(/^\.\//, "")
      : path.posix.normalize(`${folder}/${target}`).replace(/^\.\//, "");
  if (!resolved || resolved.startsWith("../") || resolved === "..") return null;
  return resolved.replace(/\\/g, "/").replace(/\.markdown$/i, ".md");
}

function extractMarkdownInlineLinkTargets(content) {
  const text = String(content || "");
  const targets = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "]" || text[i + 1] !== "(") continue;
    let start = i + 2;
    while (/\s/.test(text[start] || "")) start += 1;
    let end = start;
    if (text[start] === "<") {
      end = text.indexOf(">", start + 1);
      if (end < 0) continue;
      targets.push(text.slice(start, end + 1));
      i = end + 1;
      continue;
    }

    let depth = 0;
    let escaped = false;
    for (end = start; end < text.length; end += 1) {
      const ch = text[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\n" || ch === "\r") break;
      if (ch === "(") {
        depth += 1;
        continue;
      }
      if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (text[end] !== ")") continue;
    targets.push(text.slice(start, end));
    i = end;
  }
  return targets;
}

function extractMdLinks(content, fromRelPath) {
  const links = new Set();
  for (const rawTarget of extractMarkdownInlineLinkTargets(content)) {
    const resolved = normalizeObsidianMarkdownTarget(rawTarget, fromRelPath);
    if (resolved) links.add(resolved);
  }

  const wiki = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = wiki.exec(content))) {
    const resolved = normalizeObsidianMarkdownTarget(m[1], fromRelPath);
    if (resolved) links.add(resolved);
  }
  return [...links];
}

function parseFrontmatterValue(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((x) => parseFrontmatterValue(x))
      .filter((x) => x !== "");
  }
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function extractFrontmatter(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return { properties: {}, body: text };
  const properties = {};
  let currentKey = "";
  for (const line of m[1].split("\n")) {
    if (/^\s*-\s+/.test(line) && currentKey) {
      const prev = properties[currentKey];
      const arr = Array.isArray(prev) ? prev : prev === "" || prev == null ? [] : [prev];
      arr.push(parseFrontmatterValue(line.replace(/^\s*-\s+/, "")));
      properties[currentKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    currentKey = kv[1];
    properties[currentKey] = parseFrontmatterValue(kv[2]);
  }
  return { properties, body: text.slice(m[0].length) };
}

export const CORPUS_META_COMMENT_MARKER = "ioms-corpus-meta";

const CORPUS_META_COMMENT_RE = /<!--\s*ioms-corpus-meta\s*\n([\s\S]*?)\s*-->/i;

const CORPUS_META_KEYS = new Set([
  "doc_id",
  "organized_at",
  "aliases",
  "type",
  "moved_to",
  "moved_at",
  "title",
]);

function parseCorpusMetaLines(block) {
  const properties = {};
  let currentKey = "";
  for (const line of String(block || "").split("\n")) {
    if (/^\s*-\s+/.test(line) && currentKey) {
      const prev = properties[currentKey];
      const arr = Array.isArray(prev) ? prev : prev === "" || prev == null ? [] : [prev];
      arr.push(parseFrontmatterValue(line.replace(/^\s*-\s+/, "")));
      properties[currentKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    currentKey = kv[1];
    properties[currentKey] = parseFrontmatterValue(kv[2]);
  }
  return properties;
}

function extractCorpusMetaComment(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const m = CORPUS_META_COMMENT_RE.exec(text);
  if (!m) return { properties: {}, body: text };
  return {
    properties: parseCorpusMetaLines(m[1]),
    body: `${text.slice(0, m.index)}${text.slice(m.index + m[0].length)}`.replace(/^\n+/, ""),
  };
}

export function extractDocumentMetadata(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const fromComment = extractCorpusMetaComment(text);
  const fromFrontmatter = extractFrontmatter(fromComment.body);
  const properties = { ...fromFrontmatter.properties, ...fromComment.properties };
  return {
    properties,
    body: fromFrontmatter.body,
  };
}

function serializeCorpusMetaProperties(properties) {
  const lines = [CORPUS_META_COMMENT_MARKER];
  for (const [key, value] of Object.entries(properties || {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${JSON.stringify(String(item))}`);
      continue;
    }
    if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(String(value))}`);
  }
  return `<!--\n${lines.join("\n")}\n-->`;
}

export function stripCorpusMetaFromMarkdown(content) {
  const withoutComment = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(CORPUS_META_COMMENT_RE, "")
    .replace(/^\n+/, "");
  const { properties, body } = extractFrontmatter(withoutComment);
  const remaining = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !CORPUS_META_KEYS.has(key)),
  );
  if (!Object.keys(remaining).length) return body.replace(/^\n+/, "");
  const lines = ["---"];
  for (const [key, value] of Object.entries(remaining)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${JSON.stringify(String(item))}`);
    } else if (value != null && value !== "") {
      lines.push(`${key}: ${JSON.stringify(String(value))}`);
    }
  }
  lines.push("---", "");
  return `${lines.join("\n")}${body.replace(/^\n+/, "")}`;
}

export function ensureCorpusMetaComment(content, docId, extra = {}) {
  const meta = extractDocumentMetadata(content);
  const aliases = new Set(valuesAsStrings(meta.properties.aliases));
  for (const value of valuesAsStrings(extra.aliases)) aliases.add(value);
  const nextId =
    docId ||
    meta.properties.doc_id ||
    valuesAsStrings(extra.doc_id)[0] ||
    slugifyDocIdFromBasename(content);
  const nextProps = {
    doc_id: nextId,
    organized_at: meta.properties.organized_at || extra.organized_at || new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(extra).filter(([key]) => !["aliases", "doc_id", "organized_at"].includes(key)),
    ),
  };
  if (aliases.size) nextProps.aliases = [...aliases];
  const visibleBody = stripCorpusMetaFromMarkdown(content);
  return {
    content: `${serializeCorpusMetaProperties(nextProps)}\n\n${visibleBody}`.trimEnd() + "\n",
    docId: nextId,
  };
}

function slugifyDocIdFromBasename(content) {
  const meta = extractDocumentMetadata(content);
  for (const line of meta.body.split("\n")) {
    const hm = /^#\s+(.+)$/.exec(line.trim());
    if (hm) {
      const slug = hm[1]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      if (slug) return slug;
    }
  }
  return `doc-${Date.now()}`;
}

function valuesAsStrings(value) {
  if (Array.isArray(value)) return value.flatMap(valuesAsStrings);
  if (value == null || value === "") return [];
  return [String(value)];
}

function extractTags(content, properties = {}) {
  const tags = new Set();
  for (const value of valuesAsStrings(properties.tags || properties.tag)) {
    const clean = value.trim().replace(/^#/, "");
    if (clean) tags.add(clean);
  }
  const re = /(^|[\s([{])#([A-Za-z0-9_/-]{2,})\b/g;
  let m;
  while ((m = re.exec(content))) tags.add(m[2]);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function mentionNeedlesForEntry(entry) {
  const out = new Set();
  const title = String(entry.title || "").trim();
  const stem = path.posix.basename(entry.path, path.posix.extname(entry.path)).replace(/[_-]+/g, " ").trim();
  if (title.length >= 4) out.add(title);
  if (stem.length >= 4) out.add(stem);
  return [...out]
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 4);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPlainMention(content, needle) {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(needle)}([^\\p{L}\\p{N}_]|$)`, "iu");
  return re.test(content);
}

function unlinkedMentionsFor(entry, entries, contentByPath, limit = 20) {
  const content = contentByPath.get(entry.path) || "";
  const linked = new Set(entry.linksOut || []);
  const out = [];
  for (const other of entries) {
    if (other.path === entry.path || linked.has(other.path)) continue;
    const needles = mentionNeedlesForEntry(other);
    const matched = needles.find((needle) => hasPlainMention(content, needle));
    if (matched) {
      out.push({ path: other.path, title: other.title, mention: matched });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function unlinkedMentionSuggestionsFromManifest(manifest, opts = {}) {
  const scope = opts.scope || manifest?.scope || "working";
  const limit = Math.max(1, Number(opts.limit || 500));
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const out = [];
  for (const entry of entries) {
    if (!entry?.path || !Array.isArray(entry.unlinkedMentions)) continue;
    for (const mention of entry.unlinkedMentions) {
      if (!mention?.path || !mention?.mention) continue;
      out.push({
        id: `${scope}:${entry.path}->${mention.path}:${mention.mention}`,
        scope,
        from: entry.path,
        to: mention.path,
        title: mention.title || mention.path,
        mention: mention.mention,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function relativeMarkdownLink(fromRelPath, toRelPath) {
  const fromDir = path.posix.dirname(String(fromRelPath || "").replace(/\\/g, "/"));
  let rel = fromDir === "." ? toRelPath : path.posix.relative(fromDir, toRelPath);
  if (!rel || rel === ".") rel = path.posix.basename(toRelPath);
  return rel.replace(/\\/g, "/");
}

function formatObsidianMarkdownLinkTarget(target) {
  return String(target || "")
    .replace(/\\/g, "/")
    .replace(/([()])/g, "\\$1");
}

function repairEscapedMarkdownLinksInLine(line) {
  return String(line || "").replace(/\\?\[([^\]\n]+?)\\?\]\(([^)\n]+)\)/g, (_match, label, target) => {
    return `[${String(label).replace(/\\([\[\]])/g, "$1")}](${target})`;
  });
}

export function repairEscapedMarkdownLinksInMarkdown(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  let inFrontmatter = text.startsWith("---\n");
  let frontmatterLine = 0;
  let inFence = false;
  let repairedCount = 0;
  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    const skipLine = inFrontmatter || inFence;
    let nextLine = line;
    if (!skipLine) {
      nextLine = repairEscapedMarkdownLinksInLine(line);
      if (nextLine !== line) repairedCount += 1;
    }

    if (inFrontmatter) {
      frontmatterLine += 1;
      if (frontmatterLine > 1 && trimmed === "---") inFrontmatter = false;
    } else if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    return nextLine;
  });
  return {
    content: lines.join("\n"),
    repairedCount,
    changed: repairedCount > 0,
  };
}

function isInlineCodePosition(line, idx) {
  const before = line.slice(0, idx);
  const ticks = (before.match(/`/g) || []).length;
  return ticks % 2 === 1;
}

function candidateLooksLinked(content, start, end) {
  const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextLine = content.indexOf("\n", end);
  const lineEnd = nextLine === -1 ? content.length : nextLine;
  const line = content.slice(lineStart, lineEnd);
  const relStart = start - lineStart;
  const relEnd = end - lineStart;

  if (isInlineCodePosition(line, relStart)) return true;
  const wikiOpen = line.lastIndexOf("[[", relStart);
  const wikiClose = line.lastIndexOf("]]", relStart);
  if (wikiOpen > wikiClose) return true;

  const mdOpen = line.lastIndexOf("[", relStart);
  const mdClose = line.lastIndexOf("]", relStart);
  if (mdOpen > mdClose && line.slice(relEnd).startsWith("](")) return true;
  return line.slice(relStart - 1, relStart) === "[" && line.slice(relEnd, relEnd + 2) === "](";
}

function findLinkableMention(content, needle) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  const mention = String(needle || "").trim();
  if (mention.length < 4) return null;

  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(mention)})(?=[^\\p{L}\\p{N}_]|$)`, "giu");
  let offset = 0;
  let inFrontmatter = text.startsWith("---\n");
  let frontmatterLine = 0;
  let inFence = false;
  for (const rawLine of text.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!rawLine) break;
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    const skipLine = inFrontmatter || inFence || /^#{1,6}\s+/.test(line);

    if (!skipLine) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const start = offset + m.index + m[1].length;
        const end = start + m[2].length;
        if (!candidateLooksLinked(text, start, end)) {
          return { start, end, text: m[2] };
        }
      }
    }

    if (inFrontmatter) {
      frontmatterLine += 1;
      if (frontmatterLine > 1 && trimmed === "---") inFrontmatter = false;
    } else if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    offset += rawLine.length;
  }
  return null;
}

export function linkUnlinkedMentionsInMarkdown(content, fromRelPath, suggestions, opts = {}) {
  const repaired = repairEscapedMarkdownLinksInMarkdown(content);
  let nextContent = repaired.content;
  const applied = [];
  const skipped = [];
  const maxPerFile = Math.max(1, Number(opts.maxPerFile || 50));

  for (const suggestion of Array.isArray(suggestions) ? suggestions : []) {
    if (applied.length >= maxPerFile) break;
    const to = String(suggestion?.to || suggestion?.path || "").replace(/\\/g, "/").trim();
    const mention = String(suggestion?.mention || "").trim();
    if (!to || !mention) continue;

    if (extractMdLinks(nextContent, fromRelPath).includes(to)) {
      skipped.push({ ...suggestion, reason: "already-linked" });
      continue;
    }
    const match = findLinkableMention(nextContent, mention);
    if (!match) {
      skipped.push({ ...suggestion, reason: "mention-not-found" });
      continue;
    }

    const target = formatObsidianMarkdownLinkTarget(relativeMarkdownLink(fromRelPath, to));
    const label = match.text.replace(/\]/g, "\\]");
    const link = `[${label}](${target})`;
    nextContent = `${nextContent.slice(0, match.start)}${link}${nextContent.slice(match.end)}`;
    applied.push({ ...suggestion, link, offset: match.start });
  }

  return {
    content: nextContent,
    applied,
    skipped,
    repairedCount: repaired.repairedCount,
    changed: repaired.changed || applied.length > 0,
  };
}

function extractHeadings(content, max = 60) {
  const headings = [];
  for (const line of content.split(/\r?\n/)) {
    const hm = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hm) headings.push(hm[2].trim());
    if (headings.length >= max) break;
  }
  return headings;
}

function sectionIdFromHeadingPath(pathParts, index) {
  const slug = pathParts
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${index + 1}-${slug || "sectie"}`;
}

export function extractMarkdownSections(content, maxSections = 200) {
  const lines = String(content || "").split(/\r?\n/);
  const headingRows = [];
  for (let i = 0; i < lines.length; i++) {
    const hm = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!hm) continue;
    headingRows.push({
      lineIndex: i,
      level: hm[1].length,
      heading: hm[2].trim(),
    });
    if (headingRows.length >= maxSections) break;
  }

  const stack = [];
  return headingRows.map((h, idx) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push({ level: h.level, heading: h.heading });
    const next = headingRows[idx + 1];
    const endLineIndex = next ? next.lineIndex - 1 : lines.length - 1;
    const body = lines.slice(h.lineIndex + 1, endLineIndex + 1).join("\n").trim();
    const headingPath = stack.map((x) => x.heading);
    return {
      id: sectionIdFromHeadingPath(headingPath, idx),
      level: h.level,
      heading: h.heading,
      headingPath,
      startLine: h.lineIndex + 1,
      endLine: endLineIndex + 1,
      contentChars: body.length,
      preview: previewFromContent(body, 260),
    };
  });
}

function extractTitle(content, basename) {
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    const hm = /^#\s+(.+)$/.exec(t);
    if (hm) return hm[1].trim();
  }
  return basename.replace(/\.md$/i, "");
}

function previewFromContent(content, maxLen = 420) {
  const stripped = content
    .replace(/^#{1,6}\s+.+\n/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length <= maxLen ? stripped : `${stripped.slice(0, maxLen)}…`;
}

function headingKeywords(headings) {
  const words = new Map();
  for (const h of headings) {
    for (const w of h.toLowerCase().split(/[^a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœ]+/)) {
      if (w.length < 3 || STOP.has(w)) continue;
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  return words;
}

function relatedFor(entries, kwPerPath, pathRel, limit = 10) {
  const scores = new Map();
  const entry = entries.find((x) => x.path === pathRel);
  if (!entry) return [];
  const selfKw = kwPerPath.get(pathRel);

  for (const other of entries) {
    if (other.path === pathRel) continue;
    let s = 0;
    if (entry.linksOut.includes(other.path)) s += 12;
    if (other.linksOut.includes(pathRel)) s += 12;
    const sameFolder = path.posix.dirname(other.path) === path.posix.dirname(pathRel);
    if (sameFolder) s += 2;

    const okw = kwPerPath.get(other.path);
    if (selfKw && okw) {
      for (const [w, c] of selfKw) {
        if (okw.has(w)) s += Math.min(4, c + (okw.get(w) ?? 0));
      }
    }
    if (s > 0) scores.set(other.path, s);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([p]) => p);
}

/**
 * Bouwt manifest + CORPUS_OVERVIEW.md + CORPUS_GRAPH.md + README.md
 */
export async function rebuildCorpusIndex(markdownDir, opts = {}) {
  const sourceRoot = opts.sourceRootDir ? path.resolve(opts.sourceRootDir) : path.resolve(markdownDir);
  if (!sourceRoot || !fs.existsSync(sourceRoot)) {
    throw new Error("MARKDOWN_DIR bestaat niet");
  }
  const root = corpusIndexRoot(markdownDir, opts);
  fs.mkdirSync(root, { recursive: true });

  const paths = listAllMarkdownRelative(sourceRoot, opts);
  const entries = [];
  const contentByPath = new Map();
  const yieldEvery = opts.yieldEvery ?? DEFAULT_YIELD_EVERY;
  let fileIdx = 0;

  for (const rel of paths) {
    const full = path.join(sourceRoot, ...rel.split("/"));
    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    fileIdx += 1;
    if (yieldEvery > 0 && fileIdx % yieldEvery === 0) {
      await yieldToEventLoop();
    }
    contentByPath.set(rel, content);
    const { properties, body } = extractDocumentMetadata(content);
    const title =
      valuesAsStrings(properties.title)[0]?.trim() ||
      extractTitle(body, path.basename(rel));
    const headings = extractHeadings(body);
    const linksOutRaw = extractMdLinks(content, rel);
    const linksOut = linksOutRaw.filter((t) => paths.includes(t));
    const tags = extractTags(content, properties);

    let st = null;
    try {
      st = fs.statSync(full);
    } catch {
      /* skip */
    }

    entries.push({
      path: rel,
      title,
      docId: valuesAsStrings(properties.doc_id)[0] || null,
      aliases: valuesAsStrings(properties.aliases),
      isRedirect: String(properties.type || "").toLowerCase() === "redirect",
      redirectTo: String(properties.moved_to || properties.movedTo || "").replace(/\\/g, "/") || null,
      headings,
      linksOut,
      tags,
      properties,
      preview: previewFromContent(body),
      size: content.length,
      mtimeMs: st ? st.mtimeMs : 0,
    });
  }

  const inbound = {};
  const backlinksByPath = new Map(entries.map((e) => [e.path, []]));
  for (const e of entries) {
    for (const t of e.linksOut) {
      inbound[t] = (inbound[t] || 0) + 1;
      backlinksByPath.get(t)?.push(e.path);
    }
  }

  const kwPerPath = new Map(entries.map((e) => [e.path, headingKeywords(e.headings)]));
  const metadataKeys = [...new Set(entries.flatMap((e) => Object.keys(e.properties || {})))].sort((a, b) =>
    a.localeCompare(b),
  );
  const tagCounts = {};
  for (const e of entries) {
    for (const tag of e.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  if (yieldEvery > 0) await yieldToEventLoop();

  const enriched = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    enriched.push({
      ...e,
      linksInCount: inbound[e.path] || 0,
      backlinks: (backlinksByPath.get(e.path) || []).sort((a, b) => a.localeCompare(b)),
      unlinkedMentions: unlinkedMentionsFor(e, entries, contentByPath),
      related: relatedFor(entries, kwPerPath, e.path),
    });
    if (yieldEvery > 0 && (i + 1) % yieldEvery === 0) {
      await yieldToEventLoop();
    }
  }

  const manifest = {
    version: 1,
    scope: opts.scope || "working",
    generatedAt: new Date().toISOString(),
    entryCount: enriched.length,
    metadataKeys,
    tagCounts,
    entries: enriched,
  };

  fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2), "utf8");

  let ov = `# Corpus-overzicht (automatisch)\n\n`;
  ov += `Gegenereerd: **${manifest.generatedAt}**. Documenten: **${enriched.length}**.\n\n`;
  ov += `Scope: **${manifest.scope}**. Deze index wordt gebruikt voor retrieval. Verborgen mappen (\`.\`) worden niet meegenomen.\n\n`;
  ov += `| Document | Titel | Tags | Status | Uitgaande links (intern) |\n|----------|-------|------|--------|---------------------------|\n`;
  for (const e of enriched) {
    const lo = e.linksOut.length ? e.linksOut.map((x) => `\`${x}\``).join(", ") : "—";
    const tit = String(e.title).replace(/\|/g, "\\|");
    const tags = e.tags?.length ? e.tags.map((x) => `#${String(x).replace(/\|/g, "\\|")}`).join(", ") : "—";
    const status = String(e.properties?.status || e.properties?.state || "—").replace(/\|/g, "\\|");
    ov += `| \`${e.path}\` | ${tit} | ${tags} | ${status} | ${lo} |\n`;
  }
  fs.writeFileSync(path.join(root, CORPUS_OVERVIEW_FILE), ov, "utf8");

  let gr = `# Documentrelaties (automatisch)\n\n`;
  gr += `Koppelingen op basis van markdown-links (\`.md\`), wiki-syntax \`[[…]]\`, backlinks, unlinked mentions, map-nabijheid en overlap in koppen.\n\n`;
  for (const e of enriched) {
    const tit = String(e.title).replace(/#/g, "");
    gr += `## ${tit}\n\n**Pad:** \`${e.path}\`\n\n`;
    if (e.linksOut.length) {
      gr += `- **Verwijst naar:** ${e.linksOut.map((x) => `\`${x}\``).join(", ")}\n`;
    }
    if (e.backlinks?.length) {
      gr += `- **Backlinks:** ${e.backlinks.map((x) => `\`${x}\``).join(", ")}\n`;
    }
    if (e.unlinkedMentions?.length) {
      gr += `- **Mogelijke onverbonden mentions:** ${e.unlinkedMentions
        .map((x) => `\`${x.path}\` via "${String(x.mention).replace(/"/g, "'")}"`)
        .join(", ")}\n`;
    }
    if (e.related?.length) {
      gr += `- **Gerelateerd (heuristiek):** ${e.related.map((x) => `\`${x}\``).join(", ")}\n`;
    }
    if (!e.linksOut.length && !e.backlinks?.length && !e.unlinkedMentions?.length && !e.related?.length) {
      gr += `- *(geen automatische relaties)*\n`;
    }
    gr += `\n`;
  }
  fs.writeFileSync(path.join(root, CORPUS_GRAPH_FILE), gr, "utf8");

  fs.writeFileSync(
    path.join(root, "README.md"),
    `# Corpus-index (.mv-index)\n\n` +
      `Deze map wordt automatisch gevuld door de markdown-viewer API.\n\n` +
      `- **manifest.json** — metadata voor retrieval\n` +
      `- **CORPUS_OVERVIEW.md** — tabel alle documenten\n` +
      `- **CORPUS_GRAPH.md** — relaties tussen documenten\n\n` +
      `Handmatig bewerken kan bij rebuild worden overschreven.\n`,
    "utf8",
  );

  return manifest;
}

export function readManifest(markdownDir, opts = {}) {
  const p = path.join(corpusIndexRoot(markdownDir, opts), MANIFEST_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function filterManifestEntries(manifest, excludePathPatterns = []) {
  const patterns = (Array.isArray(excludePathPatterns) ? excludePathPatterns : [])
    .map((p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, ""))
    .filter(Boolean);
  if (!manifest?.entries?.length || !patterns.length) return manifest;
  const entries = manifest.entries.filter((entry) => {
    const pathNorm = String(entry.path || "").replace(/\\/g, "/");
    return !patterns.some((pattern) => pathNorm.includes(pattern.replace(/\/+$/, "")));
  });
  return { ...manifest, entries };
}

/**
 * Actueel pad na Corpus Gardener-verplaatsing (match op pad, doc_id of alias).
 * @returns {string | null}
 */
export function resolveCanonicalDocumentPath(manifest, requestedPath, content = null) {
  const req = String(requestedPath || "").replace(/\\/g, "/").trim();
  if (!req) return null;
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  let docId = null;
  if (content != null) {
    docId = valuesAsStrings(extractDocumentMetadata(content).properties.doc_id)[0] || null;
  }

  for (const entry of entries) {
    if (entry.isRedirect) continue;
    if (entry.path === req) return entry.path;
  }
  if (docId) {
    for (const entry of entries) {
      if (entry.isRedirect) continue;
      if (entry.docId === docId) return entry.path;
    }
  }
  for (const entry of entries) {
    if (entry.isRedirect) continue;
    if (valuesAsStrings(entry.aliases).includes(req)) return entry.path;
  }
  return null;
}

export function searchCorpusManifests(question, manifests, opts = {}) {
  const limit = Math.max(1, Math.min(50, Number(opts.limit || 20) || 20));
  const minScore = Number(opts.minScore || 0);
  const scopes = Array.isArray(manifests) ? manifests : [];
  const merged = [];
  for (const item of scopes) {
    const manifest = item?.manifest;
    const scope = item?.scope || manifest?.scope || "working";
    if (!manifest?.entries?.length) continue;
    const scored = scoreEntriesForQuestion(question, manifest);
    for (const row of scored) {
      if (row.score <= minScore) continue;
      merged.push({
        scope,
        score: row.score,
        path: row.entry.path,
        title: row.entry.title,
        docId: row.entry.docId || null,
        preview: row.entry.preview || "",
        tags: row.entry.tags || [],
        isRedirect: row.entry.isRedirect === true,
        redirectTo: row.entry.redirectTo || null,
      });
    }
  }
  merged.sort((a, b) => b.score - a.score);
  return {
    query: String(question || ""),
    results: merged.slice(0, limit),
    meta: {
      algorithm: "bm25",
      returnedCount: Math.min(limit, merged.length),
      candidateCount: merged.length,
    },
  };
}

export function scoreEntriesForQuestion(question, manifest) {
  if (!manifest?.entries?.length) return [];
  const docs = manifest.entries.map((entry) => ({
    entry,
    text: [
      entry.path,
      entry.docId,
      Array.isArray(entry.aliases) ? entry.aliases.join(" ") : "",
      entry.title,
      Array.isArray(entry.headings) ? entry.headings.join(" ") : "",
      Array.isArray(entry.tags) ? entry.tags.join(" ") : "",
      entry.properties && typeof entry.properties === "object"
        ? Object.entries(entry.properties)
            .flatMap(([k, v]) => [k, ...valuesAsStrings(v)])
            .join(" ")
        : "",
      Array.isArray(entry.backlinks) ? entry.backlinks.join(" ") : "",
      Array.isArray(entry.unlinkedMentions)
        ? entry.unlinkedMentions.map((x) => `${x.path} ${x.title} ${x.mention}`).join(" ")
        : "",
      entry.preview,
      Array.isArray(entry.related) ? entry.related.join(" ") : "",
    ].join("\n"),
  }));
  const { results, meta } = bm25Search(question, docs, { limit: docs.length });
  const scored = results.map((doc) => ({ entry: doc.entry, score: doc.score }));
  scored.retrievalMeta = meta;
  return scored;
}

export function scoreMarkdownSectionsForQuestion(question, sections, opts = {}) {
  const docs = (Array.isArray(sections) ? sections : []).map((section, idx) => ({
    section,
    originalIndex: idx,
    text: [
      Array.isArray(section.headingPath) ? section.headingPath.join(" ") : "",
      section.heading,
      section.preview,
    ].join("\n"),
  }));
  const { results, meta } = bm25Search(question, docs, { limit: opts.limit || docs.length || 1 });
  return {
    sections: results.map((doc) => ({ ...doc.section, score: doc.score, originalIndex: doc.originalIndex })),
    meta,
  };
}

function truncateMiddle(msg, max) {
  if (msg.length <= max) return msg;
  const half = Math.floor((max - 20) / 2);
  return `${msg.slice(0, half)}\n\n… *[fragment ingekort]* …\n\n${msg.slice(-half)}`;
}

/**
 * Bouwt één grote Markdown-string voor Ask-modus “corpus”.
 */
export function buildCorpusAskContext(markdownDir, manifest, question, opts = {}) {
  const sourceRoot = opts.sourceRootDir ? path.resolve(opts.sourceRootDir) : path.resolve(markdownDir);
  const effectiveManifest = opts.excludePathPatterns?.length
    ? filterManifestEntries(manifest, opts.excludePathPatterns)
    : manifest;
  const budget = retrievalBudgetForQuestion(question, opts.retrievalBudget || {});
  const maxDocs = opts.maxDocs ?? budget.maxDocs;
  const charsPerDoc = opts.charsPerDoc ?? 4000;
  const maxTotalChars = opts.maxTotalChars ?? 88000;
  const includeFragments = opts.includeFragments !== false;
  const maxCompactChars = opts.maxCompactChars ?? (includeFragments ? 200000 : budget.maxCompactChars);

  const scored = scoreEntriesForQuestion(question, effectiveManifest);
  const retrievalMeta = scored.retrievalMeta || null;
  let picks = scored.filter((x) => x.score > 0).slice(0, maxDocs).map((x) => x.entry);
  if (picks.length === 0) picks = effectiveManifest.entries.slice(0, Math.min(maxDocs, effectiveManifest.entries.length));

  const compactCandidates = scored.length
    ? scored.map((x) => x.entry).slice(0, budget.compactDocs)
    : effectiveManifest.entries.slice(0, Math.min(budget.compactDocs, effectiveManifest.entries.length));
  let compactList = "";
  for (const e of compactCandidates) {
    const pv =
      e.preview.length > budget.compactPreviewChars
        ? `${e.preview.slice(0, budget.compactPreviewChars)}…`
        : e.preview;
    const line = `- \`${e.path}\`: **${e.title}** — ${pv}\n`;
    if (compactList.length + line.length > maxCompactChars) {
      compactList += `\n… *[documentenlijst ingekort voor contextlimiet: ${effectiveManifest.entries.length} documenten totaal]*\n`;
      break;
    }
    compactList += line;
  }

  let overviewExcerpt = "";
  const ovPath = path.join(corpusIndexRoot(markdownDir, opts), CORPUS_OVERVIEW_FILE);
  if (includeFragments && fs.existsSync(ovPath)) {
    const raw = fs.readFileSync(ovPath, "utf8");
    overviewExcerpt = raw.length > 12000 ? `${raw.slice(0, 12000)}\n\n…` : raw;
  }

  /** Bootstrap voor tool-gebaseerde corpus-chat: geen grote fragmenten; model haalt volledige tekst via tools. */
  if (!includeFragments) {
    let hints = "";
    for (const e of picks.slice(0, budget.hintDocs)) {
      const headings = e.headings.slice(0, 5).join(" · ");
      hints += `- \`${e.path}\` — **${e.title}**${headings ? ` — koppen: ${headings}` : ""}\n`;
    }
    const omittedDocs = Math.max(0, effectiveManifest.entries.length - compactCandidates.length);
    const blob =
      `## Gebruikersvraag (corpus / second brain)\n\n${question}\n\n---\n\n` +
      `## Relevante documentroutekaart (${budget.profile}, compact)\n\n${compactList}${
        omittedDocs ? `\nNog ${omittedDocs} document(en) niet meegestuurd om tokens te besparen; gebruik tools als extra dekking nodig is.\n` : ""
      }\n---\n\n` +
      `## Mogelijk relevante documenten (alleen koppen — niet de volledige inhoud)\n\n${hints || "(geen)"}\n\n---\n\n` +
      `### Werkwijze\n\n` +
      `1. Gebruik de compacte routekaart als tokenzuinige start. De hints zijn gerangschikt met BM25-retrieval.\n` +
      `2. Gebruik bij gerichte vragen eerst **read_corpus_outline** met een korte \`query\`, en daarna **read_corpus_section** voor alleen de relevante sectie.\n` +
      `3. Gebruik **read_corpus_markdown** alleen bij kleine/ongestructureerde documenten of als outline+section onvoldoende is.\n` +
      `4. Als de vraag vraagt om een overzicht, inventarisatie, vergelijking of "alles"/"hele corpus", lees dan meerdere relevante bestanden/secties in rondes totdat de corpus voldoende is afgedekt.\n` +
      `5. Antwoord pas wanneer corpus, memory, e-mailmemory en Kanban voldoende zijn meegenomen; verdiep met tools als de baseline onvolledig lijkt.\n` +
      `6. Als je genoeg hebt gelezen, antwoord dan **uitsluitend** met JSON: \`{"reply":"…"}\` (Nederlands).\n\n` +
      `*Baseer feiten alleen op gelezen bestandsinhoud of op bovenstaande routekaart; verzin niets bij.*`;

    const pickedPaths = picks.map((e) => e.path);
    return {
      markdownBlob: blob,
      pickedPaths,
      retrievalMeta: {
        ...retrievalMeta,
        budget,
        pickedCount: pickedPaths.length,
        contextChars: blob.length,
        includeFragments: false,
      },
    };
  }

  let fragments = "";
  let totalChars = 0;
  const pickedPaths = [];

  for (const e of picks) {
    const full = path.join(sourceRoot, ...e.path.split("/"));
    let body = "";
    try {
      body = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    pickedPaths.push(e.path);
    let slice = body.length > charsPerDoc ? truncateMiddle(body, charsPerDoc) : body;
    fragments += `\n\n### Fragment — \`${e.path}\`\n**Titel:** ${e.title}\n**Gerelateerde paden:** ${(e.related || []).slice(0, 8).join(", ") || "—"}\n\n${slice}`;
    totalChars += slice.length;
    if (totalChars >= maxTotalChars) break;
  }

  const blob =
    `## Gebruikersvraag (corpus / second brain)\n\n${question}\n\n---\n\n` +
    `## Relevante documentroutekaart (${budget.profile}, compact)\n\n${compactList}\n\n---\n\n` +
    `## CORPUS_OVERVIEW (fragment)\n\n${overviewExcerpt || "(geen overzichtsbestand)"}\n\n---\n\n` +
    `## Fragmenten uit de meest relevante documenten\n` +
    fragments +
    `\n\n---\n\n*Gebruik alleen informatie uit bovenstaande index en fragmenten. Verwijs waar mogelijk naar bronnen als \`pad/bestand.md\`.*`;

  return {
    markdownBlob: blob,
    pickedPaths,
    retrievalMeta: {
      ...retrievalMeta,
      budget,
      pickedCount: pickedPaths.length,
      contextChars: blob.length,
      includeFragments: true,
      fragmentChars: totalChars,
    },
  };
}
