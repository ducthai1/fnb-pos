import { formatVnd } from "@fnb/domain";
import { Clock, Users } from "lucide-react";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { seatedFor } from "../../features/floor/seated-time";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const F = vi.tables.floor;

/**
 * One table: its name, its status in words (never by colour alone), and for guests seated
 * there how long they have sat and what their order comes to, as the domain totals it. On
 * the plan it takes its shape (round tables are round) and drops the seat count.
 */
export function TableTile(props: {
  table: FloorTableView;
  now: number;
  onPlan?: boolean;
  onOpen(): void;
}) {
  const { table, now } = props;
  const seated = table.status !== "free";
  return (
    <button
      type="button"
      className={`pos-table pos-table--${table.status}`}
      data-table={table.id}
      data-table-status={table.status}
      data-shape={props.onPlan === true ? (table.layout?.shape ?? "rectangle") : undefined}
      onClick={props.onOpen}
    >
      <span className="pos-table__name pos-wrap">{table.name}</span>
      <span className="pos-table__status">{F.status[table.status]}</span>
      {table.seats > 0 && props.onPlan !== true ? (
        <span className="pos-table__fact">
          <Icon of={Users} size={16} />
          {F.seats(table.seats)}
        </span>
      ) : null}
      {seated ? (
        <span className="pos-table__fact">
          <Icon of={Clock} size={16} />
          {seatedFor(table.openedAt, now)}
        </span>
      ) : null}
      {seated && table.amountDue !== null ? (
        <span className="pos-table__amount" data-table-amount={String(table.amountDue)}>
          {formatVnd(table.amountDue)}
        </span>
      ) : null}
    </button>
  );
}
