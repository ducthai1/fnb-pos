import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { dailySalesReport } from "../../test-support/fake-reports-and-day";
import { DailyItemsTable } from "./daily-items-table";

const T = vi.dailySales;
const names = () =>
  within(screen.getByRole("table", { name: T.itemsTitle }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("the day's sales by item", () => {
  it("keeps goods apart from toppings and combo parts by a filter", () => {
    render(<DailyItemsTable report={dailySalesReport()} />);
    fireEvent.click(screen.getByRole("button", { name: vi.table.count(T.itemFilters.extras, 1) }));
    expect(names()).toEqual([`Trân châu đen (${T.lineTypes.modifier})`]);
    fireEvent.click(screen.getByRole("button", { name: vi.table.count(T.itemFilters.goods, 1) }));
    expect(names()).toEqual(["Trà sữa trân châu"]);
  });

  it("sorts by units as numbers, not as text", () => {
    render(<DailyItemsTable report={dailySalesReport()} />);
    const units = screen.getByRole("button", { name: vi.table.sortColumn(T.itemColumns.quantity) });
    fireEvent.click(units);
    // 8 units of the topping, 12.5 of the tea: "12.5" < "8" as text.
    expect(names()).toEqual([`Trân châu đen (${T.lineTypes.modifier})`, "Trà sữa trân châu"]);
    fireEvent.click(units);
    expect(names()).toEqual(["Trà sữa trân châu", `Trân châu đen (${T.lineTypes.modifier})`]);
  });
});
