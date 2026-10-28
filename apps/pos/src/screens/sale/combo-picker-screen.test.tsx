import { posProductSchema } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TillMenu } from "../../features/menu/till-menu";
import type { CartLine } from "../../features/order/counter-order";
import { vi as text } from "../../messages/vi";
import {
  BREAKFAST_COMBO,
  COMBO,
  HOSTILE_COMBO,
  comboTillMenu,
} from "../../test-support/combo-menu";
import { hostileTillMenu } from "../../test-support/hostile-menu";
import { MENU } from "../../test-support/till-fixtures";
import { ModifierPickerScreen } from "./modifier-picker-screen";

const C = text.sale.combo;
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const alertText = () => screen.queryByRole("alert")?.textContent ?? null;

function openPicker(menu: TillMenu, wire = BREAKFAST_COMBO) {
  const added: CartLine[] = [];
  const product = posProductSchema.parse(wire);
  render(
    <ModifierPickerScreen
      header={null}
      menu={menu}
      product={product}
      now={Date.now()}
      onAdd={(line) => added.push(line)}
      onCancel={() => {}}
    />,
  );
  return added;
}

describe("the combo picker", () => {
  it("adds nothing until the drink is chosen, then asks for that drink's own sugar", () => {
    const added = openPicker(comboTillMenu());
    tap(text.sale.picker.addNoPrice);
    expect(alertText()).toBe(C.required("Đồ uống"));

    // The upcharge is on the chip, and the drink's own options open under the slot.
    tap(/^Trà sữa trân châu \(L\).*\+10\.000/);
    const options = screen.getByRole("region", { name: C.pickOptions("Trà sữa trân châu (L)") });
    tap(text.sale.picker.addNoPrice);
    expect(alertText()).toBe(
      C.pickProblem("Trà sữa trân châu (L)", text.sale.modifierErrors.required("Đường")),
    );
    fireEvent.click(within(options).getByRole("button", { name: "50% đường" }));
    tap(/^Bánh croissant/);
    tap(/^Bánh croissant/);
    // A slot of two takes no third.
    tap(/^Bánh croissant/);
    expect(alertText()).toBe(C.slotFull("Bánh", 2));

    // 50.000 + 10.000 for the L, priced by the domain on the button.
    tap(text.sale.picker.add(formatVnd(vnd(60_000))));
    expect(added).toEqual([
      expect.objectContaining({
        productId: COMBO.id,
        modifiers: [],
        quantity: 1,
        comboPicks: [
          {
            slotId: COMBO.drinkSlot,
            productId: MENU.milkTea,
            variantId: MENU.sizeL,
            modifiers: [{ groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 }],
          },
          { slotId: COMBO.bakerySlot, productId: MENU.cake, variantId: null, modifiers: [] },
          { slotId: COMBO.bakerySlot, productId: MENU.cake, variantId: null, modifiers: [] },
        ],
      }),
    ]);
  });

  it("swaps the drink of a slot of one, and takes a croissant back with its minus", () => {
    openPicker(comboTillMenu());
    tap(/^Cà phê sữa/);
    tap(/^Trà sữa trân châu \(M\)/);
    const pressed = screen
      .getAllByRole("button", { pressed: true })
      .map((button) => button.textContent ?? "");
    expect(pressed.some((name) => name.startsWith("Trà sữa trân châu (M)"))).toBe(true);
    expect(pressed.some((name) => name.startsWith("Cà phê sữa"))).toBe(false);
    tap(/^Bánh croissant/);
    tap(text.sale.picker.fewer("Bánh croissant"));
    expect(
      screen.getByRole("button", { name: /^Bánh croissant/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("cannot pick a sold-out croissant", () => {
    openPicker(comboTillMenu(true));
    const cake = screen.getByRole("button", { name: /^Bánh croissant/ });
    expect(cake.hasAttribute("disabled")).toBe(true);
    expect(cake.textContent).toContain(text.sale.soldOut);
  });

  it("fills a required slot that offers one drink, and shows every option of the worst names", () => {
    const menu = hostileTillMenu();
    openPicker(menu, HOSTILE_COMBO);
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    // The hostile drink's 30 toppings, all offered under the pick.
    expect(document.querySelectorAll(".pos-combo-pick .pos-chip").length).toBeGreaterThanOrEqual(
      30,
    );
    expect(screen.getByText(text.sale.soldOut)).toBeTruthy();
  });
});
