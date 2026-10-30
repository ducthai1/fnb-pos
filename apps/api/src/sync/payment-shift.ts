import { appendChange } from "./change-feed";
import { shiftSnapshotOf } from "./shift-snapshot";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { CASH_METHOD, readShift, readUnclosedShiftOfDevice } from "./stored-shift";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

export interface PaymentShift {
  /** Null when the till names no shift and has none open: pay and refund are refused so. */
  readonly shiftId: string | null;
  /** The shift had already closed when the payment reached the server. */
  readonly afterClose: boolean;
}

/**
 * The shift a payment's cash went into. A till names the shift it was in when it took the
 * money: offline, that shift may have been closed on the counter before the payment syncs,
 * and the sale still belongs to it (to its day and its drawer), not to whatever shift is
 * open when it arrives. The named shift must be of the till's branch: a handheld settles
 * into the counter's shift, never into another branch's. A till that names none pays into
 * its own open shift.
 */
export async function shiftForPayment(
  context: SyncCommandContext,
  namedShiftId: string | undefined,
): Promise<PaymentShift> {
  const { client, device } = context;
  if (namedShiftId === undefined) {
    const open = await readUnclosedShiftOfDevice(client, device.deviceId, true);
    return { shiftId: open?.id ?? null, afterClose: false };
  }
  // Locked so a close cannot slip between reading the status and recording the payment.
  const shift = await readShift(client, namedShiftId, true);
  if (shift === null || shift.branchId !== device.branchId) {
    throw new CommandRejection(C.shiftNotFound);
  }
  return { shiftId: shift.id, afterClose: shift.status === "closed" };
}

/**
 * Cash paid into or out of a shift changes what its drawer should hold, so the shift goes
 * out again (its version counts the cash book's entries): every till showing it, the one
 * that will close it included, then expects the server's figure rather than rebuilding one
 * from the orders it happens to hold (a table opened in the previous shift, a handheld
 * paying into the counter's drawer). A payment recorded against a closed shift goes out
 * the same way, with the adjustment beside its unchanged close.
 */
export async function announceShiftCash(
  context: SyncCommandContext,
  paid: PaymentShift,
  methods: readonly string[],
) {
  if (paid.shiftId === null) return;
  if (!paid.afterClose && !methods.includes(CASH_METHOD)) return;
  const { client, device, command } = context;
  const shift = await readShift(client, paid.shiftId, false);
  if (shift === null) return;
  const snapshot = await shiftSnapshotOf(client, shift);
  await appendChange(client, device.tenantId, {
    branchId: shift.branchId,
    entity: "shift",
    entityId: shift.id,
    snapshot,
    commandId: command.commandId,
  });
  // The till holds this cash in its expected figure until its copy reaches this version.
  context.answer.shiftVersion = snapshot.version;
}
