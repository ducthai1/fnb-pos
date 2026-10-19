import { DomainError } from "../errors";
import { type Quantity, addQuantity, negateQuantity } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import type { OrderLine } from "./order-types";

export interface LineTreeOptions {
  /**
   * The order these lines refund, or null/absent for an ordinary order. A refund's negative
   * lines reverse lines of that other order, so they cannot be resolved here: buildRefund makes
   * them from the refunded order, and validateRefundAgainstSale checks a refund received from a
   * till against it and its earlier refunds.
   */
  readonly refundOfOrderId?: string | null;
}

/**
 * A line's quantity is positive, except a negative root item that names the line it takes
 * back. Children of such a line stay positive (per unit of their parent, like every child),
 * so their effective quantity turns negative through the parent and a cancelled milk tea
 * cancels its toppings without each topping needing its own reversal rule.
 */
export function assertLineQuantity(
  line: OrderLine,
  byId: ReadonlyMap<string, OrderLine>,
  options: LineTreeOptions,
): void {
  if (line.reversesLineId === null) {
    if (line.quantity > 0n) return;
    throw new DomainError(
      ORDER_ERROR_CODES.nonPositiveQuantity,
      `order line ${line.id} must have a positive quantity`,
      { lineId: line.id, quantity: line.quantity },
    );
  }
  const details = { lineId: line.id, reversesLineId: line.reversesLineId };
  if (line.lineType !== "item") {
    throw new DomainError(
      ORDER_ERROR_CODES.reversalNotRootItem,
      `only a root item can reverse another line, not ${line.lineType} line ${line.id}`,
      details,
    );
  }
  if (line.quantity >= 0n) {
    throw new DomainError(
      ORDER_ERROR_CODES.reversalNotNegative,
      `reversing line ${line.id} must have a negative quantity`,
      { ...details, quantity: line.quantity },
    );
  }
  if (isRefund(options)) return;
  const target = byId.get(line.reversesLineId);
  if (!target) {
    throw new DomainError(
      ORDER_ERROR_CODES.reversedLineNotFound,
      `line ${line.id} reverses ${line.reversesLineId}, which is not on the order`,
      details,
    );
  }
  if (target.lineType !== "item" || target.reversesLineId !== null || target.quantity <= 0n) {
    throw new DomainError(
      ORDER_ERROR_CODES.invalidReversalTarget,
      `line ${line.id} may only reverse a positive root item, not line ${target.id}`,
      details,
    );
  }
}

/**
 * Two tills can each cancel the same sent line before they sync; together they must not take
 * back more units than were sold, or the order would pay the customer for nothing.
 */
export function assertNotOverReversed(
  lines: readonly OrderLine[],
  byId: ReadonlyMap<string, OrderLine>,
  options: LineTreeOptions,
): void {
  if (isRefund(options)) return;
  const targets = new Set<string>();
  for (const line of lines) if (line.reversesLineId !== null) targets.add(line.reversesLineId);
  for (const targetId of targets) {
    const target = byId.get(targetId);
    if (!target) continue; // assertLineQuantity already refused a reversal of a missing line
    const reversed = reversedQuantityOf(lines, targetId);
    if (target.quantity >= reversed) continue;
    throw new DomainError(
      ORDER_ERROR_CODES.reversalExceedsOriginal,
      `line ${targetId} has ${target.quantity} thousandths but ${reversed} are reversed`,
      { lineId: targetId, quantity: target.quantity, reversed },
    );
  }
}

/** How many units of `lineId` the negative lines in `lines` take back, as a positive quantity. */
export function reversedQuantityOf(lines: readonly OrderLine[], lineId: string): Quantity {
  const reversals = lines.filter((line) => line.reversesLineId === lineId);
  return negateQuantity(addQuantity(...reversals.map((line) => line.quantity)));
}

export function isRefund(options: LineTreeOptions): boolean {
  return options.refundOfOrderId !== undefined && options.refundOfOrderId !== null;
}
