import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quantity, quantityFromThousandths } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { effectiveQuantity, validateLineTree } from "./order-line-tree";
import { codeOf, item, line, order, sequentialIds } from "./order-line-test-fixtures";
import type { Order, OrderLine } from "./order-types";
import { voidLine } from "./void-order-line";

interface SoldItem {
  sold: bigint;
  toppings: bigint[];
}
type Step = { kind: "send" | "void"; item: number; amount: bigint };

const soldItem = fc.record({
  sold: fc.bigInt({ min: 1n, max: 6_000n }),
  toppings: fc.array(fc.bigInt({ min: 1n, max: 3n }), { maxLength: 2 }),
});
const step = fc.record({
  kind: fc.constantFrom<Step["kind"]>("send", "void"),
  item: fc.nat({ max: 2 }),
  amount: fc.bigInt({ min: 1n, max: 6_000n }),
});

function startingOrder(items: SoldItem[]): Order {
  const lines = items.flatMap((it, i) => [
    item(`i${i}`, quantityFromThousandths(it.sold)),
    ...it.toppings.map((units, t) => line(`i${i}t${t}`, "modifier", `i${i}`, quantity(units))),
  ]);
  return order(lines);
}

const freeze = (o: Order): Order =>
  Object.freeze({ ...o, lines: Object.freeze(o.lines.map((l) => Object.freeze(l))) });
const effectiveOrZero = (lines: readonly OrderLine[], id: string): bigint =>
  lines.some((l) => l.id === id) ? effectiveQuantity(lines, id) : 0n;

/** Net units of an item: what is left on the line plus every negative line reversing it. */
function netUnits(lines: readonly OrderLine[], itemId: string): bigint {
  const reversals = lines.filter((l) => l.reversesLineId === itemId);
  return reversals.reduce(
    (sum, r) => sum + effectiveQuantity(lines, r.id),
    effectiveOrZero(lines, itemId),
  );
}

/** Net topping portions: the topping and its copies under the item's negative lines. */
function netToppings(lines: readonly OrderLine[], itemId: string, toppingId: string): bigint {
  const parents = new Set([
    itemId,
    ...lines.filter((l) => l.reversesLineId === itemId).map((l) => l.id),
  ]);
  const copies = lines.filter(
    (l) =>
      l.parentLineId !== null &&
      parents.has(l.parentLineId) &&
      l.modifierOptionId === `option-${toppingId}`,
  );
  return copies.reduce((sum, c) => sum + effectiveQuantity(lines, c.id), 0n);
}

describe("voidLine over random sequences of kitchen sends and voids", () => {
  it("never cancels more than was sold, and nets to what was sold minus what was voided", () => {
    fc.assert(
      fc.property(
        fc.array(soldItem, { minLength: 3, maxLength: 3 }),
        fc.array(step, { maxLength: 12 }),
        (items, steps) => {
          let current = freeze(startingOrder(items));
          const sent = items.map(() => 0n);
          const voided = items.map(() => 0n);
          steps.forEach((s, n) => {
            const id = `i${s.item}`;
            const onLine = current.lines.find((l) => l.id === id)?.quantity ?? 0n;
            if (s.kind === "send") {
              sent[s.item] = onLine < sent[s.item]! + s.amount ? onLine : sent[s.item]! + s.amount;
              return;
            }
            const left = netUnits(current.lines, id);
            const request = {
              lineId: id,
              quantity: quantityFromThousandths(s.amount),
              reasonCode: "wrong_order",
              staffId: "cashier-1",
              approvedByStaffId: "manager-1",
              sentQuantity: quantityFromThousandths(sent[s.item]!),
              newLineId: sequentialIds(`s${n}`),
              requireApprovalAfterSent: true,
            };
            if (onLine === 0n || s.amount > left) {
              expect(codeOf(() => voidLine(current, request))).toBe(
                onLine === 0n ? C.lineNotFound : C.voidExceedsRemaining,
              );
              return;
            }
            const { order: next, record } = voidLine(current, request);
            const unsent = onLine - sent[s.item]!;
            expect(record.fromUnsent).toBe(s.amount < unsent ? s.amount : unsent);
            expect(record.fromUnsent + record.fromSent).toBe(s.amount);
            expect(next.version).toBe(current.version + 1);
            voided[s.item] = voided[s.item]! + s.amount;
            current = freeze(next);
          });
          validateLineTree(current.lines);
          items.forEach((it, i) => {
            const net = netUnits(current.lines, `i${i}`);
            expect(net).toBeGreaterThanOrEqual(0n);
            expect(net).toBe(it.sold - voided[i]!);
            it.toppings.forEach((units, t) => {
              expect(netToppings(current.lines, `i${i}`, `i${i}t${t}`)).toBe(units * net);
            });
          });
        },
      ),
    );
  });
});
