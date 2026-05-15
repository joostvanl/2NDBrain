/** Helpers voor tabelbewerking in contenteditable (eenvoudige rechthoekige tabellen). */

export function getActiveTableCell(editRoot: HTMLElement | null): HTMLTableCellElement | null {
  if (!editRoot) return null;
  const sel = window.getSelection();
  if (!sel?.anchorNode) return null;
  let n: Node | null = sel.anchorNode;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
  let el = n as Element | null;
  while (el && editRoot.contains(el)) {
    if (el.tagName === "TD" || el.tagName === "TH") return el as HTMLTableCellElement;
    el = el.parentElement;
  }
  return null;
}

function rowCellTag(tr: HTMLTableRowElement): "th" | "td" {
  return tr.parentElement?.tagName === "THEAD" ? "th" : "td";
}

function buildTable(cols: number, headerRows: number, bodyRows: number): HTMLTableElement {
  const table = document.createElement("table");
  if (headerRows > 0) {
    const thead = document.createElement("thead");
    for (let r = 0; r < headerRows; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const th = document.createElement("th");
        th.innerHTML = "<br>";
        tr.append(th);
      }
      thead.append(tr);
    }
    table.append(thead);
  }
  const tbody = document.createElement("tbody");
  for (let r = 0; r < bodyRows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      td.innerHTML = "<br>";
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

function placeCaretInCell(cell: Element | null) {
  if (!cell) return;
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function insertTableAtSelection(
  editRoot: HTMLElement,
  opts: { cols: number; headerRows: number; bodyRows: number },
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editRoot.contains(range.commonAncestorContainer)) return false;

  const table = buildTable(opts.cols, opts.headerRows, opts.bodyRows);
  range.deleteContents();
  range.insertNode(table);

  const after = document.createElement("p");
  after.innerHTML = "<br>";
  table.insertAdjacentElement("afterend", after);

  const first = table.querySelector("th, td");
  placeCaretInCell(first);
  return true;
}

function tableRowCount(table: HTMLTableElement): number {
  return table.querySelectorAll("tr").length;
}

export function addTableRowAbove(cell: HTMLTableCellElement): void {
  const tr = cell.closest("tr");
  const table = cell.closest("table");
  if (!tr || !table) return;
  const tag = rowCellTag(tr);
  const n = tr.cells.length;
  const newTr = document.createElement("tr");
  for (let i = 0; i < n; i++) {
    const c = document.createElement(tag);
    c.innerHTML = "<br>";
    newTr.append(c);
  }
  tr.insertAdjacentElement("beforebegin", newTr);
  placeCaretInCell(newTr.cells[Math.min(cell.cellIndex, newTr.cells.length - 1)] ?? null);
}

export function addTableRowBelow(cell: HTMLTableCellElement): void {
  const tr = cell.closest("tr");
  const table = cell.closest("table");
  if (!tr || !table) return;
  const tag = rowCellTag(tr);
  const n = tr.cells.length;
  const newTr = document.createElement("tr");
  for (let i = 0; i < n; i++) {
    const c = document.createElement(tag);
    c.innerHTML = "<br>";
    newTr.append(c);
  }
  tr.insertAdjacentElement("afterend", newTr);
  placeCaretInCell(newTr.cells[Math.min(cell.cellIndex, newTr.cells.length - 1)] ?? null);
}

export function deleteTableRow(cell: HTMLTableCellElement): void {
  const tr = cell.closest("tr");
  const table = cell.closest("table");
  if (!tr || !table) return;
  if (tableRowCount(table) <= 1) return;
  const idx = cell.cellIndex;
  const nextFocus = tr.nextElementSibling ?? tr.previousElementSibling;
  tr.remove();
  const rowEl = nextFocus instanceof HTMLTableRowElement ? nextFocus : null;
  const fallback = rowEl?.cells[idx] ?? rowEl?.cells[rowEl.cells.length - 1] ?? null;
  placeCaretInCell(fallback);
}

export function addTableColumnLeft(cell: HTMLTableCellElement): void {
  const idx = cell.cellIndex;
  const table = cell.closest("table");
  if (!table) return;
  for (const tr of table.querySelectorAll("tr")) {
    const ref = tr.cells[idx];
    if (!ref) continue;
    const tag = ref.tagName.toLowerCase() as "th" | "td";
    const nu = document.createElement(tag);
    nu.innerHTML = "<br>";
    ref.insertAdjacentElement("beforebegin", nu);
  }
  const row = cell.closest("tr");
  placeCaretInCell(row?.cells[idx] ?? null);
}

export function addTableColumnRight(cell: HTMLTableCellElement): void {
  const idx = cell.cellIndex;
  const table = cell.closest("table");
  if (!table) return;
  for (const tr of table.querySelectorAll("tr")) {
    const ref = tr.cells[idx];
    if (!ref) continue;
    const tag = ref.tagName.toLowerCase() as "th" | "td";
    const nu = document.createElement(tag);
    nu.innerHTML = "<br>";
    ref.insertAdjacentElement("afterend", nu);
  }
  const row = cell.closest("tr");
  placeCaretInCell(row?.cells[idx + 1] ?? null);
}

export function deleteTableColumn(cell: HTMLTableCellElement): void {
  const idx = cell.cellIndex;
  const table = cell.closest("table");
  if (!table) return;
  if (!table.rows[0] || table.rows[0].cells.length <= 1) return;
  const anchorRow = cell.closest("tr");
  for (const tr of table.querySelectorAll("tr")) {
    const c = tr.cells[idx];
    if (c) c.remove();
  }
  const row =
    anchorRow && table.contains(anchorRow)
      ? anchorRow
      : (table.rows[0] as HTMLTableRowElement);
  if (!row.cells.length) return;
  const focusIdx = Math.min(idx, row.cells.length - 1);
  placeCaretInCell(row.cells[focusIdx] ?? null);
}

export function deleteTable(cell: HTMLTableCellElement): void {
  const table = cell.closest("table");
  if (!table?.parentNode) return;
  const p = document.createElement("p");
  p.innerHTML = "<br>";
  table.insertAdjacentElement("afterend", p);
  table.remove();
  placeCaretInCell(p);
}

export function focusAdjacentTableCell(
  cell: HTMLTableCellElement,
  delta: number,
): boolean {
  if (delta !== 1 && delta !== -1) return false;
  const table = cell.closest("table");
  if (!table) return false;
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return false;
  const numCols = rows[0]!.cells.length;
  if (numCols === 0) return false;
  const tr = cell.closest("tr");
  if (!tr) return false;
  const ri = rows.indexOf(tr);
  if (ri < 0) return false;
  const ci = cell.cellIndex;
  const next = ri * numCols + ci + delta;
  const total = rows.length * numCols;
  if (next < 0 || next >= total) return false;
  const newRi = Math.floor(next / numCols);
  const newCi = next % numCols;
  const target = rows[newRi]?.cells[newCi];
  if (!target) return false;
  placeCaretInCell(target);
  return true;
}
