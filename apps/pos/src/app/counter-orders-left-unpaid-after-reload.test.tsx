import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { counterOrderLeftBehind } from "../test-support/left-behind-counter-order";
import { signedInTill } from "../test-support/signed-in-till";
import { pushedOf, tableCafeServer } from "../test-support/table-cafe-server";

const T = text.sale.unpaid;
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const strip = () => document.querySelector("[data-unpaid-orders]");

async function tillWithUnpaid(options: Parameters<typeof counterOrderLeftBehind>[1] = {}) {
  const server = tableCafeServer();
  const left = counterOrderLeftBehind(server, options);
  await signedInTill(server);
  return { server, left };
}

describe("an order left unpaid on the counter when the page reloaded", () => {
  it("is offered with its number, items and total, and the counter starts a new order of its own", async () => {
    const { left } = await tillWithUnpaid({ coffees: 2 });
    await screen.findByText(T.title(left.deviceOrderNo));
    expect(strip()?.textContent?.replace(/\s/g, " ")).toContain(T.detail(2, "58.000 ₫"));
    // The counter did not take the old order: its own is the next number, empty.
    expect(screen.getByText(text.sale.orderNumber(left.deviceOrderNo + 1))).toBeTruthy();
    expect(screen.getByText(text.sale.cartEmpty)).toBeTruthy();
  });

  it("opens again on the counter with its items, and leaves the strip", async () => {
    const { left } = await tillWithUnpaid({ coffees: 2 });
    await screen.findByText(T.title(left.deviceOrderNo));
    tap(T.reopenFor(left.deviceOrderNo));
    await waitFor(() => expect(screen.queryByText(text.sale.cartEmpty)).toBeNull());
    expect(await screen.findByText(text.sale.orderNumber(left.deviceOrderNo))).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(T.title(left.deviceOrderNo))).toBeNull());
  });

  it("is cancelled through the cancel screen, then gone from the strip", async () => {
    const { server, left } = await tillWithUnpaid({ coffees: 1 });
    await screen.findByText(T.title(left.deviceOrderNo));
    tap(T.cancelFor(left.deviceOrderNo));
    await screen.findByRole("heading", { name: text.adjust.cancel.title(left.deviceOrderNo) });
    tap(text.reasons.customer_left);
    tap(text.adjust.cancel.confirm);
    await waitFor(() => expect(pushedOf(server, "order.cancel")).toHaveLength(1));
    expect(pushedOf(server, "order.cancel")[0]?.payload).toMatchObject({
      orderId: left.orderId,
      reasonCode: "customer_left",
    });
    await waitFor(() => expect(screen.queryByText(T.title(left.deviceOrderNo))).toBeNull());
  });

  it("is not offered when it belongs to another business day", async () => {
    const server = tableCafeServer();
    counterOrderLeftBehind(server, { businessDate: "2026-01-02" });
    await signedInTill(server);
    expect(strip()).toBeNull();
  });
});
