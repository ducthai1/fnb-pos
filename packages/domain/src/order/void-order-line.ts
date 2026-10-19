import { DomainError } from "../errors";
import { type Quantity, subtractQuantity } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import { reversedQuantityOf } from "./order-line-reversal-rules";
import { buildReversalLines, findReversibleItem } from "./order-line-reversal-builder";
import { subtreeOf, validateLineTree } from "./order-line-tree";
import { assertLinesEditable } from "./order-state-machine";
import type { Order, OrderLine } from "./order-types";

export interface VoidLineRequest {
  readonly lineId: string;
  /** Units to cancel; must be positive. */
  readonly quantity: Quantity;
  readonly reasonCode: string;
  readonly staffId: string;
  /**
   * Who approved cancelling food the kitchen already has. Whether that person MAY approve
   * (role, not the same person as staffId, PIN) is checked by authorize() in the application
   * layer; the domain only checks that someone did.
   */
  readonly approvedByStaffId: string | null;
  /**
   * Units of this line sent to the kitchen so far, counting units later cancelled: the kitchen
   * layer knows the tickets per line, and a cancel goes out under the negative line's own id.
   */
  readonly sentQuantity: Quantity;
  /** Ids are made where the record is born (UUIDv7 on the till), so they are passed in. */
  readonly newLineId: () => string;
  /** Branch setting: cancelling what the kitchen already has needs a second person. */
  readonly requireApprovalAfterSent: boolean;
}

export interface VoidRecord {
  readonly lineId: string;
  readonly quantity: Quantity;
  /** Units removed from the line itself: the kitchen never saw them, so nothing is wasted. */
  readonly fromUnsent: Quantity;
  /** Units taken back by a negative line: the kitchen may have made them already. */
  readonly fromSent: Quantity;
  readonly reasonCode: string;
  readonly staffId: string;
  readonly approvedByStaffId: string | null;
  /** The negative item created for `fromSent`, so a cancel ticket can be printed for it. */
  readonly reversalLineId: string | null;
}

/**
 * Cancels units of a sold item on a draft order. Units the kitchen has not seen are taken
 * first and simply removed from the line; only the rest become a negative line, because a
 * ticket that was printed must stay explainable and the kitchen needs a cancel ticket for it.
 * Returns a new order with the version bumped; the input is never changed.
 *
 * The server applies a void as a command carrying the intent (line, units, reason, who approved,
 * units sent) by calling this same function on the order it holds. It never takes the negative
 * lines a till built, since forged lines are exactly what a tampered sync payload would carry;
 * validateLineTree still refuses a cancel line that does not copy its item, as a second guard.
 */
export function voidLine(
  order: Order,
  request: VoidLineRequest,
): { order: Order; record: VoidRecord } {
  assertLinesEditable(order);
  const options = { refundOfOrderId: order.refundOfOrderId };
  validateLineTree(order.lines, options);
  if (request.quantity <= 0n) {
    throw new DomainError(
      ORDER_ERROR_CODES.nonPositiveQuantity,
      `a void must cancel a positive quantity, got ${request.quantity}`,
      { lineId: request.lineId, quantity: request.quantity },
    );
  }
  if (request.reasonCode.trim() === "") {
    throw new DomainError(ORDER_ERROR_CODES.voidReasonRequired, "a void needs a reason code", {
      lineId: request.lineId,
    });
  }
  const original = findReversibleItem(order.lines, request.lineId);
  const { fromUnsent, fromSent } = splitVoid(order.lines, original, request);
  if (fromSent > 0n && request.requireApprovalAfterSent && !hasApprover(request)) {
    throw new DomainError(
      ORDER_ERROR_CODES.voidNeedsApproval,
      `cancelling ${fromSent} thousandths already sent to the kitchen needs an approver`,
      { lineId: original.id, fromSent },
    );
  }
  const reversal =
    fromSent > 0n ? buildReversalLines(order.lines, original, fromSent, request.newLineId) : null;
  const lines = [...shrinkLine(order.lines, original, fromUnsent), ...(reversal ?? [])];
  validateLineTree(lines, options);
  const record: VoidRecord = {
    lineId: original.id,
    quantity: request.quantity,
    fromUnsent,
    fromSent,
    reasonCode: request.reasonCode,
    staffId: request.staffId,
    approvedByStaffId: request.approvedByStaffId,
    reversalLineId: reversal === null ? null : reversal[0].id,
  };
  return { order: { ...order, lines, version: order.version + 1 }, record };
}

/**
 * Sent units can only have been cancelled by negative lines, and a line never holds fewer
 * units than were sent, so `reversed ≤ sent ≤ line quantity`; anything else means the kitchen
 * layer and the order disagree, and guessing would either waste food or skip a cancel ticket.
 */
function splitVoid(
  lines: readonly OrderLine[],
  original: OrderLine,
  request: VoidLineRequest,
): { fromUnsent: Quantity; fromSent: Quantity } {
  const reversed = reversedQuantityOf(lines, original.id);
  const sent = request.sentQuantity;
  if (sent < reversed || sent > original.quantity) {
    throw new DomainError(
      ORDER_ERROR_CODES.invalidSentQuantity,
      `line ${original.id} holds ${original.quantity}, ${reversed} reversed, but ${sent} sent`,
      { lineId: original.id, quantity: original.quantity, reversed, sentQuantity: sent },
    );
  }
  const remaining = subtractQuantity(original.quantity, reversed);
  if (request.quantity > remaining) {
    throw new DomainError(
      ORDER_ERROR_CODES.voidExceedsRemaining,
      `line ${original.id} has ${remaining} thousandths left to void, not ${request.quantity}`,
      { lineId: original.id, remaining, quantity: request.quantity },
    );
  }
  const unsent = subtractQuantity(original.quantity, sent);
  const fromUnsent = request.quantity < unsent ? request.quantity : unsent;
  return { fromUnsent, fromSent: subtractQuantity(request.quantity, fromUnsent) };
}

/** Lowers the line by `units`; a line left at zero goes with its toppings and picks. */
function shrinkLine(
  lines: readonly OrderLine[],
  original: OrderLine,
  units: Quantity,
): readonly OrderLine[] {
  if (units <= 0n) return lines;
  const left = subtractQuantity(original.quantity, units);
  if (left <= 0n) {
    const removed = new Set(subtreeOf(lines, original.id).map((line) => line.id));
    return lines.filter((line) => !removed.has(line.id));
  }
  return lines.map((line) => (line.id === original.id ? { ...line, quantity: left } : line));
}

function hasApprover(request: VoidLineRequest): boolean {
  return request.approvedByStaffId !== null && request.approvedByStaffId.trim() !== "";
}
