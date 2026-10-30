import type pg from "pg";
import { paymentIntentSnapshotOf, readPaymentIntent } from "../payments/payment-intent-store";
import type { DeviceAuth } from "../devices/device-auth-hook";
import { orderSnapshotOf } from "./order-snapshot";
import { shiftSnapshotOf } from "./shift-snapshot";
import { readStoredOrder } from "./stored-order";
import { readShift } from "./stored-shift";
import type { CommandSnapshot } from "./sync-wire-types";

/**
 * The row a command was about: its snapshot answers the command and goes into the feed. A
 * print job's log is the backoffice's, never a till's, so it has no snapshot to send.
 */
export interface CommandSubject {
  readonly entity: "order" | "shift" | "print_job" | "payment_intent" | "dismissal";
  readonly id: string;
}

/**
 * The subject as the server holds it now, or null when there is none to show. A till sees
 * rows of its own branch only, even in the answer to its own command.
 */
export async function subjectSnapshotOf(
  client: pg.ClientBase,
  device: DeviceAuth,
  subject: CommandSubject,
): Promise<CommandSnapshot | null> {
  if (subject.entity === "print_job" || subject.entity === "dismissal") return null;
  if (subject.entity === "payment_intent") {
    const intent = await readPaymentIntent(client, subject.id, false);
    if (intent === null || intent.branchId !== device.branchId) return null;
    return paymentIntentSnapshotOf(intent);
  }
  if (subject.entity === "shift") {
    const shift = await readShift(client, subject.id, false);
    if (shift === null || shift.branchId !== device.branchId) return null;
    return shiftSnapshotOf(client, shift);
  }
  const found = await readStoredOrder(client, subject.id, false);
  return found === null || found.branchId !== device.branchId ? null : orderSnapshotOf(found);
}
