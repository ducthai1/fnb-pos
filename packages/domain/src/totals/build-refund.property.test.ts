import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Quantity, quantityFromThousandths } from "../money";
import type { Order, RefundRequestLine } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { buildRefund } from "./build-refund";
import { computeOrderTotals } from "./compute-order-totals";
import { generatedOrder } from "./order-totals-arbitraries";
import type { OrderChargeProfile, OrderTotals } from "./order-totals-types";
import { negated, paid } from "./totals-refund-test-helpers";
import { orderLevel } from "./totals-void-test-helpers";

const RUNS = { numRuns: 1_000 };

interface RefundStep {
  readonly item: number;
  readonly share: bigint;
}
const refundSteps = fc.array(
  fc.record({ item: fc.nat(), share: fc.bigInt({ min: 1n, max: 1_000n }) }),
  { maxLength: 6 },
);
const paidSale = generatedOrder.map(({ order: o, profile }) => ({
  sale: paid(order(o.lines, { serviceType: o.serviceType })),
  profile,
}));

/** Refunds whatever the steps pick, then everything left; returns each refund in turn. */
function refundInSteps(sale: Order, profile: OrderChargeProfile, steps: readonly RefundStep[]) {
  const items = sale.lines.filter((l) => l.lineType === "item");
  const left = new Map<string, bigint>(items.map((l) => [l.id, l.quantity]));
  const refunds: Order[] = [];
  const refund = (request: RefundRequestLine[]) => {
    const id = `r${refunds.length}`;
    const ids = { orderId: id, newLineId: sequentialIds(id) };
    refunds.push(buildRefund(sale, request, refunds, ids, "2026-10-21", profile).order);
    for (const r of request) left.set(r.lineId, (left.get(r.lineId) ?? 0n) - r.quantity);
  };
  for (const step of steps) {
    const open = [...left].filter(([, q]) => q > 0n);
    const [lineId, q] = open[step.item % Math.max(open.length, 1)] ?? [];
    if (lineId === undefined || q === undefined) break;
    const quantity = quantityFromThousandths(1n + ((q - 1n) * step.share) / 1_000n);
    refund([{ lineId, quantity, restock: true }]);
  }
  const rest = [...left].filter(([, q]) => q > 0n);
  if (rest.length === 0) return refunds;
  refund(
    rest.map(([lineId, q]) => ({ lineId, quantity: quantityFromThousandths(q), restock: true })),
  );
  return refunds;
}

/** One refund, against no earlier one, of every unit the given refunds took back together. */
function oneRefundOf(sale: Order, profile: OrderChargeProfile, refunds: readonly Order[]) {
  const units = new Map<string, Quantity>();
  for (const line of refunds.flatMap((r) => r.lines)) {
    if (line.reversesLineId === null) continue;
    const before = units.get(line.reversesLineId) ?? 0n;
    units.set(line.reversesLineId, quantityFromThousandths(before - line.quantity));
  }
  const request = [...units].map(([lineId, quantity]) => ({ lineId, quantity, restock: true }));
  const ids = { orderId: "one", newLineId: sequentialIds("one") };
  return buildRefund(sale, request, [], ids, "2026-10-21", profile).order;
}

const sumOf = (all: readonly OrderTotals[], pick: (t: OrderTotals) => bigint) =>
  all.reduce((n, t) => n + pick(t), 0n);

describe("buildRefund on random orders and random refund sequences", () => {
  it("refunds a whole order at once as the exact negative of the sale", () => {
    fc.assert(
      fc.property(paidSale, ({ sale, profile }) => {
        const [whole] = refundInSteps(sale, profile, []);
        if (!whole) return;
        const refund = computeOrderTotals(whole, profile);
        expect(orderLevel(refund)).toEqual(negated(computeOrderTotals(sale, profile)));
      }),
      RUNS,
    );
  });

  it("gives back, over several refunds, exactly what the sale charged and never more first", () => {
    fc.assert(
      fc.property(paidSale, refundSteps, ({ sale, profile }, steps) => {
        const refunds = refundInSteps(sale, profile, steps);
        const totals = refunds.map((r) => computeOrderTotals(r, profile));
        const s = computeOrderTotals(sale, profile);
        expect(sumOf(totals, (t) => t.amountDue)).toBe(-s.amountDue);
        expect(sumOf(totals, (t) => t.discountTotal)).toBe(-s.discountTotal);
        expect(sumOf(totals, (t) => t.netTotal)).toBe(-s.netTotal);
        expect(sumOf(totals, (t) => t.taxTotal)).toBe(-s.taxTotal);
        expect(sumOf(totals, (t) => t.serviceCharge)).toBe(-s.serviceCharge);
        for (const group of s.taxBreakdown) {
          const ofRate = totals.flatMap((t) => t.taxBreakdown.filter((g) => g.rate === group.rate));
          expect(ofRate.reduce((n, g) => n + g.tax, 0n)).toBe(-group.tax);
          expect(ofRate.reduce((n, g) => n + g.base, 0n)).toBe(-group.base);
        }
        // after each refund, no more given back than one refund of all those units would
        for (let k = 1; k <= refunds.length; k++) {
          const soFar = totals.slice(0, k);
          const bound = computeOrderTotals(
            oneRefundOf(sale, profile, refunds.slice(0, k)),
            profile,
          );
          expect(sumOf(soFar, (t) => t.amountDue) >= bound.amountDue).toBe(true);
          expect(sumOf(soFar, (t) => t.netTotal) >= bound.netTotal).toBe(true);
          expect(sumOf(soFar, (t) => t.taxTotal) >= bound.taxTotal).toBe(true);
          expect(sumOf(soFar, (t) => t.serviceCharge) >= bound.serviceCharge).toBe(true);
          for (const t of soFar) expect(t.amountDue <= 0n && t.discountTotal <= 0n).toBe(true);
        }
      }),
      RUNS,
    );
  });
});
