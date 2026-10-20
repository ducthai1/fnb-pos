import type { DiscountScope } from "@fnb/domain";
import { useEffect, useState } from "react";
import {
  cancelOrderCommand,
  kitchenStillHasItems,
} from "../features/order-adjust/cancel-order-command";
import type { AdjustableOrder } from "../features/order/order-session-types";
import { paidQrOfOrder } from "../features/payment/settled-qr";
import { vi } from "../messages/vi";
import { CancelOrderScreen } from "../screens/order-adjust/cancel-order-screen";
import type { OrderAdjustments } from "../screens/sale/cart-panel";
import { Alert, ScreenFrame } from "../screens/shared/screen-frame";
import { type AdjustContext, attempt } from "./adjust-flow-parts";
import { DiscountFlow } from "./discount-flow";
import { VoidLineFlow } from "./void-line-flow";

export type { AdjustOutcome } from "./adjust-flow-parts";

export type AdjustStep =
  | { readonly kind: "void"; readonly lineId: string }
  | { readonly kind: "discount"; readonly scope: DiscountScope }
  | { readonly kind: "cancel" };

/** The cart's adjustment buttons, each opening its step. */
export const adjustmentsFor = (open: (step: AdjustStep) => void): OrderAdjustments => ({
  onVoid: (lineId) => open({ kind: "void", lineId }),
  onDiscount: (lineId) => open({ kind: "discount", scope: { kind: "line", lineId } }),
  onDiscountOrder: () => open({ kind: "discount", scope: { kind: "order" } }),
  onCancelOrder: () => open({ kind: "cancel" }),
});

export type OrderAdjustmentFlowProps = Omit<AdjustContext, "settled"> & { step: AdjustStep };

/**
 * Voiding an item, discounting it or the order, cancelling the draft: each built on the order
 * as last saved (read once, after every queued save), judged by the domain, and approved on
 * the spot when the cashier may not do it alone.
 */
export function OrderAdjustmentFlow(props: OrderAdjustmentFlowProps) {
  const { step, session } = props;
  const [settled, setSettled] = useState<AdjustableOrder | null | undefined>(undefined);
  // Read once on opening: nothing changes the order behind this screen.
  const [read] = useState(() => session.adjustable());
  useEffect(() => {
    let live = true;
    void read.then((found) => live && setSettled(found));
    return () => {
      live = false;
    };
  }, [read]);

  if (settled === undefined || settled === null) {
    return (
      <ScreenFrame title={vi.adjust.checking}>
        {props.header}
        {settled === null ? (
          <Alert message={vi.adjust.notSaved} />
        ) : (
          <div className="pos-spinner" />
        )}
        <button type="button" className="pos-button" onClick={() => props.onDone({ kind: "back" })}>
          {vi.adjust.back}
        </button>
      </ScreenFrame>
    );
  }
  const context: AdjustContext = { ...props, settled };
  if (step.kind === "void") return <VoidLineFlow {...context} lineId={step.lineId} />;
  if (step.kind === "discount") return <DiscountFlow {...context} scope={step.scope} />;
  return (
    <CancelOrderScreen
      header={props.header}
      orderNo={settled.order.deviceOrderNo}
      onBack={() => props.onDone({ kind: "back" })}
      onConfirm={(reasonCode) =>
        attempt(async () => {
          if (kitchenStillHasItems(settled)) return vi.errors.SYNC_ORDER_HAS_SENT_ITEMS;
          if ((await paidQrOfOrder(props.client, settled.order.orderId)) !== null) {
            return vi.errors.SYNC_ORDER_HAS_SETTLED_QR;
          }
          const now = await session.adjustable();
          if (now === null) return vi.adjust.notSaved;
          await session.record(cancelOrderCommand(props.place, now, reasonCode, Date.now()));
          props.onDone({ kind: "cancelled" });
          return null;
        })
      }
    />
  );
}
