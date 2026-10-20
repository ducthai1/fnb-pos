import { formatVnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTillMenu, NO_MENU_COPIES } from "../../features/menu/till-menu";
import { cartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import { vi as text } from "../../messages/vi";
import { MENU, tid, tillBootstrap } from "../../test-support/till-fixtures";
import { CartPeek } from "./cart-peek";

const menu = buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set());
const profile = { pricesIncludeTax: true, serviceCharge: null };
const coffees = (quantity: number): CounterOrder => ({
  orderId: tid(0x700),
  deviceOrderNo: 1,
  serviceType: "takeaway",
  tableTag: null,
  table: null,
  lines: Array.from({ length: quantity === 0 ? 0 : 1 }, () => ({
    lineId: tid(0x701),
    productId: MENU.coffee,
    variantId: null,
    modifiers: [],
    quantity,
    note: null,
  })),
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the bar that takes a phone's cashier down to the order", () => {
  it("counts the units, shows the domain's total and scrolls to the order", () => {
    const order = coffees(3);
    const view = cartView(menu, order, profile, Date.now());
    if (view.kind !== "priced") throw new Error("three coffees should price");
    render(
      <>
        <CartPeek lines={order.lines} view={view} />
        <section className="pos-cart" />
      </>,
    );
    const scrolled = vi.fn();
    document.querySelector<HTMLElement>(".pos-cart")!.scrollIntoView = scrolled;
    const due = formatVnd(view.priced.totals.amountDue);
    fireEvent.click(screen.getByRole("button", { name: text.sale.peek(3, due) }));
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it("is not there while the order is empty", () => {
    const order = coffees(0);
    render(<CartPeek lines={order.lines} view={cartView(menu, order, profile, Date.now())} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
