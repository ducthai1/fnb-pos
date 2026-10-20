import {
  type PermissionAction,
  type ShiftCashEvent,
  type ShiftCashLedger,
  type Vnd,
  cashMoveAction,
  negateVnd,
} from "@fnb/domain";
import type { StoredOrder } from "../order/stored-order";
import type { StoredShift } from "./stored-shift";

/**
 * The shift's cash book as the till can rebuild it: the float and the cash moves from the
 * shift's copy (every move goes through this till, and its answer brings the shift back),
 * and the cash of the till's own orders opened during the shift (ids are UUIDv7, so an order
 * made after the shift sorts after it), sales in and refunds out. The server keeps its own
 * book and decides the close; this is what the cashier is shown and counts against.
 */
export function tillShiftLedger(
  shift: StoredShift,
  orders: readonly StoredOrder[],
  staffId: string,
): ShiftCashLedger {
  const events: ShiftCashEvent[] = [
    { kind: "cash_in", amount: shift.figures.cashIn, staffId },
    { kind: "cash_out", amount: shift.figures.cashOut, staffId },
  ];
  for (const order of orders) {
    if (order.deviceId !== shift.deviceId || order.orderId < shift.id) continue;
    if (order.status !== "paid" && order.status !== "posted") continue;
    for (const payment of order.payments) {
      if (payment.method !== "cash") continue;
      events.push(
        order.refundOfOrderId === null
          ? { kind: "cash_sale", amount: payment.amount }
          : { kind: "cash_refund", amount: negateVnd(payment.amount) },
      );
    }
  }
  return { openingCash: shift.figures.openingCash, events };
}

/**
 * The action a cash move is judged by: what the staff member will have moved in the shift.
 * The shift's copy has the drawer's moves but not who made each, so they all count as this
 * staff member's: exact when one person handles the drawer, and never less than the server's
 * own figure, so the till never lets through alone what the server would refuse.
 */
export function cashMoveActionFor(
  shift: StoredShift,
  staffId: string,
  kind: "in" | "out",
  amount: Vnd,
): PermissionAction {
  const ledger = tillShiftLedger(shift, [], staffId);
  return cashMoveAction(ledger, { kind: kind === "in" ? "cash_in" : "cash_out", amount, staffId });
}
