import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quantityFromThousandths, subtractQuantity } from "../money";
import {
  type Order,
  type OrderStatus,
  type RefundRequestLine,
  reversedQuantityOf,
  transitionOrder,
} from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { isDomainError } from "../errors";
import { buildRefund } from "./build-refund";
import { computeOrderTotals } from "./compute-order-totals";
import { applyVoids, voidStep } from "./order-lifecycle-arbitraries";
import { generatedOrderOf } from "./order-totals-arbitraries";
import type { OrderChargeProfile, OrderTotals } from "./order-totals-types";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import { overTheWire, sameData } from "./totals-wire-test-helpers";

// The main property runs 10.000 cases by default; FNB_LIFECYCLE_RUNS overrides it (e.g. 200 000
// before a release). The environment is read through globalThis: domain code has no Node types.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const RUNS = { numRuns: Number(env?.["FNB_LIFECYCLE_RUNS"] ?? 10_000) };

const refundStep = fc.record({
  item: fc.nat(),
  share: fc.bigInt({ min: 1n, max: 1_000n }),
  then: fc.constantFrom<OrderStatus>("paid", "paid", "draft", "cancelled"),
});

/** Rung up, discounted, partly voided (the order discount dropped if it no longer fits), paid. */
const paidSale = fc
  .record({ g: generatedOrderOf(6), voids: fc.array(voidStep, { maxLength: 4 }) })
  .map(({ g, voids }) => {
    const draft = applyVoids(order(g.order.lines, { serviceType: g.order.serviceType }), voids);
    return {
      sale: transitionOrder(withDiscountThatFits(draft, g.profile), "paid"),
      profile: g.profile,
    };
  });

/** A void can leave less to pay than the order discount takes; the cashier removes it then. */
function withDiscountThatFits(draft: Order, profile: OrderChargeProfile): Order {
  try {
    computeOrderTotals(draft, profile);
    return draft;
  } catch (error) {
    if (!isDomainError(error, TOTALS_ERROR_CODES.discountExceedsBase)) throw error;
    const lines = draft.lines.filter((l) => l.lineType !== "discount" || l.parentLineId !== null);
    return { ...draft, lines };
  }
}

const build = (
  sale: Order,
  request: readonly RefundRequestLine[],
  existing: readonly Order[],
  id: string,
  profile: OrderChargeProfile,
) => {
  const ids = { orderId: id, newLineId: sequentialIds(id) };
  return buildRefund(sale, request, existing, ids, "2026-10-21", profile).order;
};

const sum = (all: readonly OrderTotals[], pick: (t: OrderTotals) => bigint) =>
  all.reduce((n, t) => n + pick(t), 0n);

/** Units of each sold item the customer paid for and no refund that counts has taken yet. */
function unitsLeft(sale: Order, refunds: readonly Order[]): [string, bigint][] {
  const live = refunds.filter((r) => r.status !== "cancelled").flatMap((r) => r.lines);
  return sale.lines
    .filter((l) => l.lineType === "item" && l.reversesLineId === null)
    .map((l) => {
      const paidFor = subtractQuantity(l.quantity, reversedQuantityOf(sale.lines, l.id));
      return [l.id, subtractQuantity(paidFor, reversedQuantityOf(live, l.id))] as [string, bigint];
    })
    .filter(([, left]) => left > 0n);
}

/** expect only on a mismatch: vitest's expect costs more than the check across 10.000 runs. */
function same(actual: unknown, expected: unknown): void {
  if (!sameData(actual, expected)) expect(actual).toEqual(expected);
}

function expectConsistent(t: OrderTotals, profile: OrderChargeProfile): void {
  same(t.grossTotal - t.discountTotal, t.netTotal);
  same(
    t.lines.reduce((n, l) => n + l.net, 0n),
    t.netTotal,
  );
  same(t.lines.reduce((n, l) => n + l.tax, 0n) + t.serviceChargeTax, t.taxTotal);
  same(
    t.taxBreakdown.reduce((n, g) => n + g.tax, 0n),
    t.taxTotal,
  );
  same(
    t.taxBreakdown.reduce((n, g) => n + g.base + g.tax, 0n),
    t.amountDue,
  );
  const taxOnTop = profile.pricesIncludeTax ? 0n : t.taxTotal;
  same(t.amountDue, t.netTotal + t.serviceCharge + taxOnTop);
}

describe("an order from the till to its last refund", () => {
  it(
    "adds up at every step, never refunds more than was paid and refunds it all at the end",
    { timeout: 60_000 },
    () => {
      fc.assert(
        fc.property(
          paidSale,
          fc.array(refundStep, { maxLength: 5 }),
          ({ sale, profile }, steps) => {
            const saleTotals = computeOrderTotals(sale, profile);
            expectConsistent(saleTotals, profile);
            const refunds: Order[] = [];
            const given: OrderTotals[] = []; // the refunds that count, drafts included
            // the server holds what each document looked like when it arrived over the wire
            const server = {
              sale: overTheWire(sale),
              refunds: [] as Order[],
              profile: overTheWire(profile),
            };
            same(computeOrderTotals(server.sale, server.profile), saleTotals);
            const refund = (request: RefundRequestLine[], then: OrderStatus) => {
              const id = `r${refunds.length}`;
              const built = build(sale, request, refunds, id, profile);
              // the server rebuilds the refund from the same request and must get the very same one
              const rebuilt = build(
                server.sale,
                overTheWire(request),
                server.refunds,
                id,
                server.profile,
              );
              same(rebuilt, built);
              const doc = then === "draft" ? built : transitionOrder(built, then);
              const received = overTheWire(doc);
              refunds.push(doc);
              server.refunds.push(received);
              const totals = computeOrderTotals(doc, profile);
              same(computeOrderTotals(received, server.profile), totals);
              if (then === "cancelled") return;
              expectConsistent(totals, profile);
              given.push(totals);
              same(-sum(given, (t) => t.amountDue) <= saleTotals.amountDue, true);
            };
            for (const step of steps) {
              const open = unitsLeft(sale, refunds);
              const [lineId, left] = open[step.item % Math.max(open.length, 1)] ?? [];
              if (lineId === undefined || left === undefined) break;
              const units = quantityFromThousandths(1n + ((left - 1n) * step.share) / 1_000n);
              refund([{ lineId, quantity: units, restock: true }], step.then);
            }
            const rest = unitsLeft(sale, refunds).map(([lineId, left]) => ({
              lineId,
              quantity: quantityFromThousandths(left),
              restock: false,
            }));
            if (rest.length > 0) refund(rest, "paid");
            expect(sum(given, (t) => t.amountDue)).toBe(-saleTotals.amountDue);
            expect(sum(given, (t) => t.discountTotal)).toBe(-saleTotals.discountTotal);
            expect(sum(given, (t) => t.taxTotal)).toBe(-saleTotals.taxTotal);
            expect(sum(given, (t) => t.serviceCharge)).toBe(-saleTotals.serviceCharge);
          },
        ),
        RUNS,
      );
    },
  );
});
