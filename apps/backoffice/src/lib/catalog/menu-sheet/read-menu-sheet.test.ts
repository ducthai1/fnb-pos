import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Category, ProductSummary } from "../../api/catalog-api";
import { readXlsxSheet } from "../../sheet/read-xlsx-sheet";
import { writeXlsxSheet } from "../../sheet/write-xlsx-sheet";
import { menuSheetRows } from "./menu-sheet-export";
import { MENU_SHEET_HEADER, readMenuSheet } from "./read-menu-sheet";

const sheetOf = (bytes: Uint8Array) => {
  const read = readXlsxSheet(bytes);
  if (!read.ok) throw new Error(read.reason);
  return read.rows;
};

describe("reading a products sheet", () => {
  it("gives the ten lines of a products export with their codes, names and prices", () => {
    const bytes = readFileSync(resolve(process.cwd(), "src/test-support/fixtures/products-export-24-columns.xlsx"));
    const read = readMenuSheet(sheetOf(new Uint8Array(bytes)));
    if (!read.ok) throw new Error(read.reason);
    expect(read.rows).toHaveLength(10);
    expect(read.rows.map((row) => [row.line, row.code, row.name, row.price])).toEqual([
      [2, "SP000011", "Áo khoác nữ - M", "499000"],
      [3, "SP000010", "Áo khoác nữ - S", "499000"],
      [4, "SP000008", "Túi xách mini", "249000"],
      [5, "SP000007", "Dép quai ngang", "89000"],
      [6, "SP000006", "Giày sandal nữ", "279000"],
      [7, "SP000005", "Giày sneaker unisex", "599000"],
      [8, "SP000004", "Váy midi nữ", "389000"],
      [9, "SP000003", "Áo sơ mi nữ", "329000"],
      [10, "SP000002", "Quần jean nam slim", "449000"],
      [11, "SP000001", "Áo thun nam basic", "199000"],
    ]);
    expect(read.rows.every((row) => row.group === "" && row.vat === "" && !row.notForSale)).toBe(true);
    // Columns with something in them that the menu has no place for; zero flags say nothing.
    expect(read.ignored).toEqual([
      "Giá trị quy đổi",
      "Giá vốn",
      "Tồn kho",
      "Hình ảnh",
      "Định mức tồn nhỏ nhất",
      "Định mức tồn lớn nhất",
      "Loại hàng",
    ]);
  });

  it("finds the header under a title, matches headers without tone marks, and skips blank lines", () => {
    const read = readMenuSheet([
      ["DANH SÁCH HÀNG HÓA"],
      [],
      ["ten hang hoa", "GIA BAN", "Tên nhóm", "Không cho phép bán?"],
      ["Cà phê sữa", "29.000", "Cà phê", "0"],
      ["", "", "", ""],
      ["Bạc xỉu", "32000", "Cà phê", "1"],
    ]);
    if (!read.ok) throw new Error(read.reason);
    expect(read.rows.map((row) => [row.line, row.name, row.price, row.group, row.notForSale])).toEqual([
      [4, "Cà phê sữa", "29.000", "Cà phê", false],
      [6, "Bạc xỉu", "32000", "Cà phê", true],
    ]);
  });

  it("says so when there is no name column or no line under it", () => {
    expect(readMenuSheet([["Mã", "Giá"], ["A1", "10"]])).toEqual({ ok: false, reason: "no_name_column" });
    expect(readMenuSheet([MENU_SHEET_HEADER])).toEqual({ ok: false, reason: "no_rows" });
  });
});

describe("exporting the menu", () => {
  const category = (id: string, name: string, sortOrder: number): Category => ({
    id,
    brandId: "b",
    name,
    sortOrder,
    version: 1,
  });
  const product = (over: Partial<ProductSummary> & Pick<ProductSummary, "id" | "name">): ProductSummary => ({
    kind: "prepared_drink",
    categoryId: null,
    basePrice: 30_000,
    pricingMode: "fixed",
    version: 1,
    archivedAt: null,
    ...over,
  });

  it("writes the same columns, in category order, and reads back as the same names and prices", () => {
    const categories = [category("c2", "Trà", 20), category("c1", "Cà phê", 10)];
    const products = [
      product({ id: "1", name: "Trà đào", categoryId: "c2", basePrice: 45_000 }),
      product({ id: "2", name: "Cà phê muối", categoryId: "c1" }),
      product({ id: "3", name: "Món theo cân", pricingMode: "weighed", basePrice: 1000 }),
      product({ id: "4", name: "Bánh cũ", archivedAt: "2026-10-01T00:00:00.000Z" }),
    ];
    const rows = menuSheetRows(products, categories);
    expect(rows[0]).toEqual([...MENU_SHEET_HEADER]);
    const read = readMenuSheet(sheetOf(writeXlsxSheet("Thực đơn", rows)));
    if (!read.ok) throw new Error(read.reason);
    expect(read.rows.map((row) => [row.name, row.group, row.price, row.notForSale])).toEqual([
      ["Cà phê muối", "Cà phê", "30000", false],
      ["Trà đào", "Trà", "45000", false],
      ["Bánh cũ", "", "30000", true],
      ["Món theo cân", "", "", false],
    ]);
    expect(read.ignored).toEqual([]);
  });
});
