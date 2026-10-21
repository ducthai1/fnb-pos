import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  type PermissionAction,
  type ShiftCashEvent,
  type ShiftCashLedger,
  type Vnd,
  cashMoveAction,
  vnd,
} from "@fnb/domain";
import type { StoredShift } from "./stored-shift";

const CASH = "cash";

type Tender = { readonly method?: unknown; readonly amount?: unknown };

/**
 * Cash the till took or paid out under `shiftId` that the server has not answered yet: the
 * cash tenders of its waiting order.pay and order.refund commands that name the shift. Once
 * the server takes one, the shift comes back with it in its figures.
 */
export function waitingShiftCash(
  pending: readonly SyncCommandEnvelope[],
  shiftId: string,
): ShiftCashEvent[] {
  const events: ShiftCashEvent[] = [];
  for (const command of pending) {
    if (command.type !== "order.pay" && command.type !== "order.refund") continue;
    const payload = command.payload as Record<string, unknown> | null;
    if (payload === null || payload.shiftId !== shiftId) continue;
    const sale = command.type === "order.pay";
    for (const tender of (payload[sale ? "payments" : "payouts"] ?? []) as readonly Tender[]) {
      if (tender.method !== CASH || typeof tender.amount !== "number") continue;
      const amount = vnd(Math.abs(tender.amount));
      events.push({ kind: sale ? "cash_sale" : "cash_refund", amount });
    }
  }
  return events;
}

/**
 * The shift's cash book as the till shows it: the server's own figures for the shift (every
 * payment into its drawer, from whichever till or order, and every cash move), plus what
 * this till still has waiting for it. The till does not rebuild the book from the orders it
 * holds: a table opened in the previous shift and paid in this one, or a handheld paying
 * into this drawer, would be missed, and the cashier would count against a figure the
 * server does not hold. The copy carries the moves' totals, not who made each; the cash_move
 * cap is the shift's, so whose name stands on them changes nothing.
 */
export function tillShiftLedger(
  shift: StoredShift,
  waiting: readonly ShiftCashEvent[],
): ShiftCashLedger {
  const { figures } = shift;
  const staffId = shift.openedByStaffId;
  const events: ShiftCashEvent[] = [
    { kind: "cash_sale", amount: figures.cashSales },
    { kind: "cash_refund", amount: figures.cashRefunds },
    { kind: "cash_in", amount: figures.cashIn, staffId },
    { kind: "cash_out", amount: figures.cashOut, staffId },
    ...waiting,
  ];
  return { openingCash: figures.openingCash, events };
}

/**
 * The action a cash move is judged by: everything moved through the shift's drawer once
 * this move is made, as the server judges it, so an approval the till asks for is for the
 * very figure the server will check, in this shift only.
 */
export function cashMoveActionFor(
  shift: StoredShift,
  staffId: string,
  kind: "in" | "out",
  amount: Vnd,
): PermissionAction {
  const ledger = tillShiftLedger(shift, []);
  const move = { kind: kind === "in" ? "cash_in" : "cash_out", amount, staffId } as const;
  return { ...cashMoveAction(ledger, move), subject: { shiftId: shift.id } };
}
