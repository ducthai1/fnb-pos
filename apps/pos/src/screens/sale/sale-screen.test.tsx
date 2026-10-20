import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTillMenu, NO_MENU_COPIES } from "../../features/menu/till-menu";
import { cartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import { vi as text } from "../../messages/vi";
import { MENU, tid, tillBootstrap } from "../../test-support/till-fixtures";
import { SaleScreen } from "./sale-screen";

const menu = buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set());
const profile = { pricesIncludeTax: true, serviceCharge: null };
const order = (cups: number): CounterOrder => ({
  orderId: tid(0x710),
  deviceOrderNo: 1,
  serviceType: "takeaway",
  tableTag: null,
  table: null,
  lines: Array.from({ length: cups === 0 ? 0 : 1 }, () => ({
    lineId: tid(0x711),
    productId: MENU.coffee,
    variantId: null,
    modifiers: [],
    quantity: cups,
    note: null,
  })),
});

function till(cups: number) {
  const onCheckout = vi.fn();
  const shown = order(cups);
  render(
    <SaleScreen
      header={null}
      menu={menu}
      now={Date.now()}
      order={shown}
      view={cartView(menu, shown, profile, Date.now())}
      saveFailed={false}
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      onServiceType={() => {}}
      onCheckout={onCheckout}
    />,
  );
  return onCheckout;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the till's keyboard on the selling screen", () => {
  it("F2 puts the cursor in the search, wherever it was", () => {
    till(1);
    fireEvent.keyDown(window, { key: text.sale.keys.search });
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: text.sale.search }));
  });

  it("F9 pays like the button, once per press, and not while there is nothing to pay", () => {
    const onCheckout = till(2);
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    fireEvent.keyDown(window, { key: text.sale.keys.pay, repeat: true });
    expect(onCheckout).toHaveBeenCalledOnce();
    document.body.innerHTML = "";
    const idle = till(0);
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    expect(idle).not.toHaveBeenCalled();
  });

  it("keeps the button's name: the key printed on it is not read out", () => {
    till(1);
    expect(screen.getByRole("button", { name: text.sale.checkout })).toBeTruthy();
  });
});

describe("the menu beside the order", () => {
  it("counts on a tile the units of it the order holds, and nothing on the others", () => {
    till(2);
    const coffee = screen.getByRole("button", { name: /^Cà phê sữa/ });
    expect(coffee.querySelector("[data-in-cart]")?.textContent).toBe("2");
    const tea = screen.getByRole("button", { name: /^Trà sữa trân châu/ });
    expect(tea.querySelector("[data-in-cart]")).toBeNull();
  });
});
