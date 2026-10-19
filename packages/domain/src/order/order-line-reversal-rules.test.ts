import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quantity, quantityFromThousandths } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { effectiveQuantity, validateLineTree } from "./order-line-tree";
import { codeOf, copyOf, item, line, reversal } from "./order-line-test-fixtures";
import type { OrderLine } from "./order-types";

const asRefund = { refundOfOrderId: "paid-order" };

describe("validateLineTree with reversing lines", () => {
  it("accepts one of two sent milk teas cancelled, its pearls cancelled through the parent", () => {
    const lines = [
      item("tea", quantity(2)),
      line("pearl", "modifier", "tea", quantity(2)),
      reversal("tea-void", "tea", quantity(-1)),
      copyOf("pearl-void", "pearl", "modifier", "tea-void", quantity(2)),
    ];
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
    expect(effectiveQuantity(lines, "tea-void")).toBe(quantity(-1));
    expect(effectiveQuantity(lines, "pearl-void")).toBe(quantity(-2));
  });

  it.each<[string, OrderLine[]]>([
    [
      "two tills each cancelling one of two teas, together exactly what was sold",
      [
        item("tea", quantity(2)),
        reversal("r1", "tea", quantity(-1)),
        reversal("r2", "tea", quantity(-1)),
      ],
    ],
    [
      "part of a weighed item cancelled",
      [item("fish", quantity("1.5")), reversal("r", "fish", quantity("-0.5"))],
    ],
    [
      "a combo cancelled with its picks",
      [
        item("combo"),
        line("burger", "combo_component", "combo"),
        reversal("r", "combo", quantity(-1)),
        copyOf("burger-void", "burger", "combo_component", "r"),
      ],
    ],
  ])("accepts %s", (_, lines) => {
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it("accepts a refund whose negative lines point at the refunded order's lines", () => {
    const lines = [
      reversal("refund-tea", "paid-tea", quantity(-1)),
      line("refund-pearl", "modifier", "refund-tea", quantity(2)),
    ];
    expect(codeOf(() => validateLineTree(lines, asRefund))).toBeUndefined();
  });

  it("refuses those same refund lines on an ordinary order, where the target must be present", () => {
    const lines = [reversal("refund-tea", "paid-tea", quantity(-1))];
    expect(codeOf(() => validateLineTree(lines))).toBe(C.reversedLineNotFound);
    expect(codeOf(() => validateLineTree(lines, { refundOfOrderId: null }))).toBe(
      C.reversedLineNotFound,
    );
  });

  it.each<[string, OrderLine[], string]>([
    ["a negative item that reverses nothing", [item("a", quantity(-1))], C.nonPositiveQuantity],
    [
      "a negative topping under a cancelling line",
      [item("a"), reversal("r", "a", quantity(-1)), line("m", "modifier", "r", quantity(-1))],
      C.nonPositiveQuantity,
    ],
    [
      "a reversal of zero units",
      [item("a"), reversal("r", "a", quantity(0))],
      C.reversalNotNegative,
    ],
    [
      "a positive line claiming to reverse",
      [item("a"), reversal("r", "a", quantity(1))],
      C.reversalNotNegative,
    ],
    [
      "a modifier claiming to reverse",
      [item("a"), { ...line("m", "modifier", "a", quantity(-1)), reversesLineId: "a" }],
      C.reversalNotRootItem,
    ],
    [
      "an order discount claiming to reverse",
      [item("a"), { ...line("d", "discount", null, quantity(-1)), reversesLineId: "a" }],
      C.reversalNotRootItem,
    ],
    [
      "a reversal of a line not on the order",
      [item("a"), reversal("r", "ghost", quantity(-1))],
      C.reversedLineNotFound,
    ],
    [
      "a reversal of a topping",
      [item("a"), line("m", "modifier", "a"), reversal("r", "m", quantity(-1))],
      C.invalidReversalTarget,
    ],
    [
      "a reversal of a reversal",
      [
        item("a", quantity(2)),
        reversal("r1", "a", quantity(-1)),
        reversal("r2", "r1", quantity(-1)),
      ],
      C.invalidReversalTarget,
    ],
    ["a line reversing itself", [reversal("r", "r", quantity(-1))], C.invalidReversalTarget],
    [
      "one cancel of more units than were sold",
      [item("a", quantity(1)), reversal("r", "a", quantity(-2))],
      C.reversalExceedsOriginal,
    ],
    [
      "two tills whose cancels together exceed what was sold",
      [
        item("a", quantity(2)),
        reversal("r1", "a", quantity(-1)),
        reversal("r2", "a", quantity(-2)),
      ],
      C.reversalExceedsOriginal,
    ],
  ])("refuses %s", (_, lines, code) => {
    expect(codeOf(() => validateLineTree(lines))).toBe(code);
  });

  it.each<[string, OrderLine[], string]>([
    [
      "a positive line claiming to reverse",
      [reversal("r", "x", quantity(1))],
      C.reversalNotNegative,
    ],
    [
      "a negative topping",
      [reversal("r", "x", quantity(-1)), line("m", "modifier", "r", quantity(-1))],
      C.nonPositiveQuantity,
    ],
    ["a negative item that reverses nothing", [item("a", quantity(-1))], C.nonPositiveQuantity],
  ])("still refuses on a refund %s", (_, lines, code) => {
    expect(codeOf(() => validateLineTree(lines, asRefund))).toBe(code);
  });
});

describe("reversals on random orders", () => {
  it("are accepted exactly when they take back no more than the line holds, in any order", () => {
    const thousandths = fc.bigInt({ min: 1n, max: 5_000n });
    fc.assert(
      fc.property(
        thousandths,
        fc.array(thousandths, { maxLength: 5 }),
        fc.boolean(),
        (sold, cancels, reverse) => {
          const reversals = cancels.map((q, i) =>
            reversal(`r${i}`, "a", quantityFromThousandths(-q)),
          );
          const lines = [item("a", quantityFromThousandths(sold)), ...reversals];
          if (reverse) lines.reverse();
          const taken = cancels.reduce((sum, q) => sum + q, 0n);
          const expected = taken > sold ? C.reversalExceedsOriginal : undefined;
          expect(codeOf(() => validateLineTree(lines))).toBe(expected);
        },
      ),
    );
  });
});
