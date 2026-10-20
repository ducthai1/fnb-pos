import type { OrderLine } from "@fnb/domain";
import { lineHeld } from "../../features/order/cart-change-guard";
import type { CounterOrder } from "../../features/order/counter-order";
import type { CartView } from "../../features/order/cart-view";
import { callNumberOf } from "../../features/order/device-order-number";
import type { KeptLines } from "../../features/order/price-counter-order";
import { vi } from "../../messages/vi";
import { CartRow, type CartRowActions, type LineAdjustments } from "./cart-row";
import { CartTotals } from "./cart-totals";
import { ServiceTypePicker } from "./service-type-picker";

export { CartRow } from "./cart-row";
export { CartTotals } from "./cart-totals";

const S = vi.sale;

/** What can be done to the saved order beyond its items: a discount on all of it, cancelling it. */
export interface OrderAdjustments extends LineAdjustments {
  onDiscountOrder(): void;
  onCancelOrder(): void;
}

export interface CartPanelProps extends CartRowActions {
  order: CounterOrder;
  view: CartView;
  /** Items held as stored, and the lines commands made (discounts, cancel lines). */
  kept?: KeptLines;
  commandLines?: readonly OrderLine[];
  /** Offered once the order is saved on the till. */
  adjust?: OrderAdjustments | undefined;
  onServiceType(serviceType: CounterOrder["serviceType"], tableTag: string): void;
  onCheckout(): void;
}

const NONE: KeptLines = new Map();

/** The order as a tree (options indented under their item), with the domain's totals. */
export function CartPanel({ order, view, kept = NONE, commandLines = [], ...on }: CartPanelProps) {
  const priced = view.kind === "priced" ? view.priced : null;
  return (
    <section className="pos-cart" aria-label={S.cartLabel}>
      <p className="pos-cart__number">
        <strong>{S.orderNumber(order.deviceOrderNo)}</strong> ·{" "}
        {S.callNumber(callNumberOf(order.deviceOrderNo))}
      </p>
      <ServiceTypePicker order={order} onChange={on.onServiceType} />
      {order.lines.length === 0 ? <p className="pos-hint">{S.cartEmpty}</p> : null}
      <ul className="pos-list">
        {order.lines.map((line) => (
          <CartRow
            key={line.lineId}
            line={line}
            priced={priced?.lines ?? []}
            view={view}
            locked={lineHeld(line.lineId, kept, commandLines)}
            adjust={on.adjust}
            onQuantity={on.onQuantity}
            onRemove={on.onRemove}
          />
        ))}
      </ul>
      <CartTotals view={view} />
      {on.adjust === undefined || order.lines.length === 0 ? null : (
        <OrderTools adjust={on.adjust} />
      )}
      <button
        type="button"
        className="pos-button pos-button--primary pos-cart__checkout"
        disabled={priced === null || order.lines.length === 0}
        onClick={on.onCheckout}
      >
        {S.checkout}
      </button>
    </section>
  );
}

/** The order's own tools: a discount on all of it, cancelling it. */
export function OrderTools({ adjust }: { adjust: OrderAdjustments }) {
  const T = vi.adjust.tools;
  return (
    <div className="pos-line-tools">
      <button type="button" className="pos-button" onClick={adjust.onDiscountOrder}>
        {T.orderDiscount}
      </button>
      <button type="button" className="pos-button" onClick={adjust.onCancelOrder}>
        {T.cancelOrder}
      </button>
    </div>
  );
}
