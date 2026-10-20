import type { ReactNode } from "react";
import type { CartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import type { KeptLines } from "../../features/order/price-counter-order";
import { vi } from "../../messages/vi";
import { CartRow, type CartPanelProps, CartTotals } from "../sale/cart-panel";

const S = vi.sale;
const T = vi.tables.order;

export interface TableCartProps extends Pick<CartPanelProps, "onQuantity" | "onRemove"> {
  order: CounterOrder;
  view: CartView;
  /** Items the kitchen has: shown as sent, never changed from here. */
  kept: KeptLines;
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
export function TableCart({ order, view, kept, owed, actions, ...on }: TableCartProps) {
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
          const sent = kept.has(line.lineId);
          const badge = sent || owed.has(line.lineId) ? <Badge sent={sent} /> : null;
          return (
            <CartRow
              key={line.lineId}
              line={line}
              priced={priced}
              view={view}
              badge={badge}
              locked={sent}
              {...on}
            />
          );
        })}
      </ul>
      <CartTotals view={view} />
      <div className="pos-table-actions">{actions}</div>
    </section>
  );
}
