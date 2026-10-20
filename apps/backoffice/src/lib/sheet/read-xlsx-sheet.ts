import { strFromU8, unzipSync } from "fflate";
import { columnIndexOf } from "./sheet-cell-ref";

/** The first sheet of a workbook as text cells, row by row, blanks as "". */
export type SheetRows = readonly (readonly string[])[];

export type SheetRead =
  | { readonly ok: true; readonly rows: SheetRows }
  | { readonly ok: false; readonly reason: "not_xlsx" | "too_big" };

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** Past these a menu is not what the file holds; refusing keeps a zip bomb out of the tab. */
const MAX_PART_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 200;
const PARTS = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;

const xmlOf = (text: string): Document | null => {
  const document = new DOMParser().parseFromString(text, "application/xml");
  return document.getElementsByTagName("parsererror").length > 0 ? null : document;
};

const childrenNamed = (parent: Element | Document, name: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS(MAIN, name));

/** The text of a string item: its runs joined, without the phonetic guide runs. */
function itemText(item: Element): string {
  return childrenNamed(item, "t")
    .filter((t) => t.parentElement?.localName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("");
}

/** Where the first sheet of the workbook lives, through its relationship id. */
function firstSheetPath(parts: Record<string, Uint8Array>): string | null {
  const workbook = parts["xl/workbook.xml"];
  const rels = parts["xl/_rels/workbook.xml.rels"];
  const sheets = Object.keys(parts).filter((name) => name.startsWith("xl/worksheets/")).sort();
  if (workbook === undefined || rels === undefined) return sheets[0] ?? null;
  const first = xmlOf(strFromU8(workbook))?.getElementsByTagNameNS(MAIN, "sheet")[0];
  const relId = first?.getAttributeNS(RELS, "id");
  const relations = xmlOf(strFromU8(rels))?.getElementsByTagName("Relationship") ?? [];
  const target = Array.from(relations)
    .find((relation) => relation.getAttribute("Id") === relId)
    ?.getAttribute("Target");
  if (target === null || target === undefined) return sheets[0] ?? null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function cellText(cell: Element, shared: readonly string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    const item = childrenNamed(cell, "is")[0];
    return item === undefined ? "" : itemText(item);
  }
  const value = childrenNamed(cell, "v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(value)] ?? "";
  return value;
}

function sheetRows(sheet: Document, shared: readonly string[]): string[][] | null {
  const rows: string[][] = [];
  for (const row of childrenNamed(sheet, "row")) {
    const at = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
    if (!Number.isSafeInteger(at) || at < 0 || at >= MAX_ROWS) return null;
    const cells: string[] = [];
    for (const cell of childrenNamed(row, "c")) {
      const ref = cell.getAttribute("r");
      const column = ref === null ? cells.length : columnIndexOf(ref);
      if (column === null || column >= MAX_COLUMNS) return null;
      while (cells.length < column) cells.push("");
      cells[column] = cellText(cell, shared);
    }
    while (rows.length < at) rows.push([]);
    rows[at] = cells;
  }
  while (rows.length > 0 && (rows[rows.length - 1] ?? []).every((cell) => cell.trim() === "")) {
    rows.pop();
  }
  return rows;
}

/**
 * Reads the first sheet of an .xlsx file. Only the four parts that hold cells are inflated,
 * each up to a size a menu never reaches; formulas give their last computed value.
 */
export function readXlsxSheet(bytes: Uint8Array): SheetRead {
  let parts: Record<string, Uint8Array>;
  let tooBig = false;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        if (!PARTS.test(file.name)) return false;
        if (file.originalSize > MAX_PART_BYTES) tooBig = true;
        return !tooBig;
      },
    });
  } catch {
    return { ok: false, reason: "not_xlsx" };
  }
  if (tooBig) return { ok: false, reason: "too_big" };
  const path = firstSheetPath(parts);
  const sheetBytes = path === null ? undefined : parts[path];
  const sheet = sheetBytes === undefined ? null : xmlOf(strFromU8(sheetBytes));
  if (sheet === null) return { ok: false, reason: "not_xlsx" };
  const sharedBytes = parts["xl/sharedStrings.xml"];
  const sharedXml = sharedBytes === undefined ? null : xmlOf(strFromU8(sharedBytes));
  const shared = sharedXml === null ? [] : childrenNamed(sharedXml, "si").map(itemText);
  const rows = sheetRows(sheet, shared);
  return rows === null ? { ok: false, reason: "too_big" } : { ok: true, rows };
}
