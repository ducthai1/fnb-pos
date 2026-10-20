import type { OrderLine } from "@fnb/domain";
import type { ReactNode } from "react";
import { lineHeld } from "../../features/order/cart-change-guard";
import type { CartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import type { KeptLines } from "../../features/order/price-counter-order";
import { vi } from "../../messages/vi";
import {
  CartRow,
  type CartPanelProps,
  CartTotals,
  type OrderAdjustments,
  OrderTools,
} from "../sale/cart-panel";

const S = vi.sale;
const T = vi.tables.order;

export interface TableCartProps extends Pick<CartPanelProps, "onQuantity" | "onRemove"> {
  order: CounterOrder;
  view: CartView;
  /** Items held as stored (the kitchen has them, or a discount or void points at them). */
  kept: KeptLines;
  /** Discounts and cancel lines the order carries. */
  commandLines?: readonly OrderLine[];
  /** Items the kitchen has: shown as sent. */
  sentIds: ReadonlySet<string>;
  adjust?: OrderAdjustments | undefined;
  /** Items the kitchen has not been sent yet. */
  owed: ReadonlySet<string>;
  /** The buttons under the totals. */
  actions: ReactNode;
}

function Badge({ sent }: { sent: boolean }) {
  return (
    <span className={sent ? "pos-badge pos-badge--sent" : "pos-badge pos-badge--unsent"}>
      {sent ? T.sent : T.unsent}
    </span>
  );
}

/** The table's order: every round so far, what went to the kitchen marked apart from the rest. */
export function TableCart(props: TableCartProps) {
  const { order, view, kept, owed, actions, commandLines = [], ...on } = props;
  const priced = view.kind === "priced" ? view.priced.lines : [];
  return (
    <section className="pos-cart" aria-label={S.cartLabel}>
      <p className="pos-cart__number pos-wrap">
        <strong>{T.tableLabel(order.table?.name ?? "")}</strong> ·{" "}
        {S.orderNumber(order.deviceOrderNo)}
      </p>
      {order.lines.length === 0 ? <p className="pos-hint">{S.cartEmpty}</p> : null}
      <ul className="pos-list">
        {order.lines.map((line) => {
          const sent = props.sentIds.has(line.lineId);
          const badge = sent || owed.has(line.lineId) ? <Badge sent={sent} /> : null;
          return (
            <CartRow
              key={line.lineId}
              line={line}
              priced={priced}
              view={view}
              badge={badge}
              locked={lineHeld(line.lineId, kept, commandLines)}
              adjust={on.adjust}
              onQuantity={on.onQuantity}
              onRemove={on.onRemove}
            />
          );
        })}
      </ul>
      <CartTotals view={view} />
      {on.adjust === undefined || order.lines.length === 0 ? null : (
        <OrderTools adjust={on.adjust} />
      )}
      <div className="pos-table-actions">{actions}</div>
    </section>
  );
}
