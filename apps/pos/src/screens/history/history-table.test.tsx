import type { EntityView } from "@fnb/sync-client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as spy } from "vitest";
import { type HistoryEntry, orderHistory } from "../../features/history/order-history";
import { tillOrderSnapshot } from "../../features/order/order-snapshot-for-till";
import { priceCounterOrder } from "../../features/order/price-counter-order";
import { vi } from "../../messages/vi";
import { PLACE, SALE_MENU, SOLD } from "../../test-support/paid-sale-fixture";
import { tid } from "../../test-support/till-fixtures";
import { OrderHistoryScreen } from "./order-history-screen";

const H = vi.history;
const AT = Date.UTC(2026, 9, 20, 3, 0);
const TODAY = "2026-10-20";
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };

/** An order of the day, opened and (when paid) paid at the given UTC times. */
function orderView(
  no: number,
  status: "draft" | "paid",
  times: { openedAt: string; paidAt?: string },
): EntityView {
  const order = { ...SOLD, orderId: tid(0x8000 + no), deviceOrderNo: no };
  const priced = priceCounterOrder(SALE_MENU, order, PROFILE, AT);
  const snapshot = {
    ...tillOrderSnapshot(PLACE, order, priced, {
      status,
      version: 2,
      businessDate: TODAY,
      chargeProfile: PROFILE,
      payments: status === "paid" ? [{ method: "cash", amount: priced.totals.amountDue }] : [],
      sent: [],
    }),
    openedAt: times.openedAt,
    paidAt: times.paidAt ?? null,
  };
  return {
    entity: "order",
    entityId: order.orderId,
    snapshot: snapshot as EntityView["snapshot"],
    source: "server",
    serverVersion: 2,
  };
}

// 10:15 and 10:05 in Vietnam for the sales, a draft opened at 10:40 and not paid.
const VIEWS = [
  orderView(1, "paid", {
    openedAt: "2026-10-20T03:01:00.000Z",
    paidAt: "2026-10-20T03:15:00.000Z",
  }),
  orderView(2, "draft", { openedAt: "2026-10-20T03:40:00.000Z" }),
  orderView(3, "paid", {
    openedAt: "2026-10-20T02:58:00.000Z",
    paidAt: "2026-10-20T03:05:00.000Z",
  }),
];

function showHistory() {
  const entries = orderHistory(VIEWS, TODAY, PLACE.deviceId);
  const on = { onReopen: spy.fn(), onRefund: spy.fn(), onReprint: spy.fn() };
  render(
    <OrderHistoryScreen
      header={null}
      day={TODAY}
      entries={entries}
      filter="all"
      search=""
      onFilter={() => {}}
      onSearch={() => {}}
      onBack={() => {}}
      layout="table"
      {...on}
    />,
  );
  const table = screen.getByRole("table", { name: H.tableLabel });
  const rows = within(table).getAllByRole("row").slice(1);
  return { on, table, rows };
}

describe("the order history as a table", () => {
  it("names the business day it lists day/month/year, as Vietnamese write it", () => {
    showHistory();
    expect(screen.getByText(H.day(TODAY)).textContent).toBe("Ngày 20/10/2026");
    expect(screen.queryByText(/2026-10-20/)).toBeNull();
  });

  it("has the columns time, number, where, status and total", () => {
    const { table } = showHistory();
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(heads).toEqual(Object.values(H.columns));
  });

  it("lists the latest first, a sale by when it was paid and a draft by when it was opened", () => {
    const { rows } = showHistory();
    expect(rows.map((row) => row.getAttribute("data-history-order"))).toEqual(["2", "1", "3"]);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "10:40",
      "10:15",
      "10:05",
    ]);
  });

  it("opens an order's drawer from its row, with the actions there instead of on the row", () => {
    const { on, rows } = showHistory();
    expect(within(rows[1]!).queryByRole("button", { name: H.reprint(1) })).toBeNull();
    fireEvent.click(rows[1]!);
    const drawer = screen.getByRole("dialog", { name: H.orderLine(1) });
    fireEvent.click(within(drawer).getByRole("button", { name: H.reprint(1) }));
    expect(on.onReprint).toHaveBeenCalledTimes(1);
    expect((on.onReprint.mock.calls[0]?.[0] as HistoryEntry).order.deviceOrderNo).toBe(1);
    expect(within(drawer).getByRole("button", { name: H.refund(1) })).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: H.reopen(1) })).toBeNull();
  });

  it("offers to reopen a draft from its drawer, reached by its number's button", () => {
    const { on } = showHistory();
    fireEvent.click(screen.getByRole("button", { name: H.openOrder(2) }));
    const drawer = screen.getByRole("dialog", { name: H.orderLine(2) });
    expect(within(drawer).queryByRole("button", { name: H.reprint(2) })).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: H.reopen(2) }));
    expect(on.onReopen).toHaveBeenCalledTimes(1);
  });
});
