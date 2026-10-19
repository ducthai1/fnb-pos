import { vnd } from "@fnb/domain";
import { assertAcceptsCashMoves, cashMoveAction } from "@fnb/domain/shift";
import type pg from "pg";
import { approvalIdOf, authorizeShiftAction } from "./shift-command-approval";
import type { CashMovePayload } from "./shift-request-schemas";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { readShiftCashBook, readUnclosedShiftOfDevice } from "./stored-shift";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

const usedByCashMove = async (client: pg.ClientBase, approvalId: string) =>
  (await client.query("SELECT 1 FROM cash_move WHERE approval_id = $1", [approvalId])).rowCount !==
  0;

/**
 * shift.cash_move: cash put into or taken out of the till's drawer outside a sale. The
 * cash_move limit is judged on everything the staff member has moved in this shift once
 * this move is made, so ten small moves cannot add up past the cap unseen. Returns the
 * shift id: the answer is the shift with the move in its cash book.
 */
export async function moveCash(context: SyncCommandContext, payload: CashMovePayload) {
  const { client, device, staffId } = context;
  const shift = await readUnclosedShiftOfDevice(client, device.deviceId, true);
  if (shift === null) throw new CommandRejection(C.noOpenShift);
  assertAcceptsCashMoves(shift.status);
  const { ledger } = await readShiftCashBook(client, shift);
  const amount = vnd(payload.amount);
  const kind = payload.kind === "in" ? "cash_in" : "cash_out";
  const approvalId = await authorizeShiftAction(
    context,
    cashMoveAction(ledger, { kind, amount, staffId }),
    approvalIdOf(context, payload.approvalId),
    usedByCashMove,
  );
  const inserted = await client.query(
    "INSERT INTO cash_move (id, tenant_id, shift_id, kind, amount, reason, staff_id, approval_id, " +
      "created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7) ON CONFLICT (id) DO NOTHING",
    [
      payload.cashMoveId,
      device.tenantId,
      shift.id,
      payload.kind,
      amount,
      payload.reason,
      staffId,
      approvalId,
    ],
  );
  if (inserted.rowCount !== 1) throw new CommandRejection(C.cashMoveIdTaken);
  return shift.id;
}
