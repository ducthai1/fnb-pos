import { ACCEPT_CLOSE_DIFFERENCE, assessClosingCount, transitionShift } from "@fnb/domain/shift";
import type pg from "pg";
import { readCloseDifferenceTolerance } from "./close-difference-tolerance";
import { approvalIdOf, authorizeShiftAction } from "./shift-command-approval";
import { confirmedCount, insertShiftCount } from "./shift-counts";
import type { CloseShiftPayload } from "./shift-request-schemas";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { readShiftCashBook, readUnclosedShiftOfDevice } from "./stored-shift";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

const usedByClose = async (client: pg.ClientBase, approvalId: string) =>
  (await client.query("SELECT 1 FROM shift WHERE close_approval_id = $1", [approvalId]))
    .rowCount !== 0;

/**
 * shift.close: settles the till's shift on the cashier's count. The expected cash comes
 * from the server's own cash book, never from the till. A difference beyond the shop's
 * tolerance needs accept_close_difference, held by the cashier or lent by an approval.
 * Drafts still open do not block the close (a late table would keep the shift open all
 * night): they stay drafts and land in whichever shift takes their payment.
 */
export async function closeShift(context: SyncCommandContext, payload: CloseShiftPayload) {
  const { client, device, staffId } = context;
  const shift = await readUnclosedShiftOfDevice(client, device.deviceId, true);
  if (shift === null) throw new CommandRejection(C.noOpenShift);
  // The till counted before sending, so the shift passes through closing in one step.
  const status = transitionShift(transitionShift(shift.status, "closing"), "closed");
  const count = confirmedCount(payload.counted, payload.denominations);
  const { ledger } = await readShiftCashBook(client, shift);
  const tolerance = await readCloseDifferenceTolerance(client, device.deviceId);
  const assessment = assessClosingCount(ledger, count.total, tolerance);
  const approvalId = assessment.needsAcceptance
    ? await authorizeShiftAction(
        context,
        ACCEPT_CLOSE_DIFFERENCE,
        approvalIdOf(context, payload.approvalId),
        usedByClose,
      )
    : null;
  const carried = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM sales_order WHERE device_id = $1 AND status = 'draft'",
    [device.deviceId],
  );
  // Counts first: once the shift is closed nothing more may be written under it.
  await insertShiftCount(client, device.tenantId, shift.id, "closing", count.counts, staffId);
  await client.query(
    "UPDATE shift SET status = $2, closed_at = now(), closed_by_staff_id = $3, counted_cash = $4, " +
      "expected_cash = $5, difference = $6, close_approval_id = $7, open_orders_carried = $8, " +
      "version = version + 1, updated_at = now() WHERE id = $1",
    [
      shift.id,
      status,
      staffId,
      assessment.countedCash,
      assessment.expectedCash,
      assessment.difference,
      approvalId,
      carried.rows[0]?.n ?? 0,
    ],
  );
  return shift.id;
}
