import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "Files");

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function inlineMd(html) {
  return decodeHtml(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(p|div|span)[^>]*>/gi, " ")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function tableToMd(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rows.length === 0) return tableHtml;
  const matrix = rows.map((row) =>
    [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => inlineMd(m[1])),
  );
  const maxCols = Math.max(...matrix.map((row) => row.length), 1);
  const normalized = matrix.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push("");
    return padded;
  });
  const firstRowHasHeader = /<th[\s>]/i.test(rows[0]);
  const header = firstRowHasHeader ? normalized[0] : normalized[0].map((_, i) => (i === 0 ? " " : `Kolom ${i + 1}`));
  const body = firstRowHasHeader ? normalized.slice(1) : normalized;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function convertMarkdown(content) {
  return content.replace(/<table[\s\S]*?<\/table>/gi, (table) => `\n\n${tableToMd(table)}\n\n`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const before = fs.readFileSync(full, "utf8");
    const after = convertMarkdown(before);
    if (after !== before) {
      fs.writeFileSync(full, after, "utf8");
      console.log(`converted ${path.relative(root, full)}`);
    }
  }
}

walk(root);
