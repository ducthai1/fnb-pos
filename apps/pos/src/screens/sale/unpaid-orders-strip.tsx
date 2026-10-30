import { formatVnd } from "@fnb/domain";
import { ReceiptText } from "lucide-react";
import { useRef } from "react";
import type { UnpaidCounterOrder } from "../../features/order/unpaid-counter-orders";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { usePresence } from "../shared/use-leave-motion";

const T = vi.sale.unpaid;

export interface UnpaidOrdersStripProps {
  readonly orders: readonly UnpaidCounterOrder[];
  onReopen(order: UnpaidCounterOrder): void;
  onCancel(order: UnpaidCounterOrder): void;
}

/**
 * Orders left unpaid on the counter, one row each: which, how many items, how much, then
 * open it again or cancel it. The strip eases out when the last one is dealt with, showing the
 * rows it had until it is gone.
 */
export function UnpaidOrdersStrip(props: UnpaidOrdersStripProps) {
  const open = props.orders.length > 0;
  const { present, leaving } = usePresence(open, "--t-exit");
  const last = useRef(props.orders);
  if (open) last.current = props.orders;
  if (!present) return null;
  const rows = open ? props.orders : last.current;
  return (
    <section
      className="pos-unpaid"
      aria-label={T.label}
      data-unpaid-orders={rows.length}
      {...(leaving ? { "data-leaving": "" } : {})}
    >
      <ul className="pos-unpaid__list">
        {rows.map((unpaid) => {
          const no = unpaid.order.deviceOrderNo;
          return (
            <li key={unpaid.order.orderId} className="pos-unpaid__row" data-unpaid-order={no}>
              <span className="pos-unpaid__mark">
                <Icon of={ReceiptText} size={20} />
              </span>
              <span className="pos-unpaid__what pos-wrap">
                <strong>{T.title(no)}</strong>
                <span className="pos-hint">
                  {T.detail(unpaid.items, formatVnd(unpaid.amountDue))}
                </span>
              </span>
              <span className="pos-unpaid__actions">
                <button
                  type="button"
                  className="pos-button pos-button--primary pos-button--sm"
                  aria-label={T.reopenFor(no)}
                  onClick={() => props.onReopen(unpaid)}
                >
                  {T.reopen}
                </button>
                <button
                  type="button"
                  className="pos-button pos-button--quiet pos-button--sm"
                  aria-label={T.cancelFor(no)}
                  onClick={() => props.onCancel(unpaid)}
                >
                  {T.cancel}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
