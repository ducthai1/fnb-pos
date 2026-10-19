import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { divideRounded, negateVnd, quantity, quantityFromThousandths } from "../money";
import { buildRefundLines } from "./build-refund-order";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import {
  codeOf,
  copyOf,
  item,
  line,
  linesTotal,
  order,
  reversal,
  sequentialIds,
} from "./order-line-test-fixtures";
import type { Order, OrderLine, OrderStatus } from "./order-types";

interface SoldItem {
  sold: bigint;
  /** Percent of the item voided after it was sent, before the customer paid. */
  voidedShare: bigint;
  toppings: bigint[];
}

const soldItem: fc.Arbitrary<SoldItem> = fc.record({
  sold: fc.bigInt({ min: 1n, max: 5_000n }),
  voidedShare: fc.bigInt({ min: 0n, max: 100n }),
  toppings: fc.array(fc.bigInt({ min: 1n, max: 3n }), { maxLength: 2 }),
});
const attempt = fc.record({
  entries: fc.array(
    fc.record({ item: fc.nat({ max: 2 }), amount: fc.bigInt({ min: -10n, max: 3_000n }) }),
    {
      minLength: 1,
      maxLength: 3,
    },
  ),
  thenStatus: fc.constantFrom<OrderStatus>("draft", "paid", "cancelled"),
});

/** A paid order of three items, each with toppings and part of it voided before payment. */
function paidOrder(items: SoldItem[]): { paid: Order; payable: bigint[] } {
  const lines: OrderLine[] = [];
  const payable = items.map((it, i) => {
    const voided = divideRounded(it.sold * it.voidedShare, 100n, "down");
    lines.push(item(`i${i}`, quantityFromThousandths(it.sold)));
    it.toppings.forEach((units, t) =>
      lines.push(line(`i${i}t${t}`, "modifier", `i${i}`, quantity(units))),
    );
    if (voided > 0n) {
      lines.push(reversal(`i${i}v`, `i${i}`, quantityFromThousandths(-voided)));
      it.toppings.forEach((units, t) =>
        lines.push(copyOf(`i${i}v${t}`, `i${i}t${t}`, "modifier", `i${i}v`, quantity(units))),
      );
    }
    return it.sold - voided;
  });
  return { paid: order(lines, { status: "paid" }), payable };
}

/** The same lines with every negative item turned positive: what the refund mirrors. */
const mirrored = (lines: readonly OrderLine[]): OrderLine[] =>
  lines.map((l) =>
    l.reversesLineId === null
      ? l
      : { ...l, quantity: quantityFromThousandths(-l.quantity), reversesLineId: null },
  );

describe("buildRefundLines over random sequences of refunds", () => {
  it("never refunds more than was paid for, and each refund mirrors what it gives back", () => {
    fc.assert(
      fc.property(
        fc.array(soldItem, { minLength: 3, maxLength: 3 }),
        fc.array(attempt, { maxLength: 6 }),
        (items, attempts) => {
          const { paid, payable } = paidOrder(items);
          const refunded = items.map(() => 0n);
          const existing: Order[] = [];
          attempts.forEach((a, n) => {
            const request = a.entries.map((e) => ({
              lineId: `i${e.item}`,
              quantity: quantityFromThousandths(e.amount),
              restock: true,
            }));
            const wanted = [...refunded];
            let expected: string | undefined;
            for (const e of a.entries) {
              if (expected !== undefined) break;
              wanted[e.item] = wanted[e.item]! + e.amount;
              if (e.amount <= 0n) expected = C.nonPositiveQuantity;
              else if (wanted[e.item]! > payable[e.item]!) expected = C.refundExceedsRemaining;
            }
            const ids = { orderId: `r${n}`, newLineId: sequentialIds(`r${n}`) };
            if (expected !== undefined) {
              expect(
                codeOf(() => buildRefundLines(paid, request, existing, ids, "2026-10-21")),
              ).toBe(expected);
              return;
            }
            const built = buildRefundLines(paid, request, existing, ids, "2026-10-21").order;
            expect(linesTotal(built.lines)).toBe(negateVnd(linesTotal(mirrored(built.lines))));
            existing.push({ ...built, status: a.thenStatus });
            if (a.thenStatus !== "cancelled") wanted.forEach((w, i) => (refunded[i] = w));
          });
          refunded.forEach((r, i) => expect(r).toBeLessThanOrEqual(payable[i]!));
        },
      ),
    );
  });
});
