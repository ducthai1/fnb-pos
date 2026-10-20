import { posProductSchema } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CartLine } from "../../features/order/counter-order";
import { vi as text } from "../../messages/vi";
import {
  HOSTILE_MENU_NAMES,
  HOSTILE_PRODUCT,
  hostileTillMenu,
} from "../../test-support/hostile-menu";
import { RULES, RULES_TEA } from "../../test-support/rule-products";
import { MENU } from "../../test-support/till-fixtures";
import { ModifierPickerScreen } from "./modifier-picker-screen";

const menu = hostileTillMenu();
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const alertText = () => screen.queryByRole("alert")?.textContent ?? null;

function openPicker(product = RULES_TEA, onCancel = () => {}) {
  const added: CartLine[] = [];
  render(
    <ModifierPickerScreen
      header={null}
      menu={{ ...menu, productsById: new Map([...menu.productsById, [product.id, product]]) }}
      product={product}
      now={Date.now()}
      onAdd={(line) => added.push(line)}
      onCancel={onCancel}
    />,
  );
  return added;
}

describe("the option picker", () => {
  it("shows the product's category and the price it starts from under its name", () => {
    const hostile = posProductSchema.parse(HOSTILE_PRODUCT);
    openPicker(hostile);
    const head = document.querySelector(".pos-picker-head");
    expect(head?.textContent).toContain(HOSTILE_MENU_NAMES.category);
    expect(head?.textContent).toContain(formatVnd(vnd(0)));
    // The name is the title; the head does not say it a second time.
    expect(head?.textContent).not.toContain(HOSTILE_MENU_NAMES.product);
  });

  it("explains in Vietnamese what is missing and adds nothing until the required pick is made", () => {
    const added = openPicker();
    tap(text.sale.picker.addNoPrice);
    expect(alertText()).toBe(text.sale.modifierErrors.required("Đường"));
    expect(added).toEqual([]);

    tap("50% đường");
    tap(/^Trân châu đen/);
    tap(text.sale.more(RULES_TEA.name));
    fireEvent.change(screen.getByLabelText(text.sale.note), {
      target: { value: "  Ít ngọt\nmang về  " },
    });
    // M 35.000 + 5.000 pearls, two cups: priced by the domain on the button.
    tap(text.sale.picker.add(formatVnd(vnd(80_000))));
    expect(added).toEqual([
      {
        lineId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        productId: RULES_TEA.id,
        variantId: MENU.sizeM,
        modifiers: [
          { groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 },
          { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 1 },
        ],
        quantity: 2,
        note: "Ít ngọt\nmang về",
      },
    ]);
  });

  it("refuses a third topping in M on the tap itself, and takes it once L is chosen", () => {
    openPicker();
    tap(/^Thạch dừa/);
    tap(/^Thạch dừa/);
    tap(/^Trân châu đen/);
    expect(alertText()).toBe(text.sale.modifierErrors.tooMany("Topping", 2));
    expect(
      screen.getByRole("button", { name: /^Trân châu đen/ }).getAttribute("aria-pressed"),
    ).toBe("false");

    tap("L");
    tap(/^Trân châu đen/);
    expect(alertText()).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Trân châu đen/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the cheese foam in L only, and asks for two sides there", () => {
    const added = openPicker();
    expect(screen.queryByRole("button", { name: /^Kem cheese/ })).toBeNull();
    tap("L");
    tap("100% đường");
    tap(/^Kem cheese/);
    tap(/^Bánh quy/);
    tap(/^Thêm vào đơn/);
    expect(alertText()).toBe(text.sale.modifierErrors.tooFew("Bánh kèm", 2));
    tap(/^Brownie/);
    tap(/^Thêm vào đơn/);
    expect(added).toHaveLength(1);
    expect(added[0]?.modifiers.map((choice) => choice.optionId)).toEqual([
      MENU.sugarFull,
      RULES.cheese,
      RULES.cookie,
      RULES.brownie,
    ]);
  });

  it("takes all 30 toppings of the 80-character drink, each named in full", () => {
    const hostile = posProductSchema.parse(HOSTILE_PRODUCT);
    const added = openPicker(hostile);
    expect(screen.getByRole("heading", { name: HOSTILE_MENU_NAMES.product })).toBeTruthy();
    tap("100% đường");
    const group = hostile.modifierGroups.at(-1)!;
    // The option's name, then its price or nothing: "… 1" must not also match "… 10".
    for (const option of group.options) tap(new RegExp(`^${option.name}( \\+|$)`));
    expect(alertText()).toBeNull();
    tap(/^Thêm vào đơn/);
    expect(added[0]?.modifiers).toHaveLength(31);
  });

  it("goes back on Esc like the button, whose name stays without the key", () => {
    let cancelled = 0;
    openPicker(RULES_TEA, () => (cancelled += 1));
    fireEvent.keyDown(window, { key: "Escape", isComposing: true });
    expect(cancelled).toBe(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(cancelled).toBe(1);
    expect(screen.getByRole("button", { name: text.sale.picker.cancel })).toBeTruthy();
  });
});
