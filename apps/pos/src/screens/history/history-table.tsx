import { formatVnd } from "@fnb/domain";
import type { HistoryEntry } from "../../features/history/order-history";
import { vi } from "../../messages/vi";
import { STATUS_TONE, historyClockOf, whereOf } from "./history-entry-parts";

const H = vi.history;
const C = H.columns;

/**
 * The day's orders as a table on a till's screen, newest first: time, number, where, status,
 * total. A row is one tap target that opens the order's drawer with what can be done to it;
 * its number is the button a keyboard or a screen reader reaches.
 */
export function HistoryTable(props: {
  entries: readonly HistoryEntry[];
  onOpen(entry: HistoryEntry): void;
}) {
  return (
    <table className="pos-history-table" aria-label={H.tableLabel}>
      <thead>
        <tr>
          <th scope="col">{C.time}</th>
          <th scope="col">{C.number}</th>
          <th scope="col">{C.where}</th>
          <th scope="col">{C.status}</th>
          <th scope="col" className="pos-history-table__money">
            {C.total}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((entry) => {
          const no = entry.order.deviceOrderNo;
          return (
            <tr
              key={entry.order.orderId}
              data-history-order={no}
              data-status={entry.status}
              onClick={() => props.onOpen(entry)}
            >
              <td className="pos-history-table__time">{historyClockOf(entry)}</td>
              <td>
                <button
                  type="button"
                  className="pos-history-table__open"
                  aria-label={H.openOrder(no)}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onOpen(entry);
                  }}
                >
                  {no}
                </button>
              </td>
              <td className="pos-wrap">
                {whereOf(entry)}
                {entry.ownTill ? null : (
                  <span className="pos-history-table__aside">{H.otherTill}</span>
                )}
              </td>
              <td>
                <span className="pos-badge" data-tone={STATUS_TONE[entry.status]}>
                  {H.filters[entry.status]}
                </span>
              </td>
              <td className="pos-history-table__money">
                {formatVnd(entry.amountDue)}
                {entry.refunded > 0n ? (
                  <span className="pos-history-table__aside">
                    {H.refunded(formatVnd(entry.refunded))}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
