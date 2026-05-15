/** Review-/commentaarlagen op tekst: anker via quote + prefix/suffix, highlights als <span> (niet in .md). */

export type ReviewReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewComment = {
  id: string;
  /** Wie het eerste commentaar plaatste (naam / rol / entiteit). */
  author: string;
  body: string;
  quote: string;
  prefix: string;
  suffix: string;
  createdAt: string;
  updatedAt: string;
  /** Antwoorden in chronologische volgorde — vormt een thread zodra er 2+ berichten zijn. */
  replies: ReviewReply[];
};

export const REVIEW_HIGHLIGHT_CLASS = "mv-review-highlight";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function normalizeReviewReply(raw: unknown): ReviewReply | null {
  if (!isRecord(raw)) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    author: typeof raw.author === "string" ? raw.author : "",
    body: typeof raw.body === "string" ? raw.body : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeReviewComment(raw: unknown): ReviewComment | null {
  if (!isRecord(raw)) return null;
  const repliesRaw = raw.replies;
  const replies: ReviewReply[] = Array.isArray(repliesRaw)
    ? repliesRaw.map(normalizeReviewReply).filter((x): x is ReviewReply => x !== null)
    : [];
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    author: typeof raw.author === "string" ? raw.author : "",
    body: typeof raw.body === "string" ? raw.body : "",
    quote: typeof raw.quote === "string" ? raw.quote : "",
    prefix: typeof raw.prefix === "string" ? raw.prefix : "",
    suffix: typeof raw.suffix === "string" ? raw.suffix : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    replies,
  };
}

export function normalizeReviewCommentsList(raw: unknown): ReviewComment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeReviewComment).filter((x): x is ReviewComment => x !== null);
}

export function newReviewReply(author: string, body: string): ReviewReply {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    author: author.trim(),
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export function newReviewComment(
  quote: string,
  prefix: string,
  suffix: string,
  body: string,
  author: string,
): ReviewComment {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    author: author.trim(),
    body,
    quote,
    prefix,
    suffix,
    createdAt: now,
    updatedAt: now,
    replies: [],
  };
}

export function threadMessageCount(c: ReviewComment): number {
  return 1 + c.replies.length;
}

/** Herkenning van een door de agent geplaatste reply (Akkoord / Niet akkoord in de viewer). */
export function isAgentReviewAuthor(author: string): boolean {
  const t = author.trim();
  if (!t) return false;
  return /\bagent\b/i.test(t);
}

/** Laatste bericht in de thread is een agent-reply (chronologische `replies`). */
export function lastReplyIsFromAgent(c: ReviewComment): boolean {
  const last = c.replies[c.replies.length - 1];
  return !!last && isAgentReviewAuthor(last.author);
}

export function findQuoteOffsets(full: string, c: ReviewComment): { start: number; end: number } | null {
  const q = c.quote;
  if (!q) return null;
  const pre = c.prefix || "";
  const suf = c.suffix || "";
  if (pre || suf) {
    const needle = pre + q + suf;
    const i = full.indexOf(needle);
    if (i >= 0) return { start: i + pre.length, end: i + pre.length + q.length };
  }
  const j = full.indexOf(q);
  if (j >= 0) return { start: j, end: j + q.length };
  return null;
}

export function flatOffsetToRange(root: HTMLElement, start: number, end: number): Range | null {
  if (start < 0 || end < start) return null;
  const range = document.createRange();
  let pos = 0;
  let startSet = false;
  let endSet = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const len = (n.textContent || "").length;
    if (!startSet && pos + len > start) {
      range.setStart(n, start - pos);
      startSet = true;
    }
    if (startSet && pos + len >= end) {
      range.setEnd(n, Math.min(len, end - pos));
      endSet = true;
      break;
    }
    pos += len;
  }
  if (!startSet || !endSet) return null;
  return range;
}

function createHighlightSpan(id: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = REVIEW_HIGHLIGHT_CLASS;
  span.dataset.reviewId = id;
  span.setAttribute("role", "mark");
  return span;
}

export function wrapRangeWithHighlight(root: HTMLElement, range: Range, id: string): boolean {
  if (range.collapsed) return false;
  const selectedText = range.toString();
  if (!selectedText.trim()) return false;

  const preR = document.createRange();
  try {
    preR.selectNodeContents(root);
    preR.setEnd(range.startContainer, range.startOffset);
  } catch {
    return false;
  }

  const start = preR.toString().length;
  const end = start + selectedText.length;
  const plans: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const node = n as Text;
    const len = node.data.length;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(len, end - nodeStart);
    if (localStart < localEnd) plans.push({ node, start: localStart, end: localEnd });
    pos = nodeEnd;
    if (pos >= end) break;
  }
  if (plans.length === 0) return false;

  for (const p of plans.reverse()) {
    let target = p.node;
    if (p.end < target.data.length) target.splitText(p.end);
    if (p.start > 0) target = target.splitText(p.start);
    const parent = target.parentNode;
    if (!parent) continue;
    const span = createHighlightSpan(id);
    parent.insertBefore(span, target);
    span.append(target);
  }
  return true;
}

export function stripReviewHighlights(root: HTMLElement): void {
  const sel = `[data-review-id].${REVIEW_HIGHLIGHT_CLASS}`;
  root.querySelectorAll(sel).forEach((el) => {
    const span = el as HTMLSpanElement;
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });
}

export function unwrapHighlightById(root: HTMLElement, id: string): void {
  root
    .querySelectorAll(`span.${REVIEW_HIGHLIGHT_CLASS}[data-review-id="${CSS.escape(id)}"]`)
    .forEach((span) => {
      if (!span.parentNode) return;
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    });
}

/** Zet prefix/quote/suffix bij vanuit huidige DOM (voor opslag). */
export function syncAnchorsFromDom(root: HTMLElement, comments: ReviewComment[]): void {
  for (const c of comments) {
    const spans = Array.from(
      root.querySelectorAll(
        `span.${REVIEW_HIGHLIGHT_CLASS}[data-review-id="${CSS.escape(c.id)}"]`,
      ),
    ) as HTMLElement[];
    const span = spans[0];
    const lastSpan = spans.at(-1);
    if (!span || !lastSpan) continue;
    const quoteR = document.createRange();
    quoteR.setStartBefore(span);
    quoteR.setEndAfter(lastSpan);
    c.quote = quoteR.toString();
    const preR = document.createRange();
    preR.selectNodeContents(root);
    preR.setEndBefore(span);
    const sufR = document.createRange();
    sufR.selectNodeContents(root);
    sufR.setStartAfter(lastSpan);
    c.prefix = preR.toString().slice(-80);
    c.suffix = sufR.toString().slice(0, 80);
  }
}

export function applyReviewHighlights(root: HTMLElement, comments: ReviewComment[]): void {
  stripReviewHighlights(root);
  const full = root.innerText;
  const plans: { c: ReviewComment; start: number; end: number }[] = [];
  for (const c of comments) {
    const off = findQuoteOffsets(full, c);
    if (off) plans.push({ c, start: off.start, end: off.end });
  }
  plans.sort((a, b) => b.start - a.start);
  for (const p of plans) {
    const range = flatOffsetToRange(root, p.start, p.end);
    if (range && !range.collapsed) wrapRangeWithHighlight(root, range, p.c.id);
  }
}

/** Context rond selectie voor nieuw anker */
export function anchorFromSelection(
  root: HTMLElement,
  range: Range,
): { quote: string; prefix: string; suffix: string } | null {
  const quote = range.toString();
  if (!quote.trim()) return null;
  const preR = document.createRange();
  preR.selectNodeContents(root);
  preR.setEnd(range.startContainer, range.startOffset);
  const sufR = document.createRange();
  sufR.selectNodeContents(root);
  sufR.setStart(range.endContainer, range.endOffset);
  const prefix = preR.toString().slice(-80);
  const suffix = sufR.toString().slice(0, 80);
  return { quote, prefix, suffix };
}
