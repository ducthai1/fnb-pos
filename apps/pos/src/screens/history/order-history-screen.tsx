import { formatVnd } from "@fnb/domain";
import { ArrowLeft, FolderOpen, Printer, ReceiptText, Search, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import type { HistoryEntry, HistoryFilter } from "../../features/history/order-history";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";
import { EmptyState } from "../shared/state-view";

const H = vi.history;

/** The colour beside each status word: paid is done, a draft still waits, the rest undone. */
const STATUS_TONE: Readonly<Record<HistoryEntry["status"], string>> = {
  draft: "info",
  paid: "ok",
  cancelled: "danger",
  refunded: "warn",
};
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
    <ScreenFrame
      title={H.title}
      wide
      dock={
        <div className="pos-actions pos-actions--split">
          <button type="button" className="pos-button" onClick={props.onBack}>
            <Icon of={ArrowLeft} />
            {H.back}
          </button>
        </div>
      }
    >
      {props.header}
      <p className="pos-hint">{H.day(props.day)}</p>
      <div className="pos-history-bar">
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
        <label className="pos-field pos-history-bar__search">
          <span className="pos-field__label">{H.search}</span>
          <span className="pos-search">
            <Icon of={Search} />
            <input
              className="pos-input pos-search__input"
              inputMode="numeric"
              value={props.search}
              onChange={(event) => props.onSearch(event.target.value)}
            />
          </span>
        </label>
      </div>
      {props.entries.length === 0 ? <EmptyState icon={ReceiptText} title={H.empty} /> : null}
      <ul className="pos-list pos-history-list">
        {props.entries.map((entry) => (
          <HistoryRow key={entry.order.orderId} entry={entry} {...props} />
        ))}
      </ul>
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
        <span className="pos-badge" data-tone={STATUS_TONE[entry.status]}>
          {H.filters[entry.status]}
        </span>
        <span className="pos-history-row__amount">{formatVnd(entry.amountDue)}</span>
      </div>
      <p className="pos-hint pos-wrap">
        {where}
        {entry.ownTill ? "" : ` · ${H.otherTill}`}
        {entry.refunded > 0n ? ` · ${H.refunded(formatVnd(entry.refunded))}` : ""}
      </p>
      <div className="pos-line-tools">
        {entry.status === "draft" ? (
          <button
            type="button"
            className="pos-button pos-button--secondary pos-button--sm"
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
              className="pos-button pos-button--sm"
              onClick={() => props.onRefund(entry)}
            >
              <Icon of={Undo2} />
              {H.refund(no)}
            </button>
            <button
              type="button"
              className="pos-button pos-button--sm"
              onClick={() => props.onReprint(entry)}
            >
              <Icon of={Printer} />
              {H.reprint(no)}
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}
