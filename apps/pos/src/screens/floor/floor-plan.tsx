import type { CSSProperties } from "react";
import { type PlanBox, spotIn } from "../../features/floor/floor-plan-box";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { vi } from "../../messages/vi";
import { TableTile } from "./table-tile";

/**
 * An area's tables where the floor editor placed them, scaled to the screen: never wider than
 * the screen, never larger than about one and a half times the editor's size. Tables the
 * filter leaves out stay in place, dimmed, so the room still reads as the room.
 */
export function FloorPlan(props: {
  box: PlanBox;
  tables: readonly FloorTableView[];
  shown: ReadonlySet<string>;
  now: number;
  onOpen(table: FloorTableView): void;
}) {
  const { box } = props;
  const size = { "--plan-w": box.width, "--plan-h": box.height } as CSSProperties;
  return (
    <div className="pos-plan" style={size}>
      <ul className="pos-plan__floor" aria-label={vi.tables.floor.title}>
        {props.tables.map((table) => {
          if (table.layout === null) return null;
          const spot = spotIn(box, table.layout);
          return (
            <li
              key={table.id}
              className="pos-plan__spot"
              data-dimmed={!props.shown.has(table.id)}
              style={{
                left: `${spot.left}%`,
                top: `${spot.top}%`,
                width: `${spot.width}%`,
                height: `${spot.height}%`,
              }}
            >
              <TableTile table={table} now={props.now} onPlan onOpen={() => props.onOpen(table)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
