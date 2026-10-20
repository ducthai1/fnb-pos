import { type ReactNode, useState } from "react";
import type { FloorArea } from "../../features/floor/floor-occupancy";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { TableTile } from "./table-tile";

const F = vi.tables.floor;

export interface FloorScreenProps {
  header: ReactNode;
  /** Null until the plan was read once. */
  areas: readonly FloorArea[] | null;
  tables: readonly FloorTableView[];
  now: number;
  loadError: string | null;
  /** A sentence about the last thing done here (guests moved, a refusal). */
  notice: ReactNode;
  onOpenTable(table: FloorTableView): void;
}

/** The branch's tables by area, each with its status, as the till last knows it. */
export function FloorScreen(props: FloorScreenProps) {
  const { header, areas, tables, now } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  const areaId = areas?.some((area) => area.id === chosen) ? chosen : (areas?.[0]?.id ?? null);
  const shown = tables.filter((table) => table.areaId === areaId);
  return (
    <ScreenFrame title={F.title} wide>
      {header}
      {props.notice}
      <Alert message={props.loadError} />
      {areas === null ? (
        props.loadError === null ? (
          <p className="pos-hint">{F.loading}</p>
        ) : null
      ) : areas.length === 0 ? (
        <p className="pos-hint">{F.noPlan}</p>
      ) : (
        <>
          <div className="pos-tabs" role="tablist" aria-label={F.areasLabel}>
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                role="tab"
                aria-selected={area.id === areaId}
                className="pos-tab pos-wrap"
                onClick={() => setChosen(area.id)}
              >
                {area.name}
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="pos-hint">{F.emptyArea}</p> : null}
          <ul className="pos-table-grid" aria-label={F.title}>
            {shown.map((table) => (
              <li key={table.id}>
                <TableTile table={table} now={now} onOpen={() => props.onOpenTable(table)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </ScreenFrame>
  );
}
