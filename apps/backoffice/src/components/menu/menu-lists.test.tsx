import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ProductSummary, SoldOut } from "../../lib/api/catalog-api";
import { foldForSearch } from "../../lib/format/search-text";
import { vi } from "../../messages/vi";
import { BRANCHES, ok } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { AvailabilityScreen } from "./availability-screen";
import { ProductListScreen } from "./product-list-screen";

const summary = (id: string, name: string, archivedAt: string | null = null): ProductSummary => ({
  id,
  name,
  kind: "prepared_drink",
  categoryId: null,
  basePrice: 35_000,
  pricingMode: "fixed",
  version: 1,
  archivedAt,
});

const PRODUCTS = [
  summary("p1", "Trà sữa trân châu"),
  summary("p2", "Cà phê đen đá"),
  summary("p3", "Trà đào cũ", "2026-10-01T00:00:00.000Z"),
];

describe("the product list", () => {
  it("finds a product typed without tone marks, and hides archived ones unless asked", async () => {
    await renderSignedIn(<ProductListScreen />, {
      listProducts: async () => ok(PRODUCTS),
      listCategories: async () => ok([]),
    });
    await screen.findByText("Trà sữa trân châu");
    expect(screen.queryByText("Trà đào cũ")).toBeNull();
    fireEvent.change(screen.getByLabelText(vi.menu.products.search), { target: { value: "tra" } });
    expect(screen.getByText("Trà sữa trân châu")).toBeTruthy();
    expect(screen.queryByText("Cà phê đen đá")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: vi.menu.products.showArchived }));
    expect(screen.getByText("Trà đào cũ")).toBeTruthy();
    expect(screen.getAllByText(/^35\.000\s₫$/).length).toBe(2);
  });

  it("folds đ and combining marks like their precomposed letters", () => {
    expect(foldForSearch("Đường đen")).toBe("duong den");
    expect(foldForSearch("Nguyễn")).toBe(foldForSearch("Nguyễn"));
  });
});

describe("sold out by hand at a branch", () => {
  it("switches a product off at the branch being looked at, on every channel", async () => {
    let soldOut: SoldOut[] = [];
    const setAvailable = mock.fn(async (input: { productId: string; branchId: string; available: boolean }) => {
      soldOut = input.available ? [] : [{ productId: input.productId, channelKey: null, unavailableUntil: null }];
      return ok(true as const);
    });
    await renderSignedIn(<AvailabilityScreen />, {
      listProducts: async () => ok(PRODUCTS),
      listSoldOut: async () => ok(soldOut),
      setAvailable,
    });
    const tea = await screen.findByRole("checkbox", { name: vi.menu.availability.toggleLabel("Trà sữa trân châu") });
    expect((tea as HTMLInputElement).checked).toBe(true);
    // Archived products are off every menu already.
    expect(screen.queryByText("Trà đào cũ")).toBeNull();
    fireEvent.click(tea);
    await mock.waitFor(() => expect((tea as HTMLInputElement).checked).toBe(false));
    expect(setAvailable).toHaveBeenCalledWith({ productId: "p1", branchId: BRANCHES[0]!.id, available: false });
  });

  it("does not count a product off only on a delivery channel as sold out at the counter", async () => {
    await renderSignedIn(<AvailabilityScreen />, {
      listProducts: async () => ok(PRODUCTS),
      listSoldOut: async () => ok([{ productId: "p2", channelKey: "grab", unavailableUntil: null }]),
    });
    const coffee = await screen.findByRole("checkbox", { name: vi.menu.availability.toggleLabel("Cà phê đen đá") });
    expect((coffee as HTMLInputElement).checked).toBe(true);
  });

  it("lists only what is sold out at the counter under its filter, with a word for each state", async () => {
    await renderSignedIn(<AvailabilityScreen />, {
      listProducts: async () => ok(PRODUCTS),
      listSoldOut: async () => ok([{ productId: "p2", channelKey: null, unavailableUntil: null }]),
    });
    await screen.findByText("Cà phê đen đá");
    const A = vi.menu.availability;
    fireEvent.click(screen.getByRole("button", { name: vi.table.count(A.filters.soldOut, 1) }));
    expect(screen.getByText("Cà phê đen đá").closest("tr")?.textContent).toContain(A.soldOut);
    expect(screen.queryByText("Trà sữa trân châu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: vi.table.count(A.filters.available, 1) }));
    expect(screen.getByText("Trà sữa trân châu").closest("tr")?.textContent).toContain(A.available);
    expect(screen.queryByText("Cà phê đen đá")).toBeNull();
  });
});
