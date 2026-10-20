import type { FloorTableView } from "../../features/floor/floor-tables-view";
import type { ShownTableStatus } from "../../features/floor/shown-table-status";
import { vi } from "../../messages/vi";

const F = vi.tables.floor;
const ORDER: readonly ShownTableStatus[] = [
  "free",
  "occupied",
  "awaiting_payment",
  "changed_after_pre_bill",
];

/** Each status's colour beside its name and how many of the area's tables are in it. */
export function FloorLegend({ tables }: { tables: readonly FloorTableView[] }) {
  return (
    <ul className="pos-legend" aria-label={F.legendLabel}>
      {ORDER.map((status) => (
        <li key={status} className="pos-legend__item">
          <span className={`pos-legend__swatch pos-table--${status}`} aria-hidden />
          {F.status[status]}
          <strong className="pos-legend__count">
            {tables.filter((table) => table.status === status).length}
          </strong>
        </li>
      ))}
    </ul>
  );
}
