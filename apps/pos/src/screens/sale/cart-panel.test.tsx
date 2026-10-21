import { formatVnd } from "@fnb/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cartView } from "../../features/order/cart-view";
import { priceCounterOrder } from "../../features/order/price-counter-order";
import { vi as text } from "../../messages/vi";
import { HOSTILE_MENU_NAMES, hostileTillMenu } from "../../test-support/hostile-menu";
import { HOSTILE_ORDER } from "../../test-support/hostile-order";
import { CartPanel } from "./cart-panel";

const menu = hostileTillMenu();
const PROFILE = { pricesIncludeTax: false, serviceCharge: null };
const AT = Date.UTC(2026, 9, 20, 3, 0);

function renderCart(order = HOSTILE_ORDER) {
  const calls: { quantity: [string, number][]; removed: string[] } = { quantity: [], removed: [] };
  render(
    <CartPanel
      order={order}
      view={cartView(menu, order, PROFILE, AT)}
      onQuantity={(lineId, quantity) => calls.quantity.push([lineId, quantity])}
      onRemove={(lineId) => calls.removed.push(lineId)}
      onServiceType={() => {}}
      onCheckout={() => {}}
    />,
  );
  return calls;
}

describe("the cart with the worst order a shop can ring up", () => {
  it("shows the domain's amount due, to the đồng, for 999 cups with 31 options each", () => {
    renderCart();
    const priced = priceCounterOrder(menu, HOSTILE_ORDER, PROFILE, AT);
    const due = document.querySelector("[data-amount-due]");
    expect(due?.getAttribute("data-amount-due")).toBe(String(priced.totals.amountDue));
    expect(due?.textContent).toBe(formatVnd(priced.totals.amountDue));
    const first = screen
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes(HOSTILE_MENU_NAMES.option));
    expect(within(first!).getAllByText(/^\+ /)).toHaveLength(31);
  });

  it("keeps a note's lines and the table number of a dine-in order", () => {
    renderCart();
    const note = screen.getByText(
      (_, element) => element?.classList.contains("pos-cart-line__note") ?? false,
    );
    expect(note.textContent).toBe(`${text.sale.note}: ${HOSTILE_MENU_NAMES.note}`);
    expect(screen.getByLabelText(text.sale.tableTag)).toHaveProperty(
      "value",
      HOSTILE_ORDER.tableTag,
    );
  });

  it("allows no more than 999 of a line and no fewer than one", () => {
    const calls = renderCart();
    const big = `${HOSTILE_MENU_NAMES.product} (L)`;
    expect(screen.getByRole("button", { name: text.sale.more(big) })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: text.sale.less(big) }));
    expect(calls.quantity).toEqual([[HOSTILE_ORDER.lines[0]?.lineId, 998]]);
    expect(screen.getByRole("button", { name: text.sale.less("Cà phê sữa") })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: text.adjust.tools.lineMenu("Cà phê sữa") }));
    fireEvent.click(screen.getByRole("button", { name: text.sale.remove("Cà phê sữa") }));
    expect(calls.removed).toEqual([HOSTILE_ORDER.lines[1]?.lineId]);
  });

  it("blocks payment and says why when a product left the menu under the open order", () => {
    const gone = {
      ...HOSTILE_ORDER,
      lines: [{ ...HOSTILE_ORDER.lines[1]!, productId: "0199f000-0000-7000-8000-0000000fffff" }],
    };
    renderCart(gone);
    expect(screen.getByRole("alert").textContent).toBe(text.sale.productGone);
    expect(screen.getByRole("button", { name: text.sale.checkout })).toHaveProperty(
      "disabled",
      true,
    );
    expect(document.querySelector("[data-amount-due]")).toBeNull();
  });
});
