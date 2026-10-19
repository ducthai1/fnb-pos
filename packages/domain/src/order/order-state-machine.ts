import { DomainError } from "../errors";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import type { Order, OrderStatus } from "./order-types";

type ClosedStatus = Exclude<OrderStatus, "draft">;

/**
 * Only a draft is open. Once paid the order is a closed document: a mistake is fixed by a
 * refund (a reversing document), so cancelling or editing a paid order is refused rather than
 * silently rewriting money that was already collected. `posted` means the shift that took the
 * payment has been closed and its books locked; nothing follows it.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ["paid", "cancelled"],
  paid: ["posted"],
  posted: [],
  cancelled: [],
};

/**
 * A closed order gets a code naming its state, so the UI can say why ("already paid: refund
 * instead") and a sync retry of a transition that already happened is recognisable.
 */
const CLOSED_ORDER_CODE: Readonly<Record<ClosedStatus, string>> = {
  paid: ORDER_ERROR_CODES.alreadyPaid,
  posted: ORDER_ERROR_CODES.alreadyPosted,
  cancelled: ORDER_ERROR_CODES.alreadyCancelled,
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (ALLOWED_TRANSITIONS[from].includes(to)) return;
  const code = from === "draft" ? ORDER_ERROR_CODES.invalidTransition : CLOSED_ORDER_CODE[from];
  throw new DomainError(code, `an order cannot move from ${from} to ${to}`, { from, to });
}

/** Returns a new order in the target status with its version bumped; the input is untouched. */
export function transitionOrder(order: Order, to: OrderStatus): Order {
  assertTransition(order.status, to);
  return { ...order, status: to, version: order.version + 1 };
}

/** Lines may be added, changed or removed only while the order is a draft. */
export function assertLinesEditable(order: Order): void {
  if (order.status === "draft") return;
  throw new DomainError(
    CLOSED_ORDER_CODE[order.status],
    `the lines of a ${order.status} order cannot be changed`,
    { orderId: order.id, status: order.status },
  );
}
