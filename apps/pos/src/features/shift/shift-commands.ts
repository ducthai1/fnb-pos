import { cashMovePayloadSchema, closeShiftPayloadSchema } from "@fnb/contracts";
import {
  type ClosingAssessment,
  type DenominationCount,
  type Vnd,
  summarizeShiftCash,
} from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { newId } from "../ids/new-id";
import { type TillPlace, moneyToWire, tillCommand } from "../order/till-command";
import type { StoredShift } from "./stored-shift";

const figuresOnWire = (figures: ReturnType<typeof summarizeShiftCash>) => ({
  openingCash: moneyToWire(figures.openingCash),
  cashSales: moneyToWire(figures.cashSales),
  cashRefunds: moneyToWire(figures.cashRefunds),
  cashIn: moneyToWire(figures.cashIn),
  cashOut: moneyToWire(figures.cashOut),
  expectedCash: moneyToWire(figures.expectedCash),
});

export interface CashMove {
  readonly kind: "in" | "out";
  readonly amount: Vnd;
  readonly reason: string;
  readonly approvalId: string | null;
}

/** shift.cash_move; the till expects the shift's book with the move in it. */
export function cashMoveCommand(
  place: TillPlace,
  shift: StoredShift,
  staffId: string,
  move: CashMove,
  at: number,
): LocalCommand {
  const { figures } = shift;
  const after = summarizeShiftCash({
    openingCash: figures.openingCash,
    events: [
      { kind: "cash_sale", amount: figures.cashSales },
      { kind: "cash_refund", amount: figures.cashRefunds },
      { kind: "cash_in", amount: figures.cashIn, staffId },
      { kind: "cash_out", amount: figures.cashOut, staffId },
      { kind: move.kind === "in" ? "cash_in" : "cash_out", amount: move.amount, staffId },
    ],
  });
  const payload = {
    cashMoveId: newId(),
    kind: move.kind,
    amount: moneyToWire(move.amount),
    reason: move.reason,
    ...(move.approvalId === null ? {} : { approvalId: move.approvalId }),
  };
  return tillCommand(place, "shift.cash_move", cashMovePayloadSchema, payload, at, {
    entity: "shift",
    entityId: shift.id,
    optimistic: { ...shift.row, version: shift.version + 1, figures: figuresOnWire(after) },
  });
}

/** shift.close on the cashier's count; the till expects the shift closed on its own figures. */
export function closeShiftCommand(
  place: TillPlace,
  shift: StoredShift,
  staffId: string,
  counts: readonly DenominationCount[],
  assessment: ClosingAssessment,
  approvalId: string | null,
  at: number,
): LocalCommand {
  const denominations = counts
    .filter((count) => count.pieces > 0)
    .map((count) => ({ denomination: moneyToWire(count.denomination), pieces: count.pieces }));
  const payload = {
    counted: moneyToWire(assessment.countedCash),
    denominations,
    ...(approvalId === null ? {} : { approvalId }),
  };
  return tillCommand(place, "shift.close", closeShiftPayloadSchema, payload, at, {
    entity: "shift",
    entityId: shift.id,
    optimistic: {
      ...shift.row,
      status: "closed",
      version: shift.version + 1,
      close: {
        closedByStaffId: staffId,
        countedCash: moneyToWire(assessment.countedCash),
        expectedCash: moneyToWire(assessment.expectedCash),
        difference: moneyToWire(assessment.difference),
        approvalId,
        denominations,
        openOrdersCarried: 0,
      },
    },
  });
}
