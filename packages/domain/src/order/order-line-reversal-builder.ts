import { DomainError } from "../errors";
import { type Quantity, negateQuantity } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import { subtreeOf } from "./order-line-tree";
import type { OrderLine } from "./order-types";

/**
 * The sold item a void or a refund may take units back from: a positive root item that is
 * not itself a reversal. Toppings and combo picks are cancelled with their item, never alone,
 * because their quantity only means something per unit of that item.
 */
export function findReversibleItem(lines: readonly OrderLine[], lineId: string): OrderLine {
  const found = lines.find((line) => line.id === lineId);
  if (!found) {
    throw new DomainError(ORDER_ERROR_CODES.lineNotFound, `no order line ${lineId}`, { lineId });
  }
  if (found.lineType !== "item" || found.reversesLineId !== null || found.quantity <= 0n) {
    throw new DomainError(
      ORDER_ERROR_CODES.lineNotReversible,
      `only a sold item can be voided or refunded, not ${found.lineType} line ${lineId}`,
      { lineId, lineType: found.lineType, reversesLineId: found.reversesLineId },
    );
  }
  return found;
}

/**
 * A negative copy of a sold item and its whole subtree. The item takes back `units`; every
 * child keeps its per-unit quantity, so its effective quantity turns negative through the
 * parent and toppings, combo picks and line discounts follow the item. Names, prices and tax
 * rates are copied as sold, so a reversal is worth exactly the negative of what it cancels
 * even after the menu price has changed.
 */
export function buildReversalLines(
  lines: readonly OrderLine[],
  original: OrderLine,
  units: Quantity,
  newLineId: () => string,
): OrderLine[] {
  const subtree = subtreeOf(lines, original.id);
  const newIds = new Map(subtree.map((line) => [line.id, newLineId()] as const));
  const renamed = (id: string): string => newIds.get(id) ?? id;
  return subtree.map((line) =>
    line.id === original.id
      ? {
          ...line,
          id: renamed(line.id),
          parentLineId: null,
          quantity: negateQuantity(units),
          reversesLineId: original.id,
        }
      : {
          ...line,
          id: renamed(line.id),
          parentLineId: line.parentLineId === null ? null : renamed(line.parentLineId),
        },
  );
}
