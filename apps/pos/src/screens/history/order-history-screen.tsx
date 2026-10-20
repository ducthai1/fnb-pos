import { formatVnd } from "@fnb/domain";
import type { ReactNode } from "react";
import type { HistoryEntry, HistoryFilter } from "../../features/history/order-history";
import { vi } from "../../messages/vi";
import { ScreenFrame } from "../shared/screen-frame";

const H = vi.history;
const FILTERS: readonly HistoryFilter[] = ["all", "draft", "paid", "cancelled", "refunded"];

export interface OrderHistoryScreenProps {
  header: ReactNode;
  day: string;
  entries: readonly HistoryEntry[];
  filter: HistoryFilter;
  search: string;
  onFilter(filter: HistoryFilter): void;
  onSearch(search: string): void;
  onReopen(entry: HistoryEntry): void;
  onRefund(entry: HistoryEntry): void;
  onReprint(entry: HistoryEntry): void;
  onBack(): void;
}

/** The day's orders the till holds: drafts to reopen, sales to refund or print again. */
export function OrderHistoryScreen(props: OrderHistoryScreenProps) {
  return (
    <ScreenFrame title={H.title}>
      {props.header}
      <p className="pos-hint">{H.day(props.day)}</p>
      <div className="pos-tabs" role="group" aria-label={H.title}>
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className="pos-button pos-tab"
            aria-pressed={props.filter === filter}
            onClick={() => props.onFilter(filter)}
          >
            {H.filters[filter]}
          </button>
        ))}
      </div>
      <label className="pos-field">
        <span className="pos-field__label">{H.search}</span>
        <input
          className="pos-input"
          inputMode="numeric"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
        />
      </label>
      {props.entries.length === 0 ? <p className="pos-hint">{H.empty}</p> : null}
      <ul className="pos-list">
        {props.entries.map((entry) => (
          <HistoryRow key={entry.order.orderId} entry={entry} {...props} />
        ))}
      </ul>
      <button type="button" className="pos-button" onClick={props.onBack}>
        {H.back}
      </button>
    </ScreenFrame>
  );
}

function HistoryRow(props: { entry: HistoryEntry } & OrderHistoryScreenProps) {
  const { entry } = props;
  const { order } = entry;
  const no = order.deviceOrderNo;
  const where =
    order.tableName !== null
      ? H.where.table(order.tableName)
      : order.tableTag !== null
        ? H.where.table(order.tableTag)
        : H.where.takeaway;
  const settled = entry.status === "paid" || entry.status === "refunded";
  return (
    <li className="pos-card pos-history-row" data-history-order={no} data-status={entry.status}>
      <div className="pos-history-row__head">
        <strong>{H.orderLine(no)}</strong>
        <span className="pos-badge">{H.filters[entry.status]}</span>
        <span>{formatVnd(entry.amountDue)}</span>
      </div>
      <p className="pos-hint pos-wrap">
        {where}
        {entry.ownTill ? "" : ` · ${H.otherTill}`}
        {entry.refunded > 0n ? ` · ${H.refunded(formatVnd(entry.refunded))}` : ""}
      </p>
      <div className="pos-line-tools">
        {entry.status === "draft" ? (
          <button type="button" className="pos-button" onClick={() => props.onReopen(entry)}>
            {order.tableId === null ? H.reopen(no) : H.reopenAtTable}
          </button>
        ) : null}
        {settled ? (
          <>
            <button type="button" className="pos-button" onClick={() => props.onRefund(entry)}>
              {H.refund(no)}
            </button>
            <button type="button" className="pos-button" onClick={() => props.onReprint(entry)}>
              {H.reprint(no)}
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}
