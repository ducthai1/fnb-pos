import { LayoutGrid, Map as MapIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { FloorArea } from "../../features/floor/floor-occupancy";
import { planBoxOf, planReadable } from "../../features/floor/floor-plan-box";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { EmptyState, LoadingState } from "../shared/state-view";
import { FloorLegend } from "./floor-legend";
import { FloorPlan } from "./floor-plan";
import { TableTile } from "./table-tile";

const F = vi.tables.floor;

type Filter = keyof typeof F.filters;
type View = keyof typeof F.views;

export interface FloorScreenProps {
  header: ReactNode;
  /** Null until the plan was read once. */
  areas: readonly FloorArea[] | null;
  tables: readonly FloorTableView[];
  now: number;
  loadError: string | null;
  /** A sentence about the last thing done here (guests moved, a refusal). */
  notice: ReactNode;
  /** The plan where tables have places; by default on a screen wide enough to read it. */
  initialView?: View;
  onOpenTable(table: FloorTableView): void;
}

const wideEnough = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(min-width: 760px)").matches;

const keeps = (filter: Filter, table: FloorTableView) =>
  filter === "all" || (filter === "free") === (table.status === "free");

/** The branch's tables by area, each with its status, as the till last knows it. */
export function FloorScreen(props: FloorScreenProps) {
  const { header, areas, tables, now } = props;
  const [chosen, setChosen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setView] = useState<View | null>(props.initialView ?? null);
  const areaId = areas?.some((area) => area.id === chosen) ? chosen : (areas?.[0]?.id ?? null);
  const inArea = tables.filter((table) => table.areaId === areaId);
  const shown = inArea.filter((table) => keeps(filter, table));
  const box = planBoxOf(inArea);
  // Until the cashier picks one, each area opens the way it reads best on this screen.
  const view: View =
    picked ?? (box !== null && planReadable(box, inArea) && wideEnough() ? "plan" : "grid");
  const choice = <K extends string>(
    value: K,
    current: K,
    label: string,
    set: (next: K) => void,
  ) => (
    <button
      key={value}
      type="button"
      className="pos-tab"
      aria-pressed={value === current}
      onClick={() => set(value)}
    >
      {label}
    </button>
  );
  return (
    <ScreenFrame title={F.title} wide titleHidden>
      {header}
      {props.notice}
      <Alert message={props.loadError} />
      {areas === null ? (
        props.loadError === null ? (
          <LoadingState title={F.loading} />
        ) : null
      ) : areas.length === 0 ? (
        <EmptyState title={F.noPlan} />
      ) : (
        <>
          <div className="pos-tabs pos-area-tabs" role="tablist" aria-label={F.areasLabel}>
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
          <div className="pos-floor-bar">
            <div className="pos-tabs pos-radio-tabs" role="group" aria-label={F.filterLabel}>
              {(Object.keys(F.filters) as Filter[]).map((key) =>
                choice(key, filter, F.filters[key], setFilter),
              )}
            </div>
            {box === null ? null : (
              <div className="pos-tabs" role="group" aria-label={F.viewLabel}>
                <button
                  type="button"
                  className="pos-tab"
                  aria-pressed={view === "plan"}
                  onClick={() => setView("plan")}
                >
                  <Icon of={MapIcon} size={18} />
                  {F.views.plan}
                </button>
                <button
                  type="button"
                  className="pos-tab"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <Icon of={LayoutGrid} size={18} />
                  {F.views.grid}
                </button>
              </div>
            )}
            <FloorLegend tables={inArea} />
          </div>
          {inArea.length === 0 ? <EmptyState title={F.emptyArea} /> : null}
          {inArea.length > 0 && shown.length === 0 ? <EmptyState title={F.noneShown} /> : null}
          {box !== null && view === "plan" ? (
            <FloorPlan
              box={box}
              tables={inArea}
              shown={new Set(shown.map((table) => table.id))}
              now={now}
              onOpen={props.onOpenTable}
            />
          ) : (
            <ul className="pos-table-grid" aria-label={F.title}>
              {shown.map((table) => (
                <li key={table.id}>
                  <TableTile table={table} now={now} onOpen={() => props.onOpenTable(table)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ScreenFrame>
  );
}
