import { DomainError } from "../errors";
import { type Quantity, addQuantity, subtractQuantity } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import { buildReversalCopies, findReversibleItem } from "./order-line-reversal-builder";
import { reversedQuantityOf } from "./order-line-reversal-rules";
import { validateLineTree } from "./order-line-tree";
import type { Order, OrderLine } from "./order-types";

export interface RefundRequestLine {
  /** A sold item of the paid order; its toppings and picks are refunded with it. */
  readonly lineId: string;
  readonly quantity: Quantity;
  /** Whether the goods go back into stock (an unopened bottle) or are written off (a spilt tea). */
  readonly restock: boolean;
}

export interface RefundIds {
  readonly orderId: string;
  readonly newLineId: () => string;
}

export interface BuiltRefund {
  /** A draft refund order with its amounts; paying it out is a normal draft → paid transition. */
  readonly order: Order;
  /**
   * Restock choice per negative item of the refund, keyed by the refund line's own id: the
   * same sold line may be refunded twice in one request, one unit restocked and one not. It is
   * kept off OrderLine because it is a stock instruction, not part of what was sold.
   */
  readonly restockByLineId: Readonly<Record<string, boolean>>;
}

/** The refund's lines before its amounts are worked out, and where each goods copy came from. */
export interface RefundLines extends BuiltRefund {
  /** Refund line id → the sold line it was copied from. */
  readonly soldLineIdByLineId: ReadonlyMap<string, string>;
}

/**
 * The lines of a refund for part or all of a paid order: a new draft whose negative items point
 * at the sold lines, with copies of their toppings and picks. Names, unit prices and tax rates
 * are copied from the sold lines, so the refund reads as what was sold even if the menu changed.
 * What it gives back is not decided here: that is a share of the sale's totals (order discount,
 * tax, service charge), which buildRefund in the totals module adds. This is internal to it.
 *
 * `businessDate` is the refund's own business day (today's, from businessDate()), not the
 * sale's: the sale's day may already be closed, and the money leaves the drawer today.
 */
export function buildRefundLines(
  paidOrder: Order,
  request: readonly RefundRequestLine[],
  existingRefunds: readonly Order[],
  ids: RefundIds,
  businessDate: string,
): RefundLines {
  if (paidOrder.status !== "paid" && paidOrder.status !== "posted") {
    throw new DomainError(
      ORDER_ERROR_CODES.refundRequiresPaidOrder,
      `only a paid order can be refunded, not a ${paidOrder.status} one`,
      { orderId: paidOrder.id, status: paidOrder.status },
    );
  }
  validateLineTree(paidOrder.lines, { refundOfOrderId: paidOrder.refundOfOrderId });
  if (request.length === 0) {
    throw new DomainError(ORDER_ERROR_CODES.refundEmpty, "a refund needs at least one line", {
      orderId: paidOrder.id,
    });
  }
  const earlier = earlierRefundLines(paidOrder, existingRefunds);
  const lines: OrderLine[] = [];
  const restockByLineId: Record<string, boolean> = {};
  const soldLineIdByLineId = new Map<string, string>();
  for (const wanted of request) {
    const original = refundableLine(paidOrder, wanted);
    // Units voided before payment were never paid for; units on earlier refunds, drafts
    // included, are already on their way back. Counting drafts stops two tills from each
    // preparing a refund of the same tea before either is paid out.
    const taken = addQuantity(
      reversedQuantityOf(paidOrder.lines, original.id),
      reversedQuantityOf(earlier, original.id),
      reversedQuantityOf(lines, original.id),
    );
    const left = subtractQuantity(original.quantity, taken);
    if (wanted.quantity > left) {
      throw new DomainError(
        ORDER_ERROR_CODES.refundExceedsRemaining,
        `line ${original.id} has ${left} thousandths left to refund, not ${wanted.quantity}`,
        { lineId: original.id, remaining: left, quantity: wanted.quantity },
      );
    }
    const copies = buildReversalCopies(paidOrder.lines, original, wanted.quantity, ids.newLineId);
    restockByLineId[copies[0].line.id] = wanted.restock;
    for (const { line, copiedFromId } of copies) {
      soldLineIdByLineId.set(line.id, copiedFromId);
      lines.push(line);
    }
  }
  const refund: Order = {
    id: ids.orderId,
    status: "draft",
    serviceType: paidOrder.serviceType,
    channelKey: paidOrder.channelKey,
    businessDate,
    lines,
    version: 1,
    refundOfOrderId: paidOrder.id,
    refundAmounts: null,
  };
  validateLineTree(refund.lines, { refundOfOrderId: refund.refundOfOrderId });
  return { order: refund, restockByLineId, soldLineIdByLineId };
}

function refundableLine(paidOrder: Order, wanted: RefundRequestLine): OrderLine {
  if (wanted.quantity <= 0n) {
    throw new DomainError(
      ORDER_ERROR_CODES.nonPositiveQuantity,
      `a refund must return a positive quantity, got ${wanted.quantity}`,
      { lineId: wanted.lineId, quantity: wanted.quantity },
    );
  }
  return findReversibleItem(paidOrder.lines, wanted.lineId);
}

/**
 * Lines of the refunds that still count. A refund of some other order means the caller loaded
 * the wrong list, and silently skipping it could hide the refund that should have been there.
 * A cancelled refund draft gave nothing back, so its units are refundable again.
 */
function earlierRefundLines(paidOrder: Order, existingRefunds: readonly Order[]): OrderLine[] {
  for (const refund of existingRefunds) {
    if (refund.refundOfOrderId === paidOrder.id) continue;
    throw new DomainError(
      ORDER_ERROR_CODES.refundOfAnotherOrder,
      `order ${refund.id} is not a refund of ${paidOrder.id}`,
      { orderId: paidOrder.id, refundId: refund.id, refundOfOrderId: refund.refundOfOrderId },
    );
  }
  return existingRefunds
    .filter((refund) => refund.status !== "cancelled")
    .flatMap((refund) => refund.lines);
}
