import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quantityFromThousandths, subtractQuantity } from "../money";
import { type Order, reversedQuantityOf } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { computeOrderTotals } from "./compute-order-totals";
import { generatedOrder } from "./order-totals-arbitraries";
import { outcomeOf, voidUnits, withoutVoids } from "./totals-void-test-helpers";

const RUNS = { numRuns: 2_000 };
const sum = (values: readonly bigint[]) => values.reduce((acc, v) => acc + v, 0n);

/** Which sold item to void (by position among them), how much of it, and how much was sent. */
interface VoidStep {
  readonly item: number;
  readonly share: bigint;
  readonly sentShare: bigint;
}
const voidStep: fc.Arbitrary<VoidStep> = fc.record({
  item: fc.nat(),
  share: fc.bigInt({ min: 1n, max: 1_000n }),
  sentShare: fc.bigInt({ min: 0n, max: 1_000n }),
});

/** Applies each step as a valid void: at least one unit thousandth, never more than is left. */
function applyVoids(start: Order, steps: readonly VoidStep[]): Order {
  const newLineId = sequentialIds("void");
  let current = start;
  for (const step of steps) {
    const lines = current.lines;
    const sold = lines.filter(
      (l) =>
        l.lineType === "item" &&
        l.reversesLineId === null &&
        reversedQuantityOf(lines, l.id) < l.quantity,
    );
    const target = sold[step.item % Math.max(sold.length, 1)];
    if (!target) break;
    const reversed = reversedQuantityOf(lines, target.id);
    const left = subtractQuantity(target.quantity, reversed);
    const units = quantityFromThousandths(1n + ((left - 1n) * step.share) / 1_000n);
    const sent = reversed + ((target.quantity - reversed) * step.sentShare) / 1_000n;
    current = voidUnits(current, target.id, units, quantityFromThousandths(sent), newLineId);
  }
  return current;
}

const voidedOrder = fc
  .record({ g: generatedOrder, steps: fc.array(voidStep, { minLength: 1, maxLength: 6 }) })
  .map(({ g, steps }) => {
    const start = order(g.order.lines, { serviceType: g.order.serviceType });
    return { voided: applyVoids(start, steps), profile: g.profile };
  });

describe("computeOrderTotals on random orders with random voids", () => {
  it("bills exactly the order rung up without the voided units", () => {
    fc.assert(
      fc.property(voidedOrder, ({ voided, profile }) => {
        const equivalent = { ...voided, lines: withoutVoids(voided.lines) };
        expect(outcomeOf(() => computeOrderTotals(voided, profile))).toEqual(
          outcomeOf(() => computeOrderTotals(equivalent, profile)),
        );
      }),
      RUNS,
    );
  });

  it("keeps every line snapshot non-negative and adding up to the totals", () => {
    fc.assert(
      fc.property(voidedOrder, ({ voided, profile }) => {
        const outcome = outcomeOf(() => computeOrderTotals(voided, profile));
        if ("code" in outcome) return; // the discount no longer fits; checked above
        const t = computeOrderTotals(voided, profile);
        expect(sum(t.lines.map((l) => l.net))).toBe(t.netTotal);
        expect(sum(t.lines.map((l) => l.tax)) + t.serviceChargeTax).toBe(t.taxTotal);
        expect(t.lines.every((l) => l.net >= 0n && l.tax >= 0n && l.discountAllocated >= 0n)).toBe(
          true,
        );
      }),
      RUNS,
    );
  });
});
