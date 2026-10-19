import fc from "fast-check";
import { quantityFromThousandths, subtractQuantity } from "../money";
import { type Order, reversedQuantityOf } from "../order";
import { sequentialIds } from "../order/order-line-test-fixtures";
import { voidUnits } from "./totals-void-test-helpers";

/** Which sold item to void (by position among them), how much of it, and how much was sent. */
export interface VoidStep {
  readonly item: number;
  readonly share: bigint;
  readonly sentShare: bigint;
}
export const voidStep: fc.Arbitrary<VoidStep> = fc.record({
  item: fc.nat(),
  share: fc.bigInt({ min: 1n, max: 1_000n }),
  sentShare: fc.bigInt({ min: 0n, max: 1_000n }),
});

/** Applies each step as a valid void: at least one unit thousandth, never more than is left. */
export function applyVoids(start: Order, steps: readonly VoidStep[]): Order {
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
