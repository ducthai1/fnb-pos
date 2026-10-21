import { describe, expect, it, vi as mock } from "vitest";
import type { CatalogApi, Category } from "../../../lib/api/catalog-api";
import type { MenuSheetRow } from "../../../lib/catalog/menu-sheet/read-menu-sheet";
import { vi } from "../../../messages/vi";
import { ok, refused } from "../../../test-support/fake-backoffice-api";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { planMenuImport } from "./plan-menu-import";
import { type RowOutcome, runMenuImport } from "./run-menu-import";

const BRAND = "0199a000-0000-7000-8000-0000000000b1";
const COFFEE: Category = {
  id: "cat-coffee",
  brandId: BRAND,
  name: "Cà phê",
  sortOrder: 30,
  version: 1,
};
const line = (at: number, name: string, group: string, price = "30000"): MenuSheetRow => ({
  line: at,
  code: `M${at}`,
  name,
  group,
  price,
  vat: "",
  notForSale: false,
});

function withCategories(refuse: ReadonlySet<string> = new Set()) {
  const catalog = fakeCatalog([COFFEE]);
  const putCategory = mock.fn(async (id: string, body: { name: string; sortOrder: number }) =>
    refuse.has(body.name)
      ? refused(409, "API_CATALOG_CATEGORY_NAME_TAKEN")
      : ok({ id, brandId: BRAND, name: body.name, sortOrder: body.sortOrder, version: 1 }),
  );
  return { ...catalog, putCategory, api: { ...catalog.api, putCategory } as CatalogApi };
}

const planOf = (
  rows: MenuSheetRow[],
  products = [] as Parameters<typeof planMenuImport>[0]["products"],
) =>
  planMenuImport({
    rows,
    products,
    categories: [COFFEE],
    brandId: BRAND,
    kind: "prepared_drink",
    target: { by: "group" },
  });

describe("running a menu import", () => {
  it("creates each missing category once, after the menu's last, and saves every product in it", async () => {
    const { api, products, putCategory } = withCategories();
    const outcomes: [number, RowOutcome][] = [];
    const rows = planOf([
      line(2, "Trà đào", "Trà"),
      line(3, "Trà vải", "trà"),
      line(4, "Bạc xỉu", "Cà phê"),
    ]);
    const result = await runMenuImport(
      api,
      { brandId: BRAND, rows, categories: [COFFEE] },
      {
        stopped: () => false,
        onRow: (at, outcome) => outcomes.push([at, outcome]),
      },
    );
    expect(result).toBe("done");
    expect(putCategory).toHaveBeenCalledTimes(1);
    expect(putCategory.mock.calls[0]?.[1]).toMatchObject({
      name: "Trà",
      sortOrder: 40,
      version: null,
    });
    const teaId = putCategory.mock.calls[0]?.[0];
    expect(outcomes).toEqual([
      [2, { ok: true }],
      [3, { ok: true }],
      [4, { ok: true }],
    ]);
    const saved = [...products.values()].map((product) => [
      product.name,
      product.categoryId,
      product.basePrice,
    ]);
    expect(saved).toEqual([
      ["Trà đào", teaId, 30_000],
      ["Trà vải", teaId, 30_000],
      ["Bạc xỉu", "cat-coffee", 30_000],
    ]);
  });

  it("stops before the next product when asked, keeping the ones already saved", async () => {
    const { api, products } = withCategories();
    let written = 0;
    const rows = planOf([line(2, "Một", ""), line(3, "Hai", ""), line(4, "Ba", "")]);
    const result = await runMenuImport(
      api,
      { brandId: BRAND, rows, categories: [COFFEE] },
      {
        stopped: () => written >= 1,
        onRow: () => (written += 1),
      },
    );
    expect(result).toBe("stopped");
    expect([...products.values()].map((product) => product.name)).toEqual(["Một"]);
  });

  it("updates a matched product from its current version, keeping its sizes, options and photo", async () => {
    const { api, products, putProduct } = withCategories();
    const id = "0199a000-0000-7000-8000-0000000000a1";
    const photo = `${"ab".repeat(32)}.webp`;
    await api.putProduct(id, {
      version: null,
      brandId: BRAND,
      categoryId: null,
      kind: "prepared_drink",
      name: "Trà sữa",
      basePrice: 30_000,
      pricingMode: "fixed",
      taxRateBp: 800,
      stationId: null,
      trackStock: false,
      earnsPoints: true,
      printCupLabel: false,
      variants: [{ id: "0199a000-0000-7000-8000-0000000000c1", name: "L", price: 40_000 }],
      modifierGroups: [],
      combo: null,
      imageKey: photo,
    });
    const summary = {
      id,
      name: "Trà sữa",
      kind: "prepared_drink",
      categoryId: null,
      basePrice: 30_000,
      pricingMode: "fixed",
      version: 1,
      archivedAt: null,
    };
    const rows = planOf([line(2, "trà sữa", "Cà phê", "35000")], [summary]);
    expect(rows[0]?.status).toBe("update");
    await runMenuImport(
      api,
      { brandId: BRAND, rows, categories: [COFFEE] },
      { stopped: () => false, onRow: () => {} },
    );
    expect(putProduct.mock.calls[1]?.[1]).toMatchObject({
      version: 1,
      basePrice: 35_000,
      categoryId: "cat-coffee",
    });
    expect(products.get(id)).toMatchObject({
      name: "Trà sữa",
      taxRateBp: 800,
      version: 2,
      basePrice: 35_000,
    });
    expect(products.get(id)?.variants).toHaveLength(1);
    // The file carries no photo and the import names none: the product keeps its own.
    expect(putProduct.mock.calls[1]?.[1]).not.toHaveProperty("imageKey");
    expect(products.get(id)?.imageKey).toBe(photo);
  });

  it("fails the lines of a category it could not create, and goes on with the others", async () => {
    const { api } = withCategories(new Set(["Trà"]));
    const outcomes = new Map<number, RowOutcome>();
    const rows = planOf([line(2, "Trà đào", "Trà"), line(3, "Bạc xỉu", "Cà phê")]);
    await runMenuImport(
      api,
      { brandId: BRAND, rows, categories: [COFFEE] },
      {
        stopped: () => false,
        onRow: (at, outcome) => outcomes.set(at, outcome),
      },
    );
    expect(outcomes.get(2)).toEqual({ ok: false, message: vi.menuImport.categoryFailed("Trà") });
    expect(outcomes.get(3)).toEqual({ ok: true });
  });
});
