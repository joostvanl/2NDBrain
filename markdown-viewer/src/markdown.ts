import { marked } from "marked";
import DOMPurify from "dompurify";

export type TocEntry = { depth: number; text: string; id: string };

/**
 * TOC-weergavetekst zonder automatische nummerlijst noch Word-achtige kopnummers
 * zoals `1.` / `3.14.` / `5)` aan het begin (ankers blijven op volledige titeltekst gebaseerd).
 */
export function tocDisplayLabel(headingText: string): string {
  const s = headingText.trim();
  const mDot = s.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/u);
  if (mDot?.[2]) {
    const prefix = mDot[1];
    if (/^(?:19|20)\d{2}$/.test(prefix)) return s;
    const rest = mDot[2].trim();
    if (rest.length > 0) return rest;
  }
  const mPar = s.match(/^(\d+(?:\.\d+)*)\)\s+(.+)$/u);
  if (mPar?.[2]) {
    const rest = mPar[2].trim();
    if (rest.length > 0) return rest;
  }
  return s;
}
function slugify(text: string, used: Map<string, number>) {
  const base =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sectie";
  const n = used.get(base) ?? 0;
  const id = n === 0 ? base : `${base}-${n}`;
  used.set(base, n + 1);
  return id;
}

export function buildToc(markdown: string): TocEntry[] {
  const tokens = marked.lexer(markdown);
  const used = new Map<string, number>();
  const out: TocEntry[] = [];
  for (const t of tokens) {
    if (t.type === "heading" && t.depth >= 1 && t.depth <= 6) {
      const text = t.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const id = slugify(text, used);
      out.push({ depth: t.depth, text, id });
    }
  }
  return out;
}

export function renderMarkdown(markdown: string): { html: string; toc: TocEntry[] } {
  const toc = buildToc(markdown);
  marked.setOptions({ gfm: true, breaks: false });
  const raw = marked.parse(markdown, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  const tpl = document.createElement("template");
  tpl.innerHTML = clean.trim();
  const headings = tpl.content.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let i = 0;
  headings.forEach((el) => {
    const entry = toc[i++];
    if (entry) el.setAttribute("id", entry.id);
  });
  return { html: tpl.innerHTML, toc };
}

export function firstHeadingText(markdown: string): string | null {
  const tokens = marked.lexer(markdown);
  for (const t of tokens) {
    if (t.type === "heading" && t.depth === 1) {
      return t.text.replace(/\s+/g, " ").trim() || null;
    }
  }
  return null;
}
