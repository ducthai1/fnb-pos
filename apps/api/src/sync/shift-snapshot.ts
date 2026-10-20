import { netCashOf, summarizeShiftCash } from "@fnb/domain/shift";
import type pg from "pg";
import { moneyToWire } from "./order-snapshot";
import type {
  DenominationCountSnapshot,
  ShiftCloseSnapshot,
  ShiftSnapshot,
} from "./shift-wire-types";
import { type StoredShift, readShiftCashBook } from "./stored-shift";

async function countsOf(client: pg.ClientBase, shiftId: string) {
  const { rows } = await client.query<{ stage: string; denomination: string; pieces: number }>(
    "SELECT stage, denomination, pieces FROM shift_count WHERE shift_id = $1 " +
      "ORDER BY denomination DESC",
    [shiftId],
  );
  const stage = (name: string): DenominationCountSnapshot[] =>
    rows
      .filter((row) => row.stage === name)
      .map((row) => ({ denomination: moneyToWire(BigInt(row.denomination)), pieces: row.pieces }));
  return { opening: stage("opening"), closing: stage("closing") };
}

function closeOf(shift: StoredShift, denominations: DenominationCountSnapshot[]) {
  const { closedByStaffId, countedCash, expectedCash, difference, openOrdersCarried } = shift;
  if (
    shift.status !== "closed" ||
    closedByStaffId === null ||
    countedCash === null ||
    expectedCash === null ||
    difference === null ||
    openOrdersCarried === null
  ) {
    return null;
  }
  const close: ShiftCloseSnapshot = {
    closedByStaffId,
    countedCash: moneyToWire(countedCash),
    expectedCash: moneyToWire(expectedCash),
    difference: moneyToWire(difference),
    approvalId: shift.closeApprovalId,
    denominations,
    openOrdersCarried,
  };
  return close;
}

/**
 * The whole shift as tills and the closing slip read it. The figures are recomputed from
 * the cash book by the domain; the close is what was stored at the moment of closing, so
 * a late sale shows up beside it (cashRecordedAfterClose) instead of changing it.
 *
 * Its version counts the cash book's entries on top of the row's own version: a cash move,
 * or cash recorded after the close (when the row may no longer change), alters the copy
 * without touching the row, and a till keeps a copy until one strictly newer arrives.
 */
export async function shiftSnapshotOf(
  client: pg.ClientBase,
  shift: StoredShift,
): Promise<ShiftSnapshot> {
  const book = await readShiftCashBook(client, shift);
  const figures = summarizeShiftCash(book.ledger);
  const counts = await countsOf(client, shift.id);
  return {
    id: shift.id,
    branchId: shift.branchId,
    deviceId: shift.deviceId,
    status: shift.status,
    businessDate: shift.businessDate,
    version: shift.version + book.entryCount,
    openedByStaffId: shift.openedByStaffId,
    openingDenominations: counts.opening,
    figures: {
      openingCash: moneyToWire(figures.openingCash),
      cashSales: moneyToWire(figures.cashSales),
      cashRefunds: moneyToWire(figures.cashRefunds),
      cashIn: moneyToWire(figures.cashIn),
      cashOut: moneyToWire(figures.cashOut),
      expectedCash: moneyToWire(figures.expectedCash),
    },
    close: closeOf(shift, counts.closing),
    cashRecordedAfterClose: moneyToWire(netCashOf(book.recordedAfterClose)),
  };
}
