import { type CashMovePayload, cashMovePayloadSchema } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import { assertAcceptsCashMoves, cashMoveAction } from "@fnb/domain/shift";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { readShiftCashBook, readUnclosedShiftOfDevice } from "./stored-shift";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection } from "./sync-error-codes";

/**
 * shift.cash_move: cash put into or taken out of the till's drawer outside a sale. The
 * cash_move limit is judged on everything moved through this shift's drawer once this
 * move is made, whoever moved it, so ten small moves (or two cashiers taking turns on one
 * drawer) cannot add up past the cap unseen. Returns the
 * shift id: the answer is the shift with the move in its cash book.
 */
async function moveCash(context: SyncCommandContext, payload: CashMovePayload) {
  const { client, device, staffId } = context;
  const shift = await readUnclosedShiftOfDevice(client, device.deviceId, true);
  if (shift === null) throw new CommandRejection(C.noOpenShift);
  assertAcceptsCashMoves(shift.status);
  const { ledger } = await readShiftCashBook(client, shift);
  const amount = vnd(payload.amount);
  const kind = payload.kind === "in" ? "cash_in" : "cash_out";
  const spent = await requirePermission(
    context,
    cashMoveAction(ledger, { kind, amount, staffId }),
    payload.approvalId,
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
      spent?.approvalId ?? null,
    ],
  );
  if (inserted.rowCount !== 1) throw new CommandRejection(C.cashMoveIdTaken);
  return shift.id;
}

export const cashMoveCommand = defineSyncCommand(
  "shift.cash_move",
  cashMovePayloadSchema,
  moveCash,
  "shift",
);
