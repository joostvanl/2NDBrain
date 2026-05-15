export type VisualSheetSplit = "h1" | "h2" | "both";

function isWhitespaceText(node: ChildNode): boolean {
  return (
    node.nodeType === Node.TEXT_NODE && !(node.textContent && node.textContent.trim().length > 0)
  );
}

function isSplitHeading(node: ChildNode, split: VisualSheetSplit): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (node as Element).tagName;
  if (split === "h1") return tag === "H1";
  if (split === "h2") return tag === "H2";
  return tag === "H1" || tag === "H2";
}

/**
 * Markdown `---` wordt vaak tussen hoofdstukken gezet maar blijft dan onderaan een visueel
 * “pagina-blok”; dat geeft een extra lijn boven het grijs. Strip alleen waar nog een sheet volgt.
 */
function stripTrailingHrFromSheetEnd(sheet: DocumentFragment): void {
  while (sheet.lastChild) {
    while (sheet.lastChild && isWhitespaceText(sheet.lastChild)) {
      sheet.removeChild(sheet.lastChild);
    }
    const last = sheet.lastChild;
    if (
      last &&
      last.nodeType === Node.ELEMENT_NODE &&
      (last as Element).tagName === "HR"
    ) {
      sheet.removeChild(last);
      continue;
    }
    break;
  }
}

/** Split rendered markdown (sanitized HTML) into fragments: nieuw blad voor elke H1/H2 volgens split. */
export function buildProseSheets(html: string, split: VisualSheetSplit): DocumentFragment[] {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const nodes = Array.from(tpl.content.childNodes);

  const sheets: DocumentFragment[] = [];
  let cur = document.createDocumentFragment();

  const flush = (): void => {
    if (cur.childNodes.length === 0) return;
    sheets.push(cur);
    cur = document.createDocumentFragment();
  };

  for (const node of nodes) {
    if (isWhitespaceText(node)) continue;

    if (isSplitHeading(node, split) && cur.childNodes.length > 0) {
      flush();
    }
    cur.appendChild(node);
  }

  if (cur.childNodes.length > 0) {
    sheets.push(cur);
  }

  for (let i = 0; i < sheets.length - 1; i++) {
    stripTrailingHrFromSheetEnd(sheets[i]);
  }

  return sheets.length > 0 ? sheets : [document.createDocumentFragment()];
}
