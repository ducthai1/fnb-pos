import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductSummary } from "../../lib/api/catalog-api";
import { vi } from "../../messages/vi";
import { ok } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { ProductListScreen } from "./product-list-screen";

const URL = `/media/product-images/0190a000-0000-7000-8000-0000000000e1/${"ab".repeat(32)}.webp`;
const product = (id: string, name: string, imageUrl: string | null): ProductSummary => ({
  id,
  name,
  kind: "prepared_drink",
  categoryId: null,
  basePrice: 35_000,
  pricingMode: "fixed",
  version: 1,
  archivedAt: null,
  imageUrl,
});

const markOf = (name: string) =>
  screen.getByRole("link", { name: vi.menu.products.edit(name) }).querySelector<HTMLElement>(".bo-mark")!;

describe("the product list's photos", () => {
  it("shows a product's photo small in its row, and the initials for one without", async () => {
    await renderSignedIn(<ProductListScreen />, {
      listProducts: async () => ok([product("p1", "Trà sữa trân châu", URL), product("p2", "Cà phê đen", null)]),
      listCategories: async () => ok([]),
    });
    await screen.findByText("Trà sữa trân châu");
    expect(markOf("Trà sữa trân châu").querySelector("img")?.getAttribute("src")).toBe(`/api${URL}`);
    expect(markOf("Cà phê đen").querySelector("img")).toBeNull();
    expect(markOf("Cà phê đen").dataset.initial).toBe("CP");
  });

  it("drops a photo that fails to load, leaving the initials", async () => {
    await renderSignedIn(<ProductListScreen />, {
      listProducts: async () => ok([product("p1", "Trà sữa trân châu", URL)]),
      listCategories: async () => ok([]),
    });
    await screen.findByText("Trà sữa trân châu");
    fireEvent.error(markOf("Trà sữa trân châu").querySelector("img")!);
    expect(markOf("Trà sữa trân châu").querySelector("img")).toBeNull();
    expect(markOf("Trà sữa trân châu").dataset.initial).toBe("TS");
  });
});
