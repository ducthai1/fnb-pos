import type { OrderLine } from "@fnb/domain";
import { BadgePercent, Ban, ShoppingBag, ShoppingCart } from "lucide-react";
import { lineHeld } from "../../features/order/cart-change-guard";
import type { CounterOrder } from "../../features/order/counter-order";
import type { CartView } from "../../features/order/cart-view";
import { callNumberOf } from "../../features/order/device-order-number";
import type { KeptLines } from "../../features/order/price-counter-order";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { EmptyState } from "../shared/state-view";
import { useTillKey } from "../shared/use-till-key";
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
  const payable = priced !== null && order.lines.length > 0;
  useTillKey(S.keys.pay, on.onCheckout, payable);
  return (
    <section className="pos-cart" aria-label={S.cartLabel}>
      <p className="pos-cart__number">
        <strong>{S.orderNumber(order.deviceOrderNo)}</strong>
        <span className="pos-badge" data-tone="info">
          {S.callNumber(callNumberOf(order.deviceOrderNo))}
        </span>
      </p>
      <ServiceTypePicker order={order} onChange={on.onServiceType} />
      {order.lines.length === 0 ? <EmptyState icon={ShoppingBag} title={S.cartEmpty} /> : null}
      <ul className="pos-list pos-cart__lines">
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
      <div className="pos-cart__foot">
        <CartTotals view={view} />
        {on.adjust === undefined || order.lines.length === 0 ? null : (
          <OrderTools adjust={on.adjust} />
        )}
        <button
          type="button"
          className="pos-button pos-button--primary pos-cart__checkout"
          disabled={!payable}
          onClick={on.onCheckout}
        >
          <Icon of={ShoppingCart} size={24} />
          {S.checkout}
          <kbd className="pos-kbd pos-kbd--on-brand" aria-hidden>
            {S.keys.pay}
          </kbd>
        </button>
      </div>
    </section>
  );
}

/** The order's own tools: a discount on all of it, cancelling it. */
export function OrderTools({ adjust }: { adjust: OrderAdjustments }) {
  const T = vi.adjust.tools;
  return (
    <div className="pos-line-tools">
      <button type="button" className="pos-button pos-button--sm" onClick={adjust.onDiscountOrder}>
        <Icon of={BadgePercent} />
        {T.orderDiscount}
      </button>
      <button
        type="button"
        className="pos-button pos-button--danger pos-button--sm"
        onClick={adjust.onCancelOrder}
      >
        <Icon of={Ban} />
        {T.cancelOrder}
      </button>
    </div>
  );
}
