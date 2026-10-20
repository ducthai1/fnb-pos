import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readXlsxSheet } from "./read-xlsx-sheet";
import { columnIndexOf, columnLetters } from "./sheet-cell-ref";
import { writeXlsxSheet } from "./write-xlsx-sheet";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), "src/test-support/fixtures", name)));

const rowsOf = (bytes: Uint8Array) => {
  const read = readXlsxSheet(bytes);
  if (!read.ok) throw new Error(`unreadable: ${read.reason}`);
  return read.rows;
};

describe("reading an .xlsx sheet", () => {
  it("reads a products export with shared strings and number cells, as the sheet shows it", () => {
    const rows = rowsOf(fixture("products-export-24-columns.xlsx"));
    expect(rows).toHaveLength(11);
    expect(rows[0]).toHaveLength(24);
    expect(rows[0]?.[1]).toBe("Tên hàng hóa");
    expect(rows[1]?.slice(0, 3)).toEqual(["SP000011", "Áo khoác nữ - M", ""]);
    expect(rows[1]?.[7]).toBe("499000");
    // A blank cell between filled ones stays in its column.
    expect(rows[4]?.[12]).toBe("");
  });

  it("gives back what was written: text with markup, a formula-looking name, numbers, wide rows", () => {
    const wide = Array.from({ length: 30 }, (_, at) => (at % 2 === 0 ? `c${at}` : null));
    const written = [
      ["Tên", "Giá", null, "Ghi chú"],
      ['Cà phê <sữa> & "đá"', 25_000, null, "  hai  dấu cách  "],
      ["=1+1", 0, null, "Bánh mì\u0007"],
      wide,
    ];
    const rows = rowsOf(writeXlsxSheet("Thực đơn", written));
    expect(rows[0]).toEqual(["Tên", "Giá", "", "Ghi chú"]);
    expect(rows[1]).toEqual(['Cà phê <sữa> & "đá"', "25000", "", "  hai  dấu cách  "]);
    // The control character cannot travel in XML and is dropped; the name stays a name.
    expect(rows[2]).toEqual(["=1+1", "0", "", "Bánh mì"]);
    expect(rows[3]?.[28]).toBe("c28");
    expect(rows[3]).toHaveLength(29);
  });

  it("finds the first sheet through the workbook, not by file name", () => {
    const sheet = (text: string) =>
      strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          `<row r="2"><c r="B2" t="inlineStr"><is><t>${text}</t></is></c></row></sheetData></worksheet>`,
      );
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          '<sheets><sheet name="Menu" sheetId="2" r:id="rId9"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId9" Type="worksheet" Target="/xl/worksheets/menu.xml"/></Relationships>',
      ),
      "xl/worksheets/a-first.xml": sheet("wrong"),
      "xl/worksheets/menu.xml": sheet("right"),
    });
    expect(rowsOf(bytes)).toEqual([[], ["", "right"]]);
  });

  it("refuses what is not a workbook", () => {
    expect(readXlsxSheet(strToU8("Tên,Giá\nCà phê,25000"))).toEqual({
      ok: false,
      reason: "not_xlsx",
    });
    expect(readXlsxSheet(zipSync({ "word/document.xml": strToU8("<w/>") }))).toEqual({
      ok: false,
      reason: "not_xlsx",
    });
  });

  it("refuses a sheet past the row limit instead of filling memory", () => {
    const far = zipSync({
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="900000"><c r="A900000"><v>1</v></c></row></sheetData></worksheet>',
      ),
    });
    expect(readXlsxSheet(far)).toEqual({ ok: false, reason: "too_big" });
  });
});

describe("cell references", () => {
  it("turn column letters into indexes and back", () => {
    expect(columnIndexOf("A1")).toBe(0);
    expect(columnIndexOf("X11")).toBe(23);
    expect(columnIndexOf("AB7")).toBe(27);
    expect(columnIndexOf("1A")).toBeNull();
    for (const index of [0, 25, 26, 27, 701, 702])
      expect(columnIndexOf(columnLetters(index))).toBe(index);
    expect(columnLetters(701)).toBe("ZZ");
  });
});
