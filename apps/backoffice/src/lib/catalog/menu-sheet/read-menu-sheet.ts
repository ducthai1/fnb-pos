import { VI_MENU_SHEET_COLUMNS } from "../../../messages/vi-menu-sheet";
import type { SheetRows } from "../../sheet/read-xlsx-sheet";

/** One product line of a products sheet, its cells as typed. */
export interface MenuSheetRow {
  /** The row number the spreadsheet shows, so a person finds the line to fix. */
  readonly line: number;
  readonly code: string;
  readonly name: string;
  readonly group: string;
  readonly price: string;
  readonly vat: string;
  readonly notForSale: boolean;
}

export type MenuSheetRead =
  | { readonly ok: true; readonly rows: readonly MenuSheetRow[]; readonly ignored: readonly string[] }
  | { readonly ok: false; readonly reason: "no_name_column" | "no_rows" };

type Field = "code" | "name" | "group" | "price" | "vat" | "notForSale";

/** A header as a key: no tone marks, no case, no spaces or punctuation. */
export const headerKey = (header: string): string =>
  header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

const ALIASES: Readonly<Record<Field, readonly string[]>> = {
  code: ["Mã hàng hóa", "Mã hàng"],
  name: ["Tên hàng hóa", "Tên hàng"],
  group: ["Tên nhóm", "Nhóm hàng"],
  price: ["Giá bán"],
  vat: ["VAT", "Thuế VAT (%)"],
  notForSale: ["Không cho phép bán?"],
};
const FIELD_OF = new Map<string, Field>(
  Object.entries(ALIASES).flatMap(([field, names]) => names.map((name) => [headerKey(name), field as Field])),
);
const HEADER_SEARCH_ROWS = 10;
/** Values that say nothing in a column the menu does not use: blanks, and the zero of a flag. */
const SAYS_NOTHING = new Set(["", "0"]);
const YES = new Set(["1", "true", "x", "co", "yes"]);

const cellOf = (row: readonly string[], column: number | undefined) =>
  column === undefined ? "" : (row[column] ?? "").trim();

/**
 * The product lines of a sheet: the header row is the first with a name column (some
 * exports put a title above it), blank lines are dropped, and every other column that
 * holds something is named in `ignored`, so the person knows what does not come across.
 */
export function readMenuSheet(rows: SheetRows): MenuSheetRead {
  const headerAt = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some((cell) => FIELD_OF.get(headerKey(cell)) === "name"));
  const header = rows[headerAt];
  if (headerAt < 0 || header === undefined) return { ok: false, reason: "no_name_column" };

  const columns = new Map<Field, number>();
  const unused: { readonly column: number; readonly title: string }[] = [];
  header.forEach((title, column) => {
    const field = FIELD_OF.get(headerKey(title));
    if (field === undefined) {
      if (title.trim() !== "") unused.push({ column, title: title.trim() });
    } else if (!columns.has(field)) columns.set(field, column);
  });

  const body = rows.slice(headerAt + 1);
  const lines: MenuSheetRow[] = [];
  body.forEach((row, at) => {
    if (row.every((cell) => cell.trim() === "")) return;
    const cell = (field: Field) => cellOf(row, columns.get(field));
    lines.push({
      line: headerAt + at + 2,
      code: cell("code"),
      name: cell("name"),
      group: cell("group"),
      price: cell("price"),
      vat: cell("vat"),
      notForSale: YES.has(headerKey(cell("notForSale"))),
    });
  });
  if (lines.length === 0) return { ok: false, reason: "no_rows" };
  const ignored = unused
    .filter(({ column }) => body.some((row) => !SAYS_NOTHING.has(cellOf(row, column))))
    .map(({ title }) => title);
  return { ok: true, rows: lines, ignored };
}

/** The header row of an exported sheet: the same columns, in the same order. */
export const MENU_SHEET_HEADER: readonly string[] = VI_MENU_SHEET_COLUMNS;
