import { describe, expect, it } from "vitest";
import { quantity, vnd } from "../money";
import type { OrderLine } from "../order";
import { codeOf } from "../order/order-line-test-fixtures";
import { computeOrderTotals } from "./compute-order-totals";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";
import {
  TAX_EXCLUSIVE,
  VAT_10,
  VAT_8,
  componentLine,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
} from "./totals-test-helpers";

const discountByLine = (lines: OrderLine[]) =>
  Object.fromEntries(
    computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE).lines.map((l) => [
      l.lineId,
      l.discountAllocated,
    ]),
  );

// A milk tea with pearl (104.000 at 8%) and a coffee at the same 8%.
const teaAndCoffee = [
  itemLine("tea", 45_000, VAT_8, quantity(2)),
  modifierLine("pearl", "tea", 7_000, VAT_8),
  itemLine("coffee", 30_000, VAT_8),
];

describe("a discount under an item", () => {
  it("reduces only that item and its children, not other goods at the same rate", () => {
    const lines = [...teaAndCoffee, discountLine("tea-off", "tea", 5_200, VAT_8)];
    // 5.200 per tea × 2 teas = 10.400, spread 90.000 : 14.000
    expect(discountByLine(lines)).toEqual({
      tea: vnd(9_000),
      pearl: vnd(1_400),
      coffee: vnd(0),
    });
  });

  it("may take the item down to zero but not borrow from other items at its rate", () => {
    const wholeTea = [...teaAndCoffee, discountLine("tea-off", "tea", 52_000, VAT_8)];
    expect(computeOrderTotals(orderOf(wholeTea), TAX_EXCLUSIVE).netTotal).toBe(vnd(30_000));
    // one đồng more per tea: the coffee's 30.000 at 8% does not count
    const tooMuch = [...teaAndCoffee, discountLine("tea-off", "tea", 52_001, VAT_8)];
    expect(codeOf(() => computeOrderTotals(orderOf(tooMuch), TAX_EXCLUSIVE))).toBe(
      C.discountExceedsBase,
    );
  });

  it("reduces only the item's goods at the discount's own rate", () => {
    // a combo at 10% with a beer component at 8%: a 10% discount leaves the beer alone
    const combo = [
      itemLine("combo", 80_000, VAT_10),
      componentLine("beer", "combo", 20_000, VAT_8),
      discountLine("combo-off", "combo", 8_000, VAT_10),
    ];
    expect(discountByLine(combo)).toEqual({ combo: vnd(8_000), beer: vnd(0) });
    const onTheBeer = [...combo, discountLine("beer-off", "combo", 20_000, VAT_8)];
    expect(discountByLine(onTheBeer)).toEqual({ combo: vnd(8_000), beer: vnd(20_000) });
  });

  it("is taken before the order discount, which then applies to what is left", () => {
    const lines = [
      ...teaAndCoffee,
      discountLine("tea-off", "tea", 52_000, VAT_8),
      discountLine("order-off", null, 30_000, VAT_8),
    ];
    expect(discountByLine(lines)).toEqual({
      tea: vnd(90_000),
      pearl: vnd(14_000),
      coffee: vnd(30_000),
    });
  });
});
