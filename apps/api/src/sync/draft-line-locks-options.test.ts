import { type OrderLine, basisPoints, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { mergeDraftLines } from "./draft-line-locks";
import { SYNC_ERROR_CODES } from "./sync-error-codes";

function lineOf(
  id: string,
  lineType: OrderLine["lineType"],
  parentLineId: string | null,
  extra: Partial<OrderLine> = {},
): OrderLine {
  return {
    id,
    parentLineId,
    lineType,
    productId: lineType === "item" ? "milk-tea" : null,
    variantId: null,
    modifierOptionId: null,
    nameSnapshot: id,
    unitPrice: vnd(0),
    quantity: quantity(1),
    taxRate: basisPoints(800),
    note: null,
    priceSource: "base",
    reversesLineId: null,
    ...extra,
  };
}

/** A milk tea with one topping, the topping's own ids prefixed. */
const teaWith = (topping: string, prefix = "t"): OrderLine[] => [
  lineOf("tea", "item", null, { unitPrice: vnd(45_000) }),
  lineOf(`${prefix}-${topping}`, "modifier", "tea", { modifierOptionId: topping }),
];

const sentTea = {
  sentQuantityByLineId: new Map([["tea", quantity(1)]]),
  voidedLineIds: new Set<string>(),
};

const refusalOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe("a save over an item the kitchen has", () => {
  it("refuses a different topping, which is a cancel and a new item instead", () => {
    const save = () => mergeDraftLines(teaWith("pearls"), teaWith("pudding", "f"), sentTea);
    expect(refusalOf(save)).toBe(SYNC_ERROR_CODES.lineLocked);
  });

  it("refuses a dropped topping", () => {
    const bare = [lineOf("tea", "item", null, { unitPrice: vnd(45_000) })];
    expect(refusalOf(() => mergeDraftLines(teaWith("pearls"), bare, sentTea))).toBe(
      SYNC_ERROR_CODES.lineLocked,
    );
  });

  it("takes the same topping again and lets the quantity grow", () => {
    const grown = teaWith("pearls", "f").map((line) =>
      line.id === "tea" ? { ...line, quantity: quantity(2) } : line,
    );
    const merged = mergeDraftLines(teaWith("pearls"), grown, sentTea);
    expect(merged.map((line) => line.id)).toEqual(["tea", "t-pearls"]);
    expect(merged[0]?.quantity).toBe(quantity(2));
  });
});
