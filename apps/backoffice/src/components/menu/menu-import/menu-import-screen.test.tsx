import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi as mock } from "vitest";
import type { ProductSummary } from "../../../lib/api/catalog-api";
import { readMenuSheet } from "../../../lib/catalog/menu-sheet/read-menu-sheet";
import { readXlsxSheet } from "../../../lib/sheet/read-xlsx-sheet";
import { writeXlsxSheet } from "../../../lib/sheet/write-xlsx-sheet";
import { vi } from "../../../messages/vi";
import { ok } from "../../../test-support/fake-backoffice-api";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { ProductListScreen } from "../product-list-screen";
import { MenuImportScreen } from "./menu-import-screen";

const T = vi.menuImport;
const SAMPLE = resolve(process.cwd(), "src/test-support/fixtures/products-export-24-columns.xlsx");

const pick = (bytes: Uint8Array, name: string) => {
  const file = new File([new Uint8Array(bytes)], name);
  fireEvent.change(screen.getByLabelText(T.fileLabel), { target: { files: [file] } });
};

function catalogOnScreen() {
  const catalog = fakeCatalog();
  const listProducts = async (): Promise<ReturnType<typeof ok<ProductSummary[]>>> =>
    ok(
      [...catalog.products.values()].map((product) => ({
        id: product.id,
        name: product.name,
        kind: product.kind,
        categoryId: product.categoryId,
        basePrice: product.basePrice,
        pricingMode: product.pricingMode,
        version: product.version,
        archivedAt: product.archivedAt,
      })),
    );
  return { ...catalog, api: { ...catalog.api, listProducts } };
}

afterEach(() => mock.restoreAllMocks());

describe("importing the menu from a products sheet", () => {
  it("previews the ten lines of an export, names the columns left out, and imports them once", async () => {
    const { api, putProduct } = catalogOnScreen();
    await renderSignedIn(<MenuImportScreen />, api);
    pick(new Uint8Array(readFileSync(SAMPLE)), "products-2026-06-13.xlsx");

    await screen.findByText(T.fileRead("products-2026-06-13.xlsx", 10));
    const table = await screen.findByRole("table", { name: T.previewLabel });
    expect(within(table).getAllByText(T.status.new)).toHaveLength(10);
    expect(within(table).getByText("Giày sneaker unisex")).toBeTruthy();
    expect(within(table).getAllByText(/^499\.000\s₫$/)).toHaveLength(2);
    const ignored = screen.getByRole("note", { name: T.ignoredTitle });
    expect(ignored.textContent).toContain("Giá vốn, Tồn kho, Hình ảnh");

    fireEvent.click(screen.getByRole("button", { name: T.start(10) }));
    await screen.findByText(T.finished(10, 0));
    expect(putProduct).toHaveBeenCalledTimes(10);
    expect(putProduct.mock.calls.map(([, body]) => body.basePrice)).toContain(599_000);
    // Read again, the menu has them: the same file now has nothing left to write.
    await waitFor(() => expect(screen.getByText(T.nothingToImport)).toBeTruthy());
    expect(within(table).getAllByText(T.status.imported)).toHaveLength(10);
  });

  it("marks each bad line with its reason and imports only the good ones", async () => {
    const { api, putProduct } = catalogOnScreen();
    await renderSignedIn(<MenuImportScreen />, api);
    pick(
      writeXlsxSheet("Menu", [
        ["Mã hàng hóa", "Tên hàng hóa", "Giá bán"],
        ["CF1", "Cà phê sữa", 29_000],
        ["CF2", "", 25_000],
        ["CF3", "Trà âm", -5_000],
        ["CF1", "Bạc xỉu", 32_000],
      ]),
      "menu.xlsx",
    );
    const table = await screen.findByRole("table", { name: T.previewLabel });
    expect(within(table).getByText(vi.menu.editor.nameRequired)).toBeTruthy();
    expect(within(table).getByText(vi.common.amountInvalid)).toBeTruthy();
    expect(within(table).getByText(T.duplicateCode(2))).toBeTruthy();
    expect(screen.queryByRole("note", { name: T.ignoredTitle })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.start(1) }));
    await screen.findByText(T.finished(1, 0));
    expect(putProduct.mock.calls.map(([, body]) => body.name)).toEqual(["Cà phê sữa"]);
  });

  it("says why a file cannot be read", async () => {
    await renderSignedIn(<MenuImportScreen />, catalogOnScreen().api);
    pick(new TextEncoder().encode("Tên,Giá\nCà phê,29000"), "menu.csv");
    expect((await screen.findByRole("alert")).textContent).toBe(T.unreadable);
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("exporting the menu", () => {
  it("hands over a sheet in the same layout, every product of the brand in it", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = mock.fn((value: Blob) => {
      blob = value;
      return "blob:menu";
    });
    URL.revokeObjectURL = mock.fn();
    const click = mock.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const products: ProductSummary[] = [
      {
        id: "p1",
        name: "Trà đào",
        kind: "prepared_drink",
        categoryId: null,
        basePrice: 45_000,
        pricingMode: "fixed",
        version: 1,
        archivedAt: null,
      },
      {
        id: "p2",
        name: "Trà cũ",
        kind: "prepared_drink",
        categoryId: null,
        basePrice: 20_000,
        pricingMode: "fixed",
        version: 1,
        archivedAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    await renderSignedIn(<ProductListScreen />, {
      listProducts: async () => ok(products),
      listCategories: async () => ok([]),
    });
    await screen.findByText("Trà đào");
    fireEvent.click(screen.getByRole("button", { name: T.export }));
    expect(click).toHaveBeenCalledTimes(1);
    const sheet = readXlsxSheet(new Uint8Array(await (blob as Blob).arrayBuffer()));
    const menu = sheet.ok ? readMenuSheet(sheet.rows) : null;
    if (menu === null || !menu.ok) throw new Error("the export does not read back");
    expect(menu.rows.map((row) => [row.name, row.price, row.notForSale])).toEqual([
      ["Trà cũ", "20000", true],
      ["Trà đào", "45000", false],
    ]);
    expect(screen.getByRole("link", { name: T.open }).getAttribute("href")).toBe("/menu/import");
  });
});
