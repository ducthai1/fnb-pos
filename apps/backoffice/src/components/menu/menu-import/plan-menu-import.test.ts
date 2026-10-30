import { describe, expect, it } from "vitest";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import type { MenuSheetRow } from "../../../lib/catalog/menu-sheet/read-menu-sheet";
import { vi } from "../../../messages/vi";
import { planMenuImport, rowsToWrite } from "./plan-menu-import";

const T = vi.menuImport;
const BRAND = "0199a000-0000-7000-8000-0000000000b1";
let nextLine = 2;
const line = (over: Partial<MenuSheetRow>): MenuSheetRow => ({
  line: nextLine++,
  code: "",
  name: "Cà phê sữa",
  group: "",
  price: "29000",
  vat: "",
  notForSale: false,
  ...over,
});
const summary = (
  over: Partial<ProductSummary> & Pick<ProductSummary, "id" | "name">,
): ProductSummary => ({
  kind: "prepared_drink",
  categoryId: null,
  basePrice: 29_000,
  pricingMode: "fixed",
  version: 1,
  archivedAt: null,
  ...over,
});
const COFFEE: Category = {
  id: "cat-coffee",
  brandId: BRAND,
  name: "Cà phê",
  sortOrder: 10,
  version: 1,
};

const plan = (
  rows: MenuSheetRow[],
  products: ProductSummary[] = [],
  target: Parameters<typeof planMenuImport>[0]["target"] = { by: "group" },
) =>
  planMenuImport({
    rows,
    products,
    categories: [COFFEE],
    brandId: BRAND,
    kind: "prepared_drink",
    target,
  });

describe("planning a menu import", () => {
  it("reports each bad line with its reason and keeps the good ones", () => {
    const rows = plan([
      line({ line: 2, code: "A1", name: "Cà phê sữa", price: "29.000" }),
      line({ line: 3, code: "A2", name: "   ", price: "10000" }),
      line({ line: 4, code: "A3", name: "Trà âm", price: "-5000" }),
      line({ line: 5, code: "A4", name: "Trà chữ", price: "ba mươi nghìn" }),
      line({ line: 6, code: "A1", name: "Bạc xỉu", price: "32000" }),
      line({ line: 7, code: "A6", name: "cà phê  SỮA", price: "30000" }),
      line({ line: 8, code: "A7", name: "Trà lẻ", price: "35.5" }),
      line({ line: 9, code: "A8", name: "Trà thuế", price: "30000", vat: "abc" }),
      line({ line: 10, code: "A9", name: "Đ".repeat(121), price: "30000" }),
      line({ line: 11, code: "B1", name: "Bánh ngừng bán", price: "20000", notForSale: true }),
    ]);
    const byLine = new Map(rows.map((row) => [row.line, row]));
    expect(byLine.get(2)).toMatchObject({ status: "new", price: 29_000, problems: [] });
    expect(byLine.get(3)).toMatchObject({
      status: "error",
      problems: [vi.menu.editor.nameRequired],
    });
    expect(byLine.get(4)).toMatchObject({ status: "error", problems: [vi.common.amountInvalid] });
    expect(byLine.get(5)).toMatchObject({ status: "error", problems: [vi.common.amountInvalid] });
    expect(byLine.get(6)).toMatchObject({ status: "error", problems: [T.duplicateCode(2)] });
    expect(byLine.get(7)).toMatchObject({ status: "error", problems: [T.duplicateName(2)] });
    expect(byLine.get(8)).toMatchObject({ status: "error", problems: [vi.common.amountInvalid] });
    expect(byLine.get(9)).toMatchObject({ status: "error", problems: [vi.roles.rateInvalid] });
    expect(byLine.get(10)).toMatchObject({
      status: "error",
      problems: [vi.menu.editor.nameTooLong],
    });
    expect(byLine.get(11)).toMatchObject({ status: "skipped", problems: [T.notForSale] });
    expect(rowsToWrite(rows).map((row) => row.line)).toEqual([2]);
  });

  it("refuses a fixed-price line without a price, as the editor would", () => {
    const [row] = plan([line({ price: "" })]);
    expect(row?.status).toBe("error");
    expect(row?.problems.length).toBe(1);
  });

  it("builds the body a new product is saved with, its VAT read as a percentage", () => {
    const [row] = plan([line({ name: "  Trà đào  ", price: "45.000", vat: "8%" })]);
    expect(row?.body).toMatchObject({
      version: null,
      brandId: BRAND,
      kind: "prepared_drink",
      name: "Trà đào",
      basePrice: 45_000,
      pricingMode: "fixed",
      taxRateBp: 800,
    });
  });

  it("matches the menu by name: unchanged lines write nothing, a new price or category updates", () => {
    const products = [
      summary({ id: "p1", name: "Cà phê sữa", categoryId: "cat-coffee" }),
      summary({ id: "p2", name: "Bạc xỉu", basePrice: 30_000, categoryId: "cat-coffee" }),
      summary({ id: "p3", name: "Trà đào", categoryId: null }),
      summary({ id: "p4", name: "Món cân", pricingMode: "weighed" }),
    ];
    const rows = plan(
      [
        line({ name: "CÀ PHÊ SỮA", group: "cà phê", price: "29000" }),
        line({ name: "Bạc xỉu", group: "Cà phê", price: "32000" }),
        line({ name: "Trà đào", group: "Trà", price: "29000" }),
        line({ name: "Món cân", price: "29000" }),
      ],
      products,
    );
    expect(rows.map((row) => [row.status, row.productId])).toEqual([
      ["same", "p1"],
      ["update", "p2"],
      ["update", "p3"],
      ["skipped", "p4"],
    ]);
    expect(rows[2]?.category).toEqual({ create: "Trà" });
    expect(rows[0]?.category).toEqual({ id: "cat-coffee" });
  });

  it("puts every line in one chosen category, or in none, when asked to", () => {
    const rows = [line({ group: "Trà" }), line({ name: "Bạc xỉu", group: "" })];
    expect(plan(rows, [], { by: "one", id: "cat-coffee" }).map((row) => row.category)).toEqual([
      { id: "cat-coffee" },
      { id: "cat-coffee" },
    ]);
    expect(plan(rows, [], { by: "one", id: null }).map((row) => row.category)).toEqual([
      { id: null },
      { id: null },
    ]);
    expect(plan(rows).map((row) => row.category)).toEqual([{ create: "Trà" }, { id: null }]);
  });

  it("keeps a matched product's category unless the line names a group", () => {
    const products = [
      summary({ id: "p1", name: "Bạc xỉu", basePrice: 30_000, categoryId: "cat-coffee" }),
    ];
    const [blank] = plan([line({ name: "Bạc xỉu", group: "", price: "32000" })], products);
    expect(blank).toMatchObject({ status: "update", category: { id: "cat-coffee" } });
    const [picked] = plan([line({ name: "Bạc xỉu", group: "Trà", price: "30000" })], products, {
      by: "one",
      id: null,
    });
    expect(picked).toMatchObject({ status: "same", category: { id: "cat-coffee" } });
  });

  it("prefers the product on sale, and skips a line matching only one taken off the menu", () => {
    const gone = "2026-10-01T00:00:00.000Z";
    const products = [
      summary({ id: "old", name: "Trà đào", archivedAt: gone }),
      summary({ id: "now", name: "Trà đào" }),
      summary({ id: "off", name: "Trà vải", archivedAt: gone }),
    ];
    const rows = plan([line({ name: "Trà đào" }), line({ name: "Trà vải" })], products);
    expect(rows.map((row) => [row.status, row.productId])).toEqual([
      ["same", "now"],
      ["skipped", "off"],
    ]);
    expect(rows[1]?.problems).toEqual([T.archivedMatch]);
  });

  it("refuses a line whose group is too long to become a category", () => {
    const [row] = plan([line({ group: "Đ".repeat(121) })]);
    expect(row).toMatchObject({ status: "error", problems: [T.groupTooLong] });
  });

  describe("matching the menu by code before name", () => {
    const products = [
      summary({ id: "p1", name: "Cà phê sữa đá", code: "CF01", categoryId: "cat-coffee" }),
      summary({ id: "p2", name: "Bạc xỉu", code: "CF02", categoryId: "cat-coffee" }),
    ];

    it("matches a line by its code even when the sheet renamed the drink, ignoring case", () => {
      const [row] = plan(
        [line({ code: " cf01 ", name: "Cà phê sữa (mới)", price: "35000" })],
        products,
        { by: "one", id: "cat-coffee" },
      );
      expect(row).toMatchObject({ status: "update", productId: "p1", price: 35_000 });
    });

    it("lets the code win when the name belongs to another product", () => {
      const [row] = plan([line({ code: "CF02", name: "Cà phê sữa đá", price: "29000" })], products);
      expect(row?.productId).toBe("p2");
    });

    it("falls back to the name when the line has no code or one the menu does not know", () => {
      const rows = plan(
        [
          line({ code: "", name: "Bạc xỉu", price: "30000" }),
          line({ code: "ZZ9", name: "Cà phê sữa đá", price: "29000" }),
        ],
        products,
      );
      expect(rows.map((row) => row.productId)).toEqual(["p2", "p1"]);
    });

    it("makes a new product with the code of a line the menu knows by neither name nor code", () => {
      const [row] = plan([line({ code: "NEW-1", name: "Trà vải", price: "40000" })], products);
      expect(row).toMatchObject({ status: "new", productId: null });
      expect(row?.body).toMatchObject({ code: "NEW-1", name: "Trà vải" });
    });

    it("leaves the code out of a new product's body when the line has none", () => {
      const [row] = plan([line({ code: "", name: "Trà vải", price: "40000" })], products);
      expect(row?.body).not.toHaveProperty("code");
    });

    it("flags two lines that differ only in the case of their code, and a code the server would refuse", () => {
      const rows = plan([
        line({ line: 2, code: "Ab1", name: "Một", price: "10000" }),
        line({ line: 3, code: "aB1", name: "Hai", price: "10000" }),
        line({ line: 4, code: "co dau cach", name: "Ba", price: "10000" }),
      ]);
      expect(rows[1]).toMatchObject({ status: "error", problems: [T.duplicateCode(2)] });
      expect(rows[2]).toMatchObject({ status: "error", problems: [vi.menu.editor.codeInvalid] });
    });
  });
});
