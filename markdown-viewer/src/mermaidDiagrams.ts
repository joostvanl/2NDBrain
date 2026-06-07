import type { Mermaid } from "mermaid";
import { inheritAgentDiffMarkersFromFencePre } from "./reviewChangeDom";

let initialized = false;
let mermaidApi: Mermaid | null = null;

async function getMermaid(): Promise<Mermaid> {
  if (!mermaidApi) {
    mermaidApi = (await import("mermaid")).default;
  }
  return mermaidApi;
}

async function ensureMermaidInitialized(mermaid: Mermaid): Promise<void> {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    fontFamily: "inherit",
  });
  initialized = true;
}

function isMermaidFenceCode(code: Element): boolean {
  return (
    code.tagName === "CODE" &&
    (code.classList.contains("language-mermaid") || code.classList.contains("lang-mermaid"))
  );
}

/**
 * Vervangt `pre > code.language-mermaid` door een wrapper met bron in `data-mv-mermaid-source`
 * (voor Markdown-export) en een inner `div.mermaid` voor mermaid.run.
 */
function transformMermaidCodeBlocks(root: ParentNode): HTMLElement[] {
  const pending: HTMLElement[] = [];
  const codes = Array.from(root.querySelectorAll("pre > code")).filter(isMermaidFenceCode);

  for (const code of codes) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;
    if (pre.closest(".mv-mermaid-wrap")) continue;

    const source = code.textContent ?? "";
    const wrap = document.createElement("div");
    wrap.className = "mv-mermaid-wrap";

    try {
      wrap.setAttribute("data-mv-mermaid-source", encodeURIComponent(source));
    } catch {
      continue;
    }

    const inner = document.createElement("div");
    inner.className = "mermaid";
    inner.textContent = source;

    wrap.append(inner);
    inheritAgentDiffMarkersFromFencePre(pre, wrap);
    pre.replaceWith(wrap);
    pending.push(inner);
  }

  return pending;
}

/** Na het zetten van gerenderde Markdown-HTML in de DOM: teken Mermaid-diagrammen. */
export async function runMermaidInRoot(root: ParentNode): Promise<void> {
  const nodes = transformMermaidCodeBlocks(root);
  if (nodes.length === 0) return;
  try {
    const mermaid = await getMermaid();
    await ensureMermaidInitialized(mermaid);
    await mermaid.run({ nodes, suppressErrors: true });
  } catch {
    /* suppressErrors vangt diagramfouten; dit is voor onverwachte API-fouten */
  }
}
