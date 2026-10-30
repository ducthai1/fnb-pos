import { dismissRejectionPayloadSchema } from "@fnb/contracts";
import type { LocalCommand, RejectedCommand } from "@fnb/sync-client";
import { orderIdOfRejected } from "../payment/use-settled-qr-closing";
import { type ChosenReason, reasonOnWire } from "../order-adjust/reason-codes";
import { type TillPlace, tillCommand } from "../order/till-command";

/**
 * sync.rejection_dismissed: the staff set aside a command the server refused, with why. The
 * server keeps who, what and why in its audit trail; the refused command itself is not sent
 * again.
 */
export function dismissRejectionCommand(
  place: TillPlace,
  refused: RejectedCommand,
  reason: ChosenReason,
  at: number,
  /** What the till worked out beyond the refused command itself: its order, a manager's approval. */
  extra: { orderId?: string | null; approvalId?: string | null } = {},
): LocalCommand {
  const orderId = extra.orderId ?? orderIdOfRejected(refused);
  const id = refused.command.commandId;
  const payload = {
    rejectedCommandId: id,
    rejectedType: refused.command.type,
    rejectedCode: refused.code,
    ...(orderId === null ? {} : { orderId }),
    ...reasonOnWire(reason),
    ...(extra.approvalId == null ? {} : { approvalId: extra.approvalId }),
  };
  return tillCommand(
    place,
    "sync.rejection_dismissed",
    dismissRejectionPayloadSchema,
    payload,
    at,
    {
      entity: "dismissal",
      entityId: id,
      optimistic: { id, version: 0, status: "dismissed" },
    },
  );
}
