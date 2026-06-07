import TurndownService from "turndown";
import { highlightedCodeBlock, strikethrough, taskListItems } from "turndown-plugin-gfm";

let td: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!td) {
    td = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
    });
    // GFM pipe-tables from turndown-plugin-gfm break on cells with block markup or line breaks.
    // Keep <table> as HTML so Markdown round-trips safely (marked renders inline HTML).
    td.use(highlightedCodeBlock);
    td.use(strikethrough);
    td.use(taskListItems);
    td.addRule("markdownTables", {
      filter: "table",
      replacement(_content, node) {
        return `\n\n${htmlTableToMarkdown(node as HTMLTableElement)}\n\n`;
      },
    });
    td.addRule("confluenceMacroPlaceholder", {
      filter(node) {
        return (
          node.nodeName === "DIV" &&
          node instanceof HTMLElement &&
          node.classList.contains("mv-confluence-macro") &&
          node.hasAttribute("data-confluence-macro-b64")
        );
      },
      replacement(_content, node) {
        const el = node as HTMLElement;
        return `\n\n${el.outerHTML}\n\n`;
      },
    });
    td.addRule("mermaidWrap", {
      filter(node) {
        return (
          node.nodeName === "DIV" &&
          node instanceof HTMLElement &&
          node.classList.contains("mv-mermaid-wrap") &&
          node.hasAttribute("data-mv-mermaid-source")
        );
      },
      replacement(_content, node) {
        const el = node as HTMLElement;
        const raw = el.getAttribute("data-mv-mermaid-source");
        if (!raw) return "\n\n";
        try {
          const source = decodeURIComponent(raw);
          return `\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n`;
        } catch {
          return "\n\n";
        }
      },
    });
    td.addRule("chartJsWrap", {
      filter(node) {
        return (
          node.nodeName === "DIV" &&
          node instanceof HTMLElement &&
          node.classList.contains("mv-chartjs-wrap") &&
          node.hasAttribute("data-mv-chartjs-source")
        );
      },
      replacement(_content, node) {
        const el = node as HTMLElement;
        const raw = el.getAttribute("data-mv-chartjs-source");
        if (!raw) return "\n\n";
        try {
          const source = decodeURIComponent(raw);
          return `\n\n\`\`\`chartjs\n${source}\n\`\`\`\n\n`;
        } catch {
          return "\n\n";
        }
      },
    });
  }
  return td;
}

/**
 * Zet door de viewer gerenderde diagram-/grafiekwrappers terug naar pre/code voordat Turndown draait.
 * Zo gebruiken we de betrouwbare fencedCodeBlock-regel; anders kan een div met alleen canvas
 * verlies van de JSON-definitie geven bij opslaan.
 */
function unwrapDiagramWrappersForTurndown(html: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = html.trim();

  const chartSelectors = ".mv-chartjs-wrap[data-mv-chartjs-source]";
  holder.querySelectorAll(chartSelectors).forEach((el) => {
    const raw = el.getAttribute("data-mv-chartjs-source");
    if (!raw) return;
    try {
      const source = decodeURIComponent(raw);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-chartjs";
      code.textContent = source;
      pre.append(code);
      el.replaceWith(pre);
    } catch {
      /* onbruikbaar attribuut */
    }
  });

  holder.querySelectorAll(".mv-mermaid-wrap[data-mv-mermaid-source]").forEach((el) => {
    const raw = el.getAttribute("data-mv-mermaid-source");
    if (!raw) return;
    try {
      const source = decodeURIComponent(raw);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = source;
      pre.append(code);
      el.replaceWith(pre);
    } catch {
      /* */
    }
  });

  return holder.innerHTML;
}

export function htmlFragmentToMarkdown(html: string): string {
  const service = getTurndown();
  const normalized = unwrapDiagramWrappersForTurndown(html);
  const out = service.turndown(normalized).replace(/\u00a0/g, " ").trim();
  return out;
}

export function markdownHtmlTablesToMarkdown(markdown: string): string {
  return markdown.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = tableHtml.trim();
    const table = tpl.content.querySelector("table");
    if (!(table instanceof HTMLTableElement)) return tableHtml;
    return `\n\n${htmlTableToMarkdown(table)}\n\n`;
  });
}

function inlineMarkdownFromHtml(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  const service = getTurndown();
  return service
    .turndown(tpl.innerHTML)
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function htmlTableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  const matrix = rows.map((tr) =>
    Array.from(tr.children)
      .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
      .map((cell) => escapeTableCell(inlineMarkdownFromHtml(cell.innerHTML))),
  );
  if (matrix.length === 0) return "";
  const maxCols = Math.max(...matrix.map((row) => row.length), 1);
  const normalized = matrix.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
  const firstRowHasHeader = rows[0]?.querySelector("th") !== null;
  const header = firstRowHasHeader ? normalized[0] : normalized[0].map((_, idx) => (idx === 0 ? " " : `Kolom ${idx + 1}`));
  const body = firstRowHasHeader ? normalized.slice(1) : normalized;
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}
