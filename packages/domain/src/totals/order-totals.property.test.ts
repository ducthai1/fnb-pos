import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyRate, vnd } from "../money";
import type { OrderLine } from "../order";
import { allocateAmount } from "./allocate-amount";
import { computeOrderTotals } from "./compute-order-totals";
import { generatedOrder } from "./order-totals-arbitraries";
import type { OrderTotals, OrderTotalsInput } from "./order-totals-types";

const RUNS = { numRuns: 2_000 };
const sum = (values: readonly bigint[]) => values.reduce((acc, v) => acc + v, 0n);

/** The totals without the per-line snapshot, whose rounding đồng may follow line order. */
const orderLevel = (totals: OrderTotals) => ({ ...totals, lines: [] });

// The wire format: bigints travel as strings, because JSON has no integer bigger than 2^53.
const BIGINT_TEXT = /^-?\d+n$/;
const toJson = (order: OrderTotalsInput) =>
  JSON.stringify(order, (_, value: unknown) =>
    typeof value === "bigint" ? `${value.toString()}n` : value,
  );
const fromJson = (text: string): OrderTotalsInput =>
  JSON.parse(text, (_, value: unknown) =>
    typeof value === "string" && BIGINT_TEXT.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as OrderTotalsInput;

describe("computeOrderTotals on random orders", () => {
  it("lines, tax groups and the amount due all add up", () => {
    fc.assert(
      fc.property(generatedOrder, ({ order, profile }) => {
        const t = computeOrderTotals(order, profile);
        expect(sum(t.lines.map((l) => l.net))).toBe(t.netTotal);
        expect(sum(t.lines.map((l) => l.gross))).toBe(t.grossTotal);
        expect(sum(t.lines.map((l) => l.discountAllocated))).toBe(t.discountTotal);
        expect(t.netTotal).toBe(t.grossTotal - t.discountTotal);
        expect(sum(t.taxBreakdown.map((g) => g.tax))).toBe(t.taxTotal);
        expect(sum(t.lines.map((l) => l.tax)) + t.serviceChargeTax).toBe(t.taxTotal);
        const taxOnTop = profile.pricesIncludeTax ? 0n : t.taxTotal;
        expect(t.amountDue).toBe(t.netTotal + t.serviceCharge + taxOnTop);
        // the invoice's summary by rate adds up to what the customer pays
        expect(sum(t.taxBreakdown.map((g) => g.base + g.tax))).toBe(t.amountDue);
        for (const l of t.lines) {
          expect(l.net).toBe(l.gross - l.discountAllocated);
          expect(l.net >= 0n && l.tax >= 0n && l.discountAllocated >= 0n).toBe(true);
        }
        const rates = t.taxBreakdown.map((g) => g.rate);
        expect(rates).toEqual([...new Set(rates)].sort((a, b) => a - b));
      }),
      RUNS,
    );
  });

  it("an order discount comes off to the đồng, as one line per rate with something to reduce", () => {
    fc.assert(
      fc.property(generatedOrder, ({ order, profile, orderDiscount, netBeforeOrderDiscount }) => {
        if (orderDiscount === null) return;
        const { request, built } = orderDiscount;
        const expected =
          request.kind === "fixed"
            ? request.amount
            : applyRate(vnd(netBeforeOrderDiscount), request.rate, "half-up");
        expect(sum(built.map((l) => -l.unitPrice))).toBe(expected);
        expect(built.every((l) => l.unitPrice < 0n && l.parentLineId === null)).toBe(true);
        const builtRates = built.map((l) => l.taxRate);
        expect(new Set(builtRates).size).toBe(builtRates.length);
        const after = computeOrderTotals(order, profile).netTotal;
        expect(after).toBe(netBeforeOrderDiscount - expected);
      }),
      RUNS,
    );
  });

  it("does not depend on the order the lines are listed in", () => {
    const withShuffle = generatedOrder.chain((g) =>
      fc
        .shuffledSubarray<OrderLine>([...g.order.lines], {
          minLength: g.order.lines.length,
          maxLength: g.order.lines.length,
        })
        .map((shuffled) => ({ g, shuffled })),
    );
    fc.assert(
      fc.property(withShuffle, ({ g, shuffled }) => {
        const original = computeOrderTotals(g.order, g.profile);
        const reordered = computeOrderTotals({ ...g.order, lines: shuffled }, g.profile);
        expect(orderLevel(reordered)).toEqual(orderLevel(original));
      }),
      RUNS,
    );
  });

  it("gives the same result after the order goes through JSON, as between POS and server", () => {
    fc.assert(
      fc.property(generatedOrder, ({ order, profile }) => {
        const received = fromJson(toJson(order));
        expect(received.lines.every((l) => typeof l.unitPrice === "bigint")).toBe(true);
        expect(computeOrderTotals(received, profile)).toEqual(computeOrderTotals(order, profile));
      }),
      RUNS,
    );
  });
});

describe("allocateAmount on random weights", () => {
  const weightsArb = fc
    .array(fc.bigInt({ min: 0n, max: 1_000_000n }), { minLength: 1, maxLength: 20 })
    .filter((ws) => ws.some((w) => w > 0n));

  it("adds up to the total, keeps every share within a đồng of its exact part, never flips sign", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -1_000_000_000n, max: 1_000_000_000n }), weightsArb, (t, ws) => {
        const total = vnd(t);
        const shares = allocateAmount(
          total,
          ws.map((w, i) => ({ id: `w${i}`, weight: vnd(w) })),
        ).map((s) => s.amount);
        const totalWeight = sum(ws);
        expect(sum(shares)).toBe(total);
        shares.forEach((share, i) => {
          const w = ws[i] ?? 0n;
          const error = share * totalWeight - total * w;
          expect(error > -totalWeight && error < totalWeight).toBe(true);
          if (total >= 0n) expect(share >= 0n).toBe(true);
          if (total <= 0n) expect(share <= 0n).toBe(true);
          if (w === 0n) expect(share).toBe(0n);
        });
      }),
      RUNS,
    );
  });
});
