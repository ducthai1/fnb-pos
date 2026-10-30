import {
  cancelNeedsManager,
  closeUnpaidTable,
  cancelOrderCommand,
  kitchenStillHasItems,
} from "../features/order-adjust/cancel-order-command";
import { paidQrOfOrder } from "../features/payment/settled-qr";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { vi } from "../messages/vi";
import { CancelOrderScreen } from "../screens/order-adjust/cancel-order-screen";
import { type AdjustContext, approvalOf, attempt } from "./adjust-flow-parts";

/**
 * Cancelling the draft (or, with `release`, closing a table's order that has nothing on it): refused while the kitchen still has units of it or the bank paid a
 * QR of it; once guests were shown a bill or the kitchen was sent part of it, closing it
 * unpaid needs close_unpaid_table, approved on the spot when the cashier lacks it.
 */
export function CancelOrderFlow(props: AdjustContext & { release?: boolean }) {
  const { settled, session } = props;
  const gate = useApprovalGate();
  if (gate.sheet !== null) return gate.sheet;
  const orderId = settled.order.orderId;
  return (
    <CancelOrderScreen
      header={props.header}
      orderNo={settled.order.deviceOrderNo}
      {...(props.release === true ? { release: settled.order.table?.name ?? "" } : {})}
      onBack={() => props.onDone({ kind: "back" })}
      onConfirm={(reason) =>
        attempt(async () => {
          if (kitchenStillHasItems(settled)) return vi.errors.SYNC_ORDER_HAS_SENT_ITEMS;
          if ((await paidQrOfOrder(props.client, orderId)) !== null) {
            return vi.errors.SYNC_ORDER_HAS_SETTLED_QR;
          }
          const row = (await props.client.snapshots("order")).find((v) => v.entityId === orderId);
          let approvalId: string | null = null;
          if (cancelNeedsManager(settled, row?.snapshot ?? null)) {
            const said = vi.approval.actions.closeUnpaid(settled.order.deviceOrderNo);
            const outcome = await gate.require(closeUnpaidTable(orderId), said);
            if (outcome.kind === "denied") return vi.approval.denied;
            const approval = approvalOf(outcome);
            if (approval === undefined) return null;
            approvalId = approval?.approvalId ?? null;
          }
          const now = await session.adjustable();
          if (now === null) return vi.adjust.notSaved;
          await session.record(
            cancelOrderCommand(props.place, now, reason, approvalId, Date.now()),
          );
          props.onDone({ kind: "cancelled" });
          return null;
        })
      }
    />
  );
}
