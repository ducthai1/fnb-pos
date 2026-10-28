import { type ComboSlot, type OrderLine, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { COMBO, comboTillMenu } from "../../test-support/combo-menu";
import { MENU } from "../../test-support/till-fixtures";
import { billLinesOf } from "../printing/bill-slip";
import { cupLabelSlip } from "../printing/cup-label-slip";
import { kitchenSlips, recordablePart } from "../printing/kitchen-slips";
import { assignStoredPicks, storedComboPicks, tapComboOption } from "./combo-picks";
import { type CartLine, newCounterOrder } from "./counter-order";
import { priceCounterOrder, pricedLines } from "./price-counter-order";
import { draftPayload } from "./save-draft-command";

const menu = comboTillMenu();
const profile = { pricesIncludeTax: true, serviceCharge: null };

const sugarHalf = { groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 };
const teaL = {
  slotId: COMBO.drinkSlot,
  productId: MENU.milkTea,
  variantId: MENU.sizeL,
  modifiers: [sugarHalf, { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 1 }],
};
const croissant = {
  slotId: COMBO.bakerySlot,
  productId: MENU.cake,
  variantId: null,
  modifiers: [],
};

const breakfast = (comboPicks: NonNullable<CartLine["comboPicks"]>, units = 1): CartLine => ({
  lineId: "0199f000-0000-7000-8000-00000000c0b0",
  productId: COMBO.id,
  variantId: null,
  modifiers: [],
  comboPicks,
  quantity: units,
  note: "Ít đá",
});

const shape = (lines: readonly OrderLine[]) => {
  const names = new Map(lines.map((line) => [line.id, line.nameSnapshot]));
  return lines.map((line) => [
    line.lineType,
    line.nameSnapshot,
    line.parentLineId === null ? null : names.get(line.parentLineId),
    line.unitPrice,
  ]);
};

describe("a combo on the cart", () => {
  it("is priced as the server stores it: the combo, each pick at its upcharge, then its options", () => {
    const lines = pricedLines(menu, breakfast([croissant, teaL]), 0);
    expect(shape(lines)).toEqual([
      ["item", "Combo sáng", null, vnd(50_000)],
      ["combo_component", "Trà sữa trân châu (L)", "Combo sáng", vnd(10_000)],
      ["modifier", "50% đường", "Trà sữa trân châu (L)", vnd(0)],
      ["modifier", "Trân châu đen", "Trà sữa trân châu (L)", vnd(5_000)],
      ["combo_component", "Bánh croissant", "Combo sáng", vnd(0)],
    ]);
    const order = { ...newCounterOrder("order", 1), lines: [breakfast([croissant, teaL], 2)] };
    // (50.000 + 10.000 + 5.000) × 2: every pick and option counts per combo.
    expect(priceCounterOrder(menu, order, profile, 0).totals.grossTotal).toBe(vnd(130_000));
  });

  it("is refused by the domain while a required slot is empty, which leaves the cart unpriceable", () => {
    expect(() => pricedLines(menu, breakfast([croissant]), 0)).toThrow(/must be filled/);
  });

  it("goes to the server with its picks and their options, never a price", () => {
    const order = { ...newCounterOrder("order", 1), lines: [breakfast([teaL, croissant])] };
    expect(draftPayload(order).lines[0]?.comboPicks).toEqual([teaL, croissant]);
    expect(JSON.stringify(draftPayload(order))).not.toContain("upcharge");
  });

  it("comes back from the stored lines with the same picks, slots and options", () => {
    const picks = [teaL, croissant, croissant];
    const tree = pricedLines(menu, breakfast(picks), 0);
    const item = tree[0];
    if (item === undefined) throw new Error("no item line");
    expect(storedComboPicks(menu, item, tree)).toEqual(picks);
  });
});

describe("which slot a stored pick filled", () => {
  const slot = (id: string, minSelect: number, upcharge: number): ComboSlot => ({
    id,
    name: id,
    minSelect,
    maxSelect: 1,
    options: [{ productId: "tea", variantId: null, upcharge: vnd(upcharge) }],
  });
  const stored = (unitPrice: number) => ({
    line: { productId: "tea", variantId: null, unitPrice: vnd(unitPrice) } as OrderLine,
    modifiers: [],
  });
  const slotsOf = (picks: ReturnType<typeof assignStoredPicks>) => picks.map((p) => p.slotId);

  it("tells a product offered in two slots apart by the upcharge it was sold at", () => {
    const slots = [slot("optional", 0, 0), slot("required", 1, 5_000)];
    expect(slotsOf(assignStoredPicks(slots, [stored(5_000)]))).toEqual(["required"]);
    expect(slotsOf(assignStoredPicks(slots, [stored(0), stored(5_000)]))).toEqual([
      "optional",
      "required",
    ]);
  });

  it("still finds the slots when the upcharge changed since, and gives none when no cut fits", () => {
    const slots = [slot("optional", 0, 0), slot("required", 1, 5_000)];
    expect(slotsOf(assignStoredPicks(slots, [stored(3_000)]))).toEqual(["required"]);
    expect(slotsOf(assignStoredPicks(slots, [stored(0), stored(0), stored(0)]))).toEqual([
      "",
      "",
      "",
    ]);
  });
});

describe("tapping a combo's options", () => {
  const drink = menu.productsById.get(COMBO.id)?.combo?.slots[0];
  const bakery = menu.productsById.get(COMBO.id)?.combo?.slots[1];
  if (drink === undefined || bakery === undefined) throw new Error("the combo has two slots");
  const [teaM, teaLOption] = drink.options;
  const [cake] = bakery.options;
  if (teaM === undefined || teaLOption === undefined || cake === undefined) throw new Error("x");

  it("swaps the one drink of a slot of one, and stops a slot of two at two", () => {
    const one = tapComboOption([], drink, teaM) ?? [];
    const swapped = tapComboOption(one, drink, teaLOption) ?? [];
    expect(swapped.map((pick) => pick.variantId)).toEqual([MENU.sizeL]);
    const two = tapComboOption(tapComboOption(swapped, bakery, cake) ?? [], bakery, cake) ?? [];
    expect(two.filter((pick) => pick.slotId === COMBO.bakerySlot)).toHaveLength(2);
    expect(tapComboOption(two, bakery, cake)).toBeNull();
  });
});

describe("kitchen tickets of a combo made at two stations", () => {
  const order = { ...newCounterOrder("order", 1), lines: [breakfast([teaL, croissant])] };
  const sale = {
    order,
    priced: priceCounterOrder(menu, order, profile, 0),
    businessDate: "2026-10-28",
    version: 1,
  };
  const [bar, kitchen] = kitchenSlips(menu, sale, 0);

  it("prints the drink at the bar and the croissant in the kitchen, each under the combo", () => {
    expect([bar?.stationId, kitchen?.stationId]).toEqual([MENU.bar, COMBO.kitchen]);
    expect(bar?.job.preview).toContain("Trà sữa trân châu (L)");
    expect(bar?.job.preview).not.toContain("Bánh croissant");
    expect(kitchen?.job.preview).toContain("Combo sáng");
    expect(kitchen?.job.preview).toContain("Bánh croissant");
  });

  it("records the combo as sent once, with the last ticket, and only if the first printed", () => {
    if (bar === undefined || kitchen === undefined) throw new Error("two tickets");
    expect(bar.lines).toEqual([]);
    expect(recordablePart(bar, new Set())).toBeNull();
    expect(kitchen.lines.map((line) => line.quantity)).toEqual(["1"]);
    expect(recordablePart(kitchen, new Set())?.sent).toEqual([
      { lineId: order.lines[0]?.lineId, sentQuantity: quantity(1), sentNote: "Ít đá" },
    ]);
    expect(recordablePart(kitchen, new Set([bar.job.jobId]))).toBeNull();
  });
});

describe("the slips of a paid combo", () => {
  const order = { ...newCounterOrder("order", 1), lines: [breakfast([teaL, croissant], 2)] };
  const priced = priceCounterOrder(menu, order, profile, 0);
  const sale = {
    order,
    priced,
    chargeProfile: profile,
    businessDate: "2026-10-28",
    version: 2,
    tenders: [],
    payments: [{ method: "cash" as const, amount: priced.totals.amountDue }],
    change: vnd(0),
    paidAt: 0,
    cashierName: "Lan",
  };

  it("bills the combo with its picks under it and each pick's options a step further in", () => {
    const [combo] = billLinesOf(menu, priced);
    expect(combo?.children.map((child) => [child.name, child.depth, child.amount])).toEqual([
      ["Trà sữa trân châu (L)", 1, vnd(20_000)],
      ["50% đường", 2, null],
      ["Trân châu đen", 2, vnd(10_000)],
      ["Bánh croissant", 1, null],
    ]);
  });

  it("labels each cup of the drink picked in the combo, with its options and the combo's note", () => {
    const labels = cupLabelSlip(menu, sale, 0);
    expect(labels?.preview).toContain("Tra sua tran chau");
    expect(labels?.preview).toContain("50% duong");
    expect(labels?.preview).toContain("1/2");
    expect(labels?.preview).not.toContain("Combo sang");
  });
});
