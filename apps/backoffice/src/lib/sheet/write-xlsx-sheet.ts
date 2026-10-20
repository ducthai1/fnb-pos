import { strToU8, zipSync } from "fflate";
import { columnLetters } from "./sheet-cell-ref";

export type SheetCell = string | number | null;

// Characters XML 1.0 cannot carry at all; a name pasted with one would make the file unreadable.
// eslint-disable-next-line no-control-regex
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const escaped = (text: string) =>
  text
    .replace(NOT_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DOC_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";

const CONTENT_TYPES =
  `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

const ROOT_RELS =
  `${HEAD}<Relationships xmlns="${PKG_RELS}">` +
  `<Relationship Id="rId1" Type="${DOC_RELS}/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

const WORKBOOK_RELS =
  `${HEAD}<Relationships xmlns="${PKG_RELS}">` +
  `<Relationship Id="rId1" Type="${DOC_RELS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  "</Relationships>";

const workbook = (sheetName: string) =>
  `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${DOC_RELS}"><sheets>` +
  `<sheet name="${escaped(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

function cellXml(value: SheetCell, ref: string): string {
  if (value === null || value === "") return "";
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaped(value)}</t></is></c>`;
}

const sheet = (rows: readonly (readonly SheetCell[])[]) =>
  `${HEAD}<worksheet xmlns="${MAIN}"><sheetData>` +
  rows
    .map((row, at) => {
      const cells = row.map((value, column) => cellXml(value, `${columnLetters(column)}${at + 1}`));
      return `<row r="${at + 1}">${cells.join("")}</row>`;
    })
    .join("") +
  "</sheetData></worksheet>";

/**
 * A one-sheet .xlsx file. Text goes in as inline strings, never as formulas, so a name that
 * starts with "=" stays a name in any spreadsheet that opens it.
 */
export function writeXlsxSheet(sheetName: string, rows: readonly (readonly SheetCell[])[]): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8(workbook(sheetName)),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/worksheets/sheet1.xml": strToU8(sheet(rows)),
  });
}
