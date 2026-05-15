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
  }
  return td;
}

export function htmlFragmentToMarkdown(html: string): string {
  const service = getTurndown();
  const out = service.turndown(html).replace(/\u00a0/g, " ").trim();
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
