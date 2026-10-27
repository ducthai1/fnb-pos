import { formatVnd } from "@fnb/domain";
import { FolderOpen, Printer, Undo2 } from "lucide-react";
import type { HistoryEntry } from "../../features/history/order-history";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { SideDrawer } from "../shared/side-drawer";
import { STATUS_TONE, clockOf, whereOf } from "./history-entry-parts";

const H = vi.history;

export interface HistoryActions {
  onReopen(entry: HistoryEntry): void;
  onRefund(entry: HistoryEntry): void;
  onReprint(entry: HistoryEntry): void;
}

/** One order of the history, opened from its row: what it was, and what can be done to it. */
export function HistoryOrderDrawer(
  props: { entry: HistoryEntry; onClose(): void } & HistoryActions,
) {
  const { entry } = props;
  const { order } = entry;
  const no = order.deviceOrderNo;
  const settled = entry.status === "paid" || entry.status === "refunded";
  const where = entry.ownTill ? whereOf(entry) : `${whereOf(entry)} · ${H.otherTill}`;
  return (
    <SideDrawer
      title={H.orderLine(no)}
      subtitle={where}
      closeLabel={H.close}
      onClose={props.onClose}
      foot={
        <div className="pos-history-drawer__actions">
          {entry.status === "draft" ? (
            <button
              type="button"
              className="pos-button pos-button--primary pos-button--lg"
              onClick={() => props.onReopen(entry)}
            >
              <Icon of={FolderOpen} />
              {order.tableId === null ? H.reopen(no) : H.reopenAtTable}
            </button>
          ) : null}
          {settled ? (
            <>
              <button
                type="button"
                className="pos-button pos-button--lg"
                onClick={() => props.onReprint(entry)}
              >
                <Icon of={Printer} />
                {H.reprint(no)}
              </button>
              <button
                type="button"
                className="pos-button pos-button--lg"
                onClick={() => props.onRefund(entry)}
              >
                <Icon of={Undo2} />
                {H.refund(no)}
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <dl className="pos-history-facts">
        <dt>{H.columns.status}</dt>
        <dd>
          <span className="pos-badge" data-tone={STATUS_TONE[entry.status]}>
            {H.filters[entry.status]}
          </span>
        </dd>
        <dt>{H.openedAt}</dt>
        <dd>{clockOf(order.openedAt)}</dd>
        {order.paidAt === null ? null : (
          <>
            <dt>{H.paidAt}</dt>
            <dd>{clockOf(order.paidAt)}</dd>
          </>
        )}
        {entry.refunded > 0n ? (
          <>
            <dt>{H.filters.refunded}</dt>
            <dd>{formatVnd(entry.refunded)}</dd>
          </>
        ) : null}
        <dt className="pos-history-facts__total">{H.total}</dt>
        <dd className="pos-history-facts__total">{formatVnd(entry.amountDue)}</dd>
      </dl>
    </SideDrawer>
  );
}
