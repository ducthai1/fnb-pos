import { appendChange } from "./change-feed";
import { shiftSnapshotOf } from "./shift-snapshot";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import { readShift, readUnclosedShiftOfDevice } from "./stored-shift";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

export interface PaymentShift {
  /** Null when the till names no shift and has none open. */
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
 * A payment recorded against a closed shift changes what its drawer should have held, so
 * the shift goes out again with the adjustment beside its unchanged close.
 */
export async function announceLatePayment(context: SyncCommandContext, paid: PaymentShift) {
  if (!paid.afterClose || paid.shiftId === null) return;
  const { client, device, command } = context;
  const shift = await readShift(client, paid.shiftId, false);
  if (shift === null) return;
  await appendChange(client, device.tenantId, {
    branchId: shift.branchId,
    entity: "shift",
    entityId: shift.id,
    snapshot: await shiftSnapshotOf(client, shift),
    commandId: command.commandId,
  });
}
