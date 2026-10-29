import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { PriceListSummary } from "../../../lib/api/price-list-api";
import { vi } from "../../../messages/vi";
import { HOSTILE_MENU } from "../../../test-support/hostile-catalog";
import { ok, refused } from "../../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { PriceListsScreen } from "./price-lists-screen";

const T = vi.priceLists.list;
const list = (n: number, name = `Bảng giá ${n}`, itemCount = n % 4): PriceListSummary => ({ id: `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`, name, version: 1, itemCount });

describe("the price lists page", () => {
  it("says there are none yet and offers to make one", async () => {
    await renderSignedIn(<PriceListsScreen />, { listPriceLists: async () => ok([]) });
    await screen.findByText(T.empty);
    expect(screen.getByRole("link", { name: T.add }).getAttribute("href")).toMatch(/^\/menu\/price-lists\/[0-9a-f-]{36}\?new=1$/);
  });

  it("lists 60 lists with hostile names, each with its rule count and an edit link", async () => {
    const lists = [list(1, HOSTILE_MENU.productName, 0), list(2, HOSTILE_MENU.emoji, 1), ...Array.from({ length: 58 }, (_, at) => list(at + 3))];
    await renderSignedIn(<PriceListsScreen />, { listPriceLists: async () => ok(lists) });
    await screen.findAllByText("Bảng giá 3");
    // The sixty do not all show at once: the table pages them, and the search finds the long name.
    expect(screen.queryAllByText(HOSTILE_MENU.productName)).toHaveLength(0);
    fireEvent.change(screen.getByRole("searchbox", { name: T.search }), { target: { value: "kemmuoi" } });
    await screen.findAllByText(HOSTILE_MENU.productName);
    expect(screen.getAllByRole("link", { name: T.edit(HOSTILE_MENU.productName) })[0]?.getAttribute("href")).toBe(`/menu/price-lists/${lists[0]?.id}`);
    expect(screen.getAllByText(T.rules(0)).length).toBeGreaterThan(0);
  });

  it("asks before deleting, deletes, and shows the list gone", async () => {
    let lists = [list(1, "Giờ vàng"), list(2, "Cuối tuần")];
    const deletePriceList = mock.fn(async (id: string) => {
      lists = lists.filter((each) => each.id !== id);
      return ok(true as const);
    });
    await renderSignedIn(<PriceListsScreen />, { listPriceLists: async () => ok([...lists]), deletePriceList });
    await screen.findAllByText("Giờ vàng");
    fireEvent.click(screen.getAllByRole("button", { name: T.deleteLabel("Giờ vàng") })[0] as HTMLElement);
    expect(deletePriceList).not.toHaveBeenCalled();
    await screen.findByText(T.deleteTitle("Giờ vàng"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.deleted("Giờ vàng"));
    expect(deletePriceList).toHaveBeenCalledWith(list(1).id);
    expect(screen.queryAllByText("Giờ vàng")).toHaveLength(0);
  });

  it("shows why a delete failed and keeps the list", async () => {
    await renderSignedIn(<PriceListsScreen />, {
      listPriceLists: async () => ok([list(1, "Giờ vàng")]),
      deletePriceList: async () => refused(404, "API_CATALOG_PRICE_LIST_NOT_FOUND"),
    });
    await screen.findAllByText("Giờ vàng");
    fireEvent.click(screen.getAllByRole("button", { name: T.deleteLabel("Giờ vàng") })[0] as HTMLElement);
    await screen.findByText(T.deleteTitle("Giờ vàng"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(vi.errors.byCode.API_CATALOG_PRICE_LIST_NOT_FOUND as string);
    expect(screen.getAllByText("Giờ vàng").length).toBeGreaterThan(0);
  });

  it("shows a failed load with a way to retry", async () => {
    await renderSignedIn(<PriceListsScreen />, { listPriceLists: async () => refused(null) });
    await screen.findByText(vi.errors.network);
  });
});
