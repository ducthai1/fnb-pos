import { type ReactNode, useState } from "react";
import type { FloorArea } from "../../features/floor/floor-occupancy";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import type { SeatedTable } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

const T = vi.tables.transfer;
const F = vi.tables.floor;

export interface TransferTableScreenProps {
  header: ReactNode;
  from: SeatedTable;
  /** The floor as the till sees it, area by area. */
  areas: readonly FloorArea[];
  tables: readonly FloorTableView[];
  /** Moves the guests; a sentence it answers says why they did not move. */
  onMove(to: SeatedTable): Promise<string | null | void>;
  onBack(): void;
}

/**
 * Moving the guests to another table. Only a free one takes them: a table with guests of
 * its own would merge two bills, which the till does not do, and says so when tapped.
 */
export function TransferTableScreen(props: TransferTableScreenProps) {
  const { header, from } = props;
  const [refused, setRefused] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const others = props.tables.filter((table) => table.id !== from.id);
  const choose = (table: FloorTableView) => {
    if (table.status !== "free") {
      setRefused(T.occupied(table.name));
      return;
    }
    setRefused(null);
    setMoving(true);
    props
      .onMove({ id: table.id, name: table.name })
      .then((why) => setRefused(why ?? null), console.error)
      .finally(() => setMoving(false));
  };
  return (
    <ScreenFrame title={T.title(from.name)} wide>
      {header}
      <p className="pos-hint">{T.hint}</p>
      <Alert message={refused} />
      {others.every((table) => table.status !== "free") ? (
        <p className="pos-hint">{T.noFreeTable}</p>
      ) : null}
      {props.areas.map((area) => {
        const shown = others.filter((table) => table.areaId === area.id);
        if (shown.length === 0) return null;
        return (
          <section key={area.id} className="pos-floor-area" aria-label={area.name}>
            <h2 className="pos-floor-area__name pos-wrap">{area.name}</h2>
            <ul className="pos-table-grid">
              {shown.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    className={`pos-table pos-table--${table.status}`}
                    data-table={table.id}
                    data-table-status={table.status}
                    disabled={moving}
                    onClick={() => choose(table)}
                  >
                    <span className="pos-table__name pos-wrap">{table.name}</span>
                    <span className="pos-table__status">{F.status[table.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onBack}>
        {T.back}
      </button>
    </ScreenFrame>
  );
}
