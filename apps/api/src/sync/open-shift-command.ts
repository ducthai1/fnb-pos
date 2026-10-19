import { vnd } from "@fnb/domain";
import { transitionShift } from "@fnb/domain/shift";
import { confirmedCount, insertShiftCount } from "./shift-counts";
import type { OpenShiftPayload } from "./shift-request-schemas";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { readUnclosedShiftOfDevice } from "./stored-shift";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

/**
 * shift.open: the till's drawer starts a shift on the float the cashier counted. One shift
 * per till at a time; the till that holds the drawer opens it, and the branch's other tills
 * may take payments into it by naming it. The float's notes, when sent, must add up to it.
 * The count happens on the till before the command is sent, so the shift is stored open.
 */
export async function openShift(context: SyncCommandContext, payload: OpenShiftPayload) {
  const { client, device, staffId, command } = context;
  if ((await readUnclosedShiftOfDevice(client, device.deviceId, true)) !== null) {
    throw new CommandRejection(C.shiftAlreadyOpen);
  }
  const openingCash = vnd(payload.openingCash);
  const count =
    payload.denominations === undefined
      ? null
      : confirmedCount(payload.openingCash, payload.denominations);
  // An id taken by any shift, even one of another tenant this one cannot see, is refused
  // by the primary key without letting the till learn anything about that shift.
  const inserted = await client.query(
    "INSERT INTO shift (id, tenant_id, branch_id, device_id, status, opened_by_staff_id, " +
      "opening_cash, business_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6) " +
      "ON CONFLICT (id) DO NOTHING",
    [
      payload.shiftId,
      device.tenantId,
      device.branchId,
      device.deviceId,
      transitionShift("opening", "open"),
      staffId,
      openingCash,
      command.businessDate,
    ],
  );
  if (inserted.rowCount !== 1) throw new CommandRejection(C.shiftIdTaken);
  if (count !== null) {
    await insertShiftCount(
      client,
      device.tenantId,
      payload.shiftId,
      "opening",
      count.counts,
      staffId,
    );
  }
  return payload.shiftId;
}
