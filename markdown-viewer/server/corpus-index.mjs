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

function extractMdLinks(content, fromRelPath) {
  const links = new Set();
  const re = /\]\(([^)]+\.(?:md|markdown))(?:#[^)]*)?\)/gi;
  let m;
  while ((m = re.exec(content))) {
    let target = m[1].trim().replace(/\\/g, "/");
    if (/^https?:\/\//i.test(target)) continue;
    if (target.startsWith("/")) continue;
    const folder = path.posix.dirname(fromRelPath);
    let resolved =
      folder === "." || folder === ""
        ? target.replace(/^\.\//, "")
        : path.posix.normalize(`${folder}/${target}`).replace(/^\.\//, "");
    resolved = resolved.replace(/\\/g, "/");
    links.add(resolved);
  }
  const wiki = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  while ((m = wiki.exec(content))) {
    let stem = m[1].trim().replace(/\\/g, "/");
    if (!stem.toLowerCase().endsWith(".md")) stem = `${stem}.md`;
    links.add(stem);
  }
  return [...links];
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

  for (const rel of paths) {
    const full = path.join(sourceRoot, ...rel.split("/"));
    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const title = extractTitle(content, path.basename(rel));
    const headings = extractHeadings(content);
    const linksOutRaw = extractMdLinks(content, rel);
    const linksOut = linksOutRaw.filter((t) => paths.includes(t));

    let st = null;
    try {
      st = fs.statSync(full);
    } catch {
      /* skip */
    }

    entries.push({
      path: rel,
      title,
      headings,
      linksOut,
      preview: previewFromContent(content),
      size: content.length,
      mtimeMs: st ? st.mtimeMs : 0,
    });
  }

  const inbound = {};
  for (const e of entries) {
    for (const t of e.linksOut) inbound[t] = (inbound[t] || 0) + 1;
  }

  const kwPerPath = new Map(entries.map((e) => [e.path, headingKeywords(e.headings)]));

  const enriched = entries.map((e) => ({
    ...e,
    linksInCount: inbound[e.path] || 0,
    related: relatedFor(entries, kwPerPath, e.path),
  }));

  const manifest = {
    version: 1,
    scope: opts.scope || "working",
    generatedAt: new Date().toISOString(),
    entryCount: enriched.length,
    entries: enriched,
  };

  fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2), "utf8");

  let ov = `# Corpus-overzicht (automatisch)\n\n`;
  ov += `Gegenereerd: **${manifest.generatedAt}**. Documenten: **${enriched.length}**.\n\n`;
  ov += `Scope: **${manifest.scope}**. Deze index wordt gebruikt voor retrieval. Verborgen mappen (\`.\`) worden niet meegenomen.\n\n`;
  ov += `| Document | Titel | Uitgaande links (intern) |\n|----------|-------|---------------------------|\n`;
  for (const e of enriched) {
    const lo = e.linksOut.length ? e.linksOut.map((x) => `\`${x}\``).join(", ") : "—";
    const tit = String(e.title).replace(/\|/g, "\\|");
    ov += `| \`${e.path}\` | ${tit} | ${lo} |\n`;
  }
  fs.writeFileSync(path.join(root, CORPUS_OVERVIEW_FILE), ov, "utf8");

  let gr = `# Documentrelaties (automatisch)\n\n`;
  gr += `Koppelingen op basis van markdown-links (\`.md\`), wiki-syntax \`[[…]]\`, map-nabijheid en overlap in koppen.\n\n`;
  for (const e of enriched) {
    const tit = String(e.title).replace(/#/g, "");
    gr += `## ${tit}\n\n**Pad:** \`${e.path}\`\n\n`;
    if (e.linksOut.length) {
      gr += `- **Verwijst naar:** ${e.linksOut.map((x) => `\`${x}\``).join(", ")}\n`;
    }
    if (e.related?.length) {
      gr += `- **Gerelateerd (heuristiek):** ${e.related.map((x) => `\`${x}\``).join(", ")}\n`;
    }
    if (!e.linksOut.length && !e.related?.length) gr += `- *(geen automatische relaties)*\n`;
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

export function scoreEntriesForQuestion(question, manifest) {
  if (!manifest?.entries?.length) return [];
  const qWords = question
    .toLowerCase()
    .split(/[^a-z0-9àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿœ]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  const scored = [];
  for (const e of manifest.entries) {
    let s = 0;
    const hay = `${e.path} ${e.title} ${e.headings.join(" ")} ${e.preview}`.toLowerCase();
    for (const w of qWords) {
      if (hay.includes(w)) s += 2;
    }
    scored.push({ entry: e, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
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
  const maxDocs = opts.maxDocs ?? 12;
  const charsPerDoc = opts.charsPerDoc ?? 4000;
  const maxTotalChars = opts.maxTotalChars ?? 88000;
  const includeFragments = opts.includeFragments !== false;
  const maxCompactChars = opts.maxCompactChars ?? (includeFragments ? 200000 : 6000);

  const scored = scoreEntriesForQuestion(question, manifest);
  let picks = scored.filter((x) => x.score > 0).slice(0, maxDocs).map((x) => x.entry);
  if (picks.length === 0) picks = manifest.entries.slice(0, Math.min(maxDocs, manifest.entries.length));

  let compactList = "";
  for (const e of manifest.entries) {
    const pv = e.preview.length > 180 ? `${e.preview.slice(0, 180)}…` : e.preview;
    const line = `- \`${e.path}\`: **${e.title}** — ${pv}\n`;
    if (compactList.length + line.length > maxCompactChars) {
      compactList += `\n… *[documentenlijst ingekort voor contextlimiet: ${manifest.entries.length} documenten totaal]*\n`;
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
    for (const e of picks.slice(0, 12)) {
      const headings = e.headings.slice(0, 5).join(" · ");
      hints += `- \`${e.path}\` — **${e.title}**${headings ? ` — koppen: ${headings}` : ""}\n`;
    }
    const blob =
      `## Gebruikersvraag (corpus / second brain)\n\n${question}\n\n---\n\n` +
      `## Alle bekende documenten (compact)\n\n${compactList}\n\n---\n\n` +
      `## Mogelijk relevante documenten (alleen koppen — niet de volledige inhoud)\n\n${hints || "(geen)"}\n\n---\n\n` +
      `### Werkwijze\n\n` +
      `1. Gebruik **Alle bekende documenten** als compacte routekaart en start met de meest relevante hints.\n` +
      `2. Gebruik de tool **read_corpus_markdown** om **de volledige inhoud** van elk relevant bestand op te halen voordat je details, citaten of feiten geeft.\n` +
      `3. Als de vraag vraagt om een overzicht, inventarisatie, vergelijking of "alles"/"hele corpus", lees dan meerdere relevante bestanden in rondes totdat je de corpus voldoende hebt afgedekt.\n` +
      `4. Als je genoeg hebt gelezen, antwoord dan **uitsluitend** met JSON: \`{"reply":"…"}\` (Nederlands).\n\n` +
      `*Baseer feiten alleen op gelezen bestandsinhoud of op bovenstaande routekaart; verzin niets bij.*`;

    const pickedPaths = picks.map((e) => e.path);
    return { markdownBlob: blob, pickedPaths };
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
    `## Alle bekende documenten (compact)\n\n${compactList}\n\n---\n\n` +
    `## CORPUS_OVERVIEW (fragment)\n\n${overviewExcerpt || "(geen overzichtsbestand)"}\n\n---\n\n` +
    `## Fragmenten uit de meest relevante documenten\n` +
    fragments +
    `\n\n---\n\n*Gebruik alleen informatie uit bovenstaande index en fragmenten. Verwijs waar mogelijk naar bronnen als \`pad/bestand.md\`.*`;

  return { markdownBlob: blob, pickedPaths };
}
