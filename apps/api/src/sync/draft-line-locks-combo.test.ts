import { type OrderLine, basisPoints, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { mergeDraftLines } from "./draft-line-locks";
import { productsAdding } from "./draft-additions";
import { SYNC_ERROR_CODES } from "./sync-error-codes";

function lineOf(
  id: string,
  lineType: OrderLine["lineType"],
  parentLineId: string | null,
  productId: string | null,
  extra: Partial<OrderLine> = {},
): OrderLine {
  return {
    id,
    parentLineId,
    lineType,
    productId,
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

/** A combo of one tea (with a shot of syrup) and one cake, its child ids prefixed. */
const breakfast = (prefix: string, drink = "tea", units = 1): OrderLine[] => [
  lineOf("combo", "item", null, "breakfast", { unitPrice: vnd(50_000), quantity: quantity(units) }),
  lineOf(`${prefix}-drink`, "combo_component", "combo", drink),
  lineOf(`${prefix}-syrup`, "modifier", `${prefix}-drink`, null, { modifierOptionId: "syrup" }),
  lineOf(`${prefix}-cake`, "combo_component", "combo", "cake"),
];

const sentCombo = {
  sentQuantityByLineId: new Map([["combo", quantity(1)]]),
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

describe("a save over a combo the kitchen has", () => {
  it("keeps the combo with its picks and their options as stored, and lets it grow", () => {
    const merged = mergeDraftLines(breakfast("stored"), breakfast("fresh", "tea", 2), sentCombo);
    expect(merged.map((line) => line.id)).toEqual([
      "combo",
      "stored-drink",
      "stored-syrup",
      "stored-cake",
    ]);
    expect(merged[0]?.quantity).toBe(quantity(2));
  });

  it("refuses a pick swapped for another product", () => {
    const swapped = breakfast("fresh", "coffee");
    expect(refusalOf(() => mergeDraftLines(breakfast("stored"), swapped, sentCombo))).toBe(
      SYNC_ERROR_CODES.lineLocked,
    );
  });

  it("refuses a pick's option dropped", () => {
    const plain = breakfast("fresh").filter((line) => line.lineType !== "modifier");
    expect(refusalOf(() => mergeDraftLines(breakfast("stored"), plain, sentCombo))).toBe(
      SYNC_ERROR_CODES.lineLocked,
    );
  });

  it("takes a fresh combo the kitchen does not have with every level of it", () => {
    const merged = mergeDraftLines([], breakfast("fresh"), {
      sentQuantityByLineId: new Map(),
      voidedLineIds: new Set(),
    });
    expect(merged).toHaveLength(4);
  });
});

describe("products a save adds, for the sold-out check", () => {
  it("names a new combo and each of its picks", () => {
    expect(productsAdding([], breakfast("fresh"))).toEqual(["breakfast", "tea", "cake"]);
  });

  it("names only the pick swapped into a combo that kept its units", () => {
    expect(productsAdding(breakfast("stored"), breakfast("fresh", "coffee"))).toEqual(["coffee"]);
    expect(productsAdding(breakfast("stored"), breakfast("fresh"))).toEqual([]);
  });
});
