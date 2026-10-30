import type { DiscountScope } from "@fnb/domain";
import { useEffect, useState } from "react";
import type { AdjustableOrder } from "../features/order/order-session-types";
import { vi } from "../messages/vi";
import type { OrderAdjustments } from "../screens/sale/cart-panel";
import { Alert, ScreenFrame } from "../screens/shared/screen-frame";
import type { AdjustContext } from "./adjust-flow-parts";
import { CancelOrderFlow } from "./cancel-order-flow";
import { DiscountFlow } from "./discount-flow";
import { VoidLineFlow } from "./void-line-flow";

export type { AdjustOutcome } from "./adjust-flow-parts";

export type AdjustStep =
  | { readonly kind: "void"; readonly lineId: string }
  | { readonly kind: "discount"; readonly scope: DiscountScope }
  | { readonly kind: "cancel" }
  /** The table's order has nothing on it: close it so the table is free again. */
  | { readonly kind: "release" };

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
  return <CancelOrderFlow {...context} release={step.kind === "release"} />;
}
