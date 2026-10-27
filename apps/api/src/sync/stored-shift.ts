import { type Vnd, negateVnd, vnd } from "@fnb/domain";
import type { ShiftCashEvent, ShiftCashLedger, ShiftStatus } from "@fnb/domain/shift";
import type pg from "pg";

/** The payment method key whose payments go into the drawer. */
export const CASH_METHOD = "cash";

export interface StoredShift {
  readonly id: string;
  readonly branchId: string;
  readonly deviceId: string | null;
  readonly status: ShiftStatus;
  readonly businessDate: string;
  readonly version: number;
  readonly openedByStaffId: string;
  readonly openingCash: Vnd;
  readonly closedByStaffId: string | null;
  readonly countedCash: Vnd | null;
  readonly expectedCash: Vnd | null;
  readonly difference: Vnd | null;
  readonly closeApprovalId: string | null;
  readonly openOrdersCarried: number | null;
}

interface ShiftRow {
  id: string;
  branch_id: string;
  device_id: string | null;
  status: ShiftStatus;
  business_date: string;
  version: number;
  opened_by_staff_id: string;
  opening_cash: string;
  closed_by_staff_id: string | null;
  counted_cash: string | null;
  expected_cash: string | null;
  difference: string | null;
  close_approval_id: string | null;
  open_orders_carried: number | null;
}

// business_date as text, as for orders: a Date would shift the day off UTC+7.
const SHIFT_COLUMNS =
  "id, branch_id, device_id, status, business_date::text AS business_date, version, " +
  "opened_by_staff_id, opening_cash, closed_by_staff_id, counted_cash, expected_cash, " +
  "difference, close_approval_id, open_orders_carried";

const money = (value: string | null): Vnd | null => (value === null ? null : vnd(BigInt(value)));

function shiftOf(row: ShiftRow): StoredShift {
  return {
    id: row.id,
    branchId: row.branch_id,
    deviceId: row.device_id,
    status: row.status,
    businessDate: row.business_date,
    version: row.version,
    openedByStaffId: row.opened_by_staff_id,
    openingCash: vnd(BigInt(row.opening_cash)),
    closedByStaffId: row.closed_by_staff_id,
    countedCash: money(row.counted_cash),
    expectedCash: money(row.expected_cash),
    difference: money(row.difference),
    closeApprovalId: row.close_approval_id,
    openOrdersCarried: row.open_orders_carried,
  };
}

/** The shift by id in this tenant, or null; `lock` holds it until COMMIT. */
export async function readShift(
  client: pg.ClientBase,
  shiftId: string,
  lock: boolean,
): Promise<StoredShift | null> {
  const { rows } = await client.query<ShiftRow>(
    `SELECT ${SHIFT_COLUMNS} FROM shift WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [shiftId],
  );
  return rows[0] === undefined ? null : shiftOf(rows[0]);
}

/** The till's shift that is not closed yet, of which there is at most one. */
export async function readUnclosedShiftOfDevice(
  client: pg.ClientBase,
  deviceId: string,
  lock: boolean,
): Promise<StoredShift | null> {
  const { rows } = await client.query<ShiftRow>(
    `SELECT ${SHIFT_COLUMNS} FROM shift WHERE device_id = $1 AND status <> 'closed'` +
      (lock ? " FOR UPDATE" : ""),
    [deviceId],
  );
  return rows[0] === undefined ? null : shiftOf(rows[0]);
}

export interface ShiftCashBook {
  /** Everything that reached the server before the close (all of it, while open). */
  readonly ledger: ShiftCashLedger;
  /** Cash of sales made during the shift that reached the server after its close. */
  readonly recordedAfterClose: readonly ShiftCashEvent[];
  /**
   * How many entries the book holds. Entries are only ever added (a closed order keeps its
   * payments, a cash move is never undone), so the count rises with every change to it.
   */
  readonly entryCount: number;
}

/**
 * The shift's cash book as the domain reads it. A cash payment is a sale when it took cash
 * in and a refund when it paid cash out (a refund's payments are negative, as its lines).
 */
export async function readShiftCashBook(
  client: pg.ClientBase,
  shift: StoredShift,
): Promise<ShiftCashBook> {
  const payments = await client.query<{ amount: string; late: boolean }>(
    "SELECT amount, recorded_after_shift_close AS late FROM payment " +
      "WHERE shift_id = $1 AND method = $2",
    [shift.id, CASH_METHOD],
  );
  const moves = await client.query<{ kind: "in" | "out"; amount: string; staff_id: string }>(
    "SELECT kind, amount, COALESCE(staff_id, app_user_id) AS staff_id FROM cash_move " +
      "WHERE shift_id = $1",
    [shift.id],
  );
  const onTime: ShiftCashEvent[] = [];
  const late: ShiftCashEvent[] = [];
  for (const row of payments.rows) {
    const amount = vnd(BigInt(row.amount));
    const event: ShiftCashEvent =
      amount < 0n
        ? { kind: "cash_refund", amount: negateVnd(amount) }
        : { kind: "cash_sale", amount };
    (row.late ? late : onTime).push(event);
  }
  for (const row of moves.rows) {
    onTime.push({
      kind: row.kind === "in" ? "cash_in" : "cash_out",
      amount: vnd(BigInt(row.amount)),
      staffId: row.staff_id,
    });
  }
  return {
    ledger: { openingCash: shift.openingCash, events: onTime },
    recordedAfterClose: late,
    entryCount: payments.rows.length + moves.rows.length,
  };
}
