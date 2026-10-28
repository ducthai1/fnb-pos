import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category } from "../../lib/api/catalog-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok } from "../../test-support/fake-backoffice-api";
import { fakeCatalog } from "../../test-support/fake-catalog";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { ProductListScreen } from "./product-list-screen";

const T = vi.menu.products;
const BRAND = BRANCHES[0]?.brandId ?? "";
const TEA: Category = {
  id: "0199a000-0000-7000-8000-0000000000c2",
  brandId: BRAND,
  name: "Trà",
  sortOrder: 20,
  version: 1,
};

async function menuOf(names: readonly string[]) {
  const catalog = fakeCatalog([TEA]);
  for (const [at, name] of names.entries()) {
    await catalog.api.putProduct?.(`0199a000-0000-7000-8000-00000000010${at}`, {
      version: null,
      brandId: BRAND,
      categoryId: null,
      kind: "prepared_drink",
      name,
      basePrice: 30_000,
      pricingMode: "fixed",
      measureUnit: null,
      taxRateBp: 800,
      stationId: null,
      trackStock: false,
      earnsPoints: true,
      printCupLabel: false,
      variants: [],
      modifierGroups: [],
      combo: null,
    });
  }
  const listProducts = async () =>
    ok(
      [...catalog.products.values()].map(
        ({ id, name, kind, categoryId, basePrice, pricingMode, version, archivedAt }) => ({
          id,
          name,
          kind,
          categoryId,
          basePrice,
          pricingMode,
          version,
          archivedAt,
        }),
      ),
    );
  return {
    ...catalog,
    api: { ...catalog.api, listProducts, listCategories: async () => ok([TEA]) },
  };
}

describe("moving several products at once", () => {
  it("moves the ticked products to a category, each saved whole from its current version", async () => {
    const { api, products } = await menuOf(["Trà đào", "Trà vải", "Bạc xỉu"]);
    await renderSignedIn(<ProductListScreen />, api);
    await screen.findByText("Trà đào");
    expect(screen.queryByRole("region", { name: T.picked(1) })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: T.pick("Trà đào") }));
    fireEvent.click(screen.getByRole("checkbox", { name: T.pick("Trà vải") }));
    const bar = screen.getByRole("region", { name: T.picked(2) });
    fireEvent.change(screen.getByLabelText(T.moveTo), { target: { value: TEA.id } });
    fireEvent.click(screen.getByRole("button", { name: T.move }));
    await screen.findByText(T.moved(2, "Trà"));
    expect(bar.isConnected).toBe(false);
    const byName = new Map([...products.values()].map((product) => [product.name, product]));
    expect(byName.get("Trà đào")).toMatchObject({ categoryId: TEA.id, version: 2, taxRateBp: 800 });
    expect(byName.get("Trà vải")?.categoryId).toBe(TEA.id);
    expect(byName.get("Bạc xỉu")).toMatchObject({ categoryId: null, version: 1 });
  });

  it("unticks everything from the bar without writing", async () => {
    const { api, putProduct } = await menuOf(["Trà đào"]);
    await renderSignedIn(<ProductListScreen />, api);
    fireEvent.click(await screen.findByRole("checkbox", { name: T.pickAll }));
    fireEvent.click(screen.getByRole("button", { name: T.clearPicked }));
    expect(screen.queryByRole("region", { name: T.picked(1) })).toBeNull();
    expect(putProduct).toHaveBeenCalledTimes(1);
  });
});
