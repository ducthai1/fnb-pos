import { netCashOf } from "@fnb/domain/shift";
import type pg from "pg";
import { moneyToWire } from "../sync/order-snapshot";
import { shiftSnapshotOf } from "../sync/shift-snapshot";
import { readShift, readShiftCashBook } from "../sync/stored-shift";

/** A shift of the day still open, as a manager finds it: which till, and what it should hold. */
export interface DayOpenShift {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  /** Its till can no longer sign in: only a manager can close it now. */
  deviceRevoked: boolean;
  openedAt: string;
  /** The copy's version: a close on its behalf names it, so it counts against these figures. */
  version: number;
  expectedCash: number;
}

/** A shift of the day a manager closed for its revoked till. */
export interface DayShiftClosedOnBehalf {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  closedByAppUserId: string;
  closedAt: string;
  countedCash: number;
  expectedCash: number;
  difference: number;
  /** Cash of the shift's sales that the till sent after the close: beside it, not in it. */
  cashAfterClose: number;
}

/** A closed shift of the day whose sales brought cash in after its close. */
export interface DayShiftCashAfterClose {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  amount: number;
}

export interface DayShifts {
  openShifts: DayOpenShift[];
  closedOnBehalf: DayShiftClosedOnBehalf[];
  cashAfterShiftClose: DayShiftCashAfterClose[];
}

interface ShiftRow {
  id: string;
  device_id: string | null;
  device_name: string | null;
  status: string;
  revoked: boolean;
  created_at: Date;
  closed_at: Date | null;
  closed_by_app_user_id: string | null;
  late: boolean;
}

/**
 * The shifts of a branch's business day a manager has to act on or look at: those still open
 * (with what each drawer should hold, and whether its till is revoked, when only a close on
 * its behalf settles it), those closed for a revoked till, and closed shifts whose sales'
 * cash came in after their close. Few rows a day, so each copy is assembled as the tills get it.
 */
export async function readDayShifts(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
): Promise<DayShifts> {
  const { rows } = await client.query<ShiftRow>(
    "SELECT s.id, s.device_id, d.name AS device_name, s.status, s.created_at, s.closed_at, " +
      "s.closed_by_app_user_id, " +
      "(EXISTS (SELECT 1 FROM device_credential c WHERE c.device_id = s.device_id) AND NOT EXISTS " +
      "(SELECT 1 FROM device_credential c WHERE c.device_id = s.device_id AND c.revoked_at IS NULL)) " +
      "AS revoked, " +
      "EXISTS (SELECT 1 FROM payment p WHERE p.shift_id = s.id AND p.recorded_after_shift_close) AS late " +
      "FROM shift s LEFT JOIN device d ON d.id = s.device_id " +
      "WHERE s.branch_id = $1 AND s.business_date = $2 " +
      "AND (s.status <> 'closed' OR s.closed_by_app_user_id IS NOT NULL OR EXISTS " +
      "(SELECT 1 FROM payment p WHERE p.shift_id = s.id AND p.recorded_after_shift_close)) " +
      "ORDER BY s.id",
    [branchId, businessDate],
  );
  const shifts: DayShifts = { openShifts: [], closedOnBehalf: [], cashAfterShiftClose: [] };
  for (const row of rows) {
    const shift = await readShift(client, row.id, false);
    if (shift === null) continue;
    const till = { deviceId: row.device_id, deviceName: row.device_name };
    if (row.status !== "closed") {
      const copy = await shiftSnapshotOf(client, shift);
      shifts.openShifts.push({
        id: row.id,
        ...till,
        deviceRevoked: row.revoked,
        openedAt: row.created_at.toISOString(),
        version: copy.version,
        expectedCash: copy.figures.expectedCash,
      });
      continue;
    }
    const late = moneyToWire(netCashOf((await readShiftCashBook(client, shift)).recordedAfterClose));
    if (row.closed_by_app_user_id !== null && row.closed_at !== null) {
      shifts.closedOnBehalf.push({
        id: row.id,
        ...till,
        closedByAppUserId: row.closed_by_app_user_id,
        closedAt: row.closed_at.toISOString(),
        countedCash: moneyToWire(shift.countedCash ?? 0n),
        expectedCash: moneyToWire(shift.expectedCash ?? 0n),
        difference: moneyToWire(shift.difference ?? 0n),
        cashAfterClose: late,
      });
    } else if (row.late && late !== 0) {
      shifts.cashAfterShiftClose.push({ id: row.id, ...till, amount: late });
    }
  }
  return shifts;
}
