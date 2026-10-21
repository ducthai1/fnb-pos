import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { cartView } from "../../features/order/cart-view";
import { vi as text } from "../../messages/vi";
import { hostileTillMenu } from "../../test-support/hostile-menu";
import { HOSTILE_ORDER } from "../../test-support/hostile-order";
import { CartRow } from "./cart-row";

const menu = hostileTillMenu();
const AT = Date.UTC(2026, 9, 20, 3, 0);
const COFFEE = "Cà phê sữa";
const line = HOSTILE_ORDER.lines[1]!;
const S = text.sale;
const T = text.adjust.tools;
const button = (name: string) => screen.getByRole("button", { name });
const noButton = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull();

function renderRow(options: { locked?: boolean; adjust?: boolean; badge?: ReactNode } = {}) {
  const calls = { quantity: [] as number[], removed: 0, voided: [] as string[], discounted: 0 };
  const view = cartView(menu, HOSTILE_ORDER, { pricesIncludeTax: false, serviceCharge: null }, AT);
  render(
    <ul>
      <CartRow
        line={{ ...line, quantity: 2 }}
        priced={view.kind === "priced" ? view.priced.lines : []}
        view={view}
        locked={options.locked ?? false}
        badge={options.badge}
        adjust={
          options.adjust === false
            ? undefined
            : {
                onVoid: (lineId) => void calls.voided.push(lineId),
                onDiscount: () => void calls.discounted++,
              }
        }
        onQuantity={(_, quantity) => void calls.quantity.push(quantity)}
        onRemove={() => void calls.removed++}
      />
    </ul>,
  );
  return calls;
}

describe("a line of the cart, in one row", () => {
  it("puts the stepper and the amount beside the name, the options under it", () => {
    const calls = renderRow();
    const row = document.querySelector(".pos-cart-line__row") as HTMLElement;
    expect(within(row).getByRole("group", { name: S.lineQuantity(COFFEE) })).toBeTruthy();
    expect(row.querySelector(".pos-cart-line__amount")?.textContent).not.toBe("");
    expect(row.querySelector(".pos-cart-line__details .pos-cart-line__children")).not.toBeNull();
    fireEvent.click(button(S.more(COFFEE)));
    fireEvent.click(button(S.less(COFFEE)));
    expect(calls.quantity).toEqual([3, 1]);
  });

  it("keeps remove, void and discount behind the row's …, each naming the item", () => {
    const calls = renderRow();
    const more = button(T.lineMenu(COFFEE));
    expect(more.getAttribute("aria-expanded")).toBe("false");
    noButton(S.remove(COFFEE));
    noButton(T.void(COFFEE));
    noButton(T.discount(COFFEE));
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button(T.void(COFFEE)));
    fireEvent.click(button(T.discount(COFFEE)));
    fireEvent.click(button(S.remove(COFFEE)));
    expect(calls).toMatchObject({ voided: [line.lineId], discounted: 1, removed: 1 });
  });

  it("closes the actions on Esc and gives the focus back to the …", () => {
    renderRow();
    const more = button(T.lineMenu(COFFEE));
    fireEvent.click(more);
    const voidButton = button(T.void(COFFEE));
    voidButton.focus();
    fireEvent.keyDown(voidButton, { key: "Escape" });
    noButton(T.void(COFFEE));
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("holds a locked line as stored: no stepper, no remove, still void and discount", () => {
    renderRow({ locked: true, badge: <span data-badge>sent</span> });
    expect(screen.getByText(`${COFFEE} ×2`)).toBeTruthy();
    expect(screen.queryByRole("group", { name: S.lineQuantity(COFFEE) })).toBeNull();
    expect(document.querySelector(".pos-cart-line__details [data-badge]")).not.toBeNull();
    fireEvent.click(button(T.lineMenu(COFFEE)));
    noButton(S.remove(COFFEE));
    expect(button(T.void(COFFEE))).toBeTruthy();
  });

  it("offers no … on a locked line of an order that cannot be adjusted", () => {
    renderRow({ locked: true, adjust: false });
    noButton(T.lineMenu(COFFEE));
  });
});
