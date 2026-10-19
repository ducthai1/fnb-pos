import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { order } from "../order/order-line-test-fixtures";
import { computeOrderTotals } from "./compute-order-totals";
import { generatedOrder } from "./order-totals-arbitraries";
import { applyVoids, voidStep } from "./order-lifecycle-arbitraries";
import { outcomeOf, withoutVoids } from "./totals-void-test-helpers";

const RUNS = { numRuns: 2_000 };
const sum = (values: readonly bigint[]) => values.reduce((acc, v) => acc + v, 0n);

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
