import { DomainError } from "../errors";
import { type Vnd, ZERO_VND, addVnd, subtractVnd } from "../money";
import type { PermissionAction } from "../permissions";
import { SHIFT_ERROR_CODES } from "./shift-error-codes";

/**
 * One movement of cash through a shift's drawer. Amounts are magnitudes and the kind says
 * which way the cash went, so a sign slip on a till cannot turn a refund into takings.
 * cash_sale / cash_refund: cash a sale took in or a refund paid out. cash_in / cash_out: cash
 * moved outside a sale (change float topped up, the ice delivery paid from the drawer), by
 * the staff member recorded, whose running total is what their cash_move limit caps.
 */
export type ShiftCashEvent =
  | { readonly kind: "cash_sale" | "cash_refund"; readonly amount: Vnd }
  | { readonly kind: "cash_in" | "cash_out"; readonly amount: Vnd; readonly staffId: string };

/** The cash book of one shift: the float it opened with and everything since. */
export interface ShiftCashLedger {
  readonly openingCash: Vnd;
  readonly events: readonly ShiftCashEvent[];
}

/** The lines of a closing slip; expectedCash is what the drawer should hold. */
export interface ShiftCashSummary {
  readonly openingCash: Vnd;
  readonly cashSales: Vnd;
  readonly cashRefunds: Vnd;
  readonly cashIn: Vnd;
  readonly cashOut: Vnd;
  readonly expectedCash: Vnd;
}

type EventKind = ShiftCashEvent["kind"];

/**
 * Totals per kind, then the drawer's expected cash: float + cash sales − cash refunds +
 * cash in − cash out. Addition only, so the result does not depend on the order the events
 * reached the server in, which offline tills cannot promise.
 */
export function summarizeShiftCash(ledger: ShiftCashLedger): ShiftCashSummary {
  assertMagnitude(ledger.openingCash);
  const totals: Record<EventKind, Vnd> = {
    cash_sale: ZERO_VND,
    cash_refund: ZERO_VND,
    cash_in: ZERO_VND,
    cash_out: ZERO_VND,
  };
  for (const event of ledger.events) {
    assertMagnitude(event.amount);
    totals[event.kind] = addVnd(totals[event.kind], event.amount);
  }
  const takenIn = addVnd(ledger.openingCash, totals.cash_sale, totals.cash_in);
  return {
    openingCash: ledger.openingCash,
    cashSales: totals.cash_sale,
    cashRefunds: totals.cash_refund,
    cashIn: totals.cash_in,
    cashOut: totals.cash_out,
    expectedCash: subtractVnd(takenIn, addVnd(totals.cash_refund, totals.cash_out)),
  };
}

export function expectedCash(ledger: ShiftCashLedger): Vnd {
  return summarizeShiftCash(ledger).expectedCash;
}

/**
 * What `events` add to or take from a drawer, without its float: the adjustment a closed
 * shift gets when a sale made during it reaches the server after the close.
 */
export function netCashOf(events: readonly ShiftCashEvent[]): Vnd {
  return expectedCash({ openingCash: ZERO_VND, events });
}

/**
 * The cash `staffId` has moved in or out of this shift's drawer, every move counted as a
 * magnitude: taking 400.000 đ out and putting 400.000 đ back is 800.000 đ handled, and a
 * limit judged per move, or on the net, would let it be split into steps under the cap.
 */
export function cumulativeCashMovedBy(ledger: ShiftCashLedger, staffId: string): Vnd {
  let moved = ZERO_VND;
  for (const event of ledger.events) {
    if (event.kind !== "cash_in" && event.kind !== "cash_out") continue;
    assertMagnitude(event.amount);
    if (event.staffId === staffId) moved = addVnd(moved, event.amount);
  }
  return moved;
}

/** The permission action a new cash move is judged by: the mover's total once it is made. */
export function cashMoveAction(
  ledger: ShiftCashLedger,
  move: Extract<ShiftCashEvent, { kind: "cash_in" | "cash_out" }>,
): PermissionAction {
  const amount = cumulativeCashMovedBy(
    { ...ledger, events: [...ledger.events, move] },
    move.staffId,
  );
  return { key: "cash_move", amount };
}

function assertMagnitude(amount: Vnd): void {
  if (typeof amount === "bigint" && amount >= 0n) return;
  throw new DomainError(SHIFT_ERROR_CODES.negativeAmount, `not a cash magnitude: ${amount}`, {
    amount,
  });
}
