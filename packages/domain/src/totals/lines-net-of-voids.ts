import { subtractQuantity } from "../money";
import { type OrderLine, reversedQuantityOf, subtreeOf } from "../order";

export interface LinesNetOfVoids {
  /** Every line still paid for, a voided item at the units left of it (0 when all were voided). */
  readonly priced: readonly OrderLine[];
  /** The void lines (each negative item and the copies of its children), priced at nothing. */
  readonly voidLineIds: ReadonlySet<string>;
}

/**
 * The lines of an ordinary order as the customer pays for them. A void line takes back units
 * of an item already sent to the kitchen; pricing it as a negative line of its own would hand
 * a negative weight to every split that follows (line discount, order discount, tax), and a
 * percent discount or a rate group's rounding would then depend on how the cancellation was
 * recorded. Folding it into the item it reverses prices the order exactly as if those units
 * had never been rung up, which is what the customer is asked to pay. The tree was validated,
 * so a void never takes back more units than its item holds.
 *
 * The copied children of a void line are what the kitchen ticket showed, not a price: the
 * item's own children, as they are now, follow the units that are left.
 */
export function linesNetOfVoids(lines: readonly OrderLine[]): LinesNetOfVoids {
  const voidLineIds = new Set<string>();
  for (const line of lines) {
    if (line.reversesLineId === null) continue;
    for (const copy of subtreeOf(lines, line.id)) voidLineIds.add(copy.id);
  }
  if (voidLineIds.size === 0) return { priced: lines, voidLineIds };
  const priced = lines
    .filter((line) => !voidLineIds.has(line.id))
    .map((line) => {
      const reversed = reversedQuantityOf(lines, line.id);
      if (reversed === 0n) return line;
      return { ...line, quantity: subtractQuantity(line.quantity, reversed) };
    });
  return { priced, voidLineIds };
}
