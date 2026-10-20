"use client";

import { type CSSProperties, type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import type { DiningTable } from "../../lib/api/floor-api";
import { movedTableBody, nudge, placeAt, planBox } from "../../lib/floor/plan-geometry";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { useFloorWrite } from "./use-floor-write";

const T = vi.floor;

interface Drag {
  readonly id: string;
  readonly startX: number;
  readonly startY: number;
  readonly from: { x: number; y: number };
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * The area's tables drawn where they stand, to be moved by dragging (mouse, finger, pen)
 * or by the arrow keys. A drop is saved at once with the table's other fields as read
 * (the existing PUT of a table), and the page reads the plan again for the new version.
 */
export function AreaPlan({ areaName, tables, onChanged }: { areaName: string; tables: readonly DiningTable[]; onChanged: () => void }) {
  const api = useApi();
  const write = useFloorWrite(onChanged);
  const hintId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [moved, setMoved] = useState<Readonly<Record<string, { x: number; y: number }>>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const placeOf = (table: DiningTable) => moved[table.id] ?? { x: table.x, y: table.y };
  const view = planBox(tables.map((table) => ({ ...table, ...placeOf(table) })));

  function save(table: DiningTable, to: { x: number; y: number }) {
    if (to.x === table.x && to.y === table.y) return;
    setMoved((current) => ({ ...current, [table.id]: to }));
    void write.run(() => api.putTable(table.id, movedTableBody(table, to.x, to.y)), () => T.moved(table.name)).then((saved) => {
      // Refused (someone changed the table meanwhile, say): it goes back to where it stands.
      if (!saved) setMoved((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== table.id)));
    });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, table: DiningTable) {
    if (write.busy) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: table.id, startX: event.clientX, startY: event.clientY, from: placeOf(table) });
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>, table: DiningTable) {
    const width = box.current?.clientWidth ?? 0;
    if (drag?.id !== table.id || width === 0) return;
    const unitsPerPixel = view.width / width;
    const to = placeAt(table, drag.from.x + (event.clientX - drag.startX) * unitsPerPixel, drag.from.y + (event.clientY - drag.startY) * unitsPerPixel);
    setMoved((current) => ({ ...current, [table.id]: to }));
  }

  function onPointerUp(table: DiningTable) {
    if (drag?.id !== table.id) return;
    setDrag(null);
    save(table, placeOf(table));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, table: DiningTable) {
    const to = nudge({ ...table, ...placeOf(table) }, event.key, event.shiftKey);
    if (to === null || write.busy) return;
    event.preventDefault();
    save(table, to);
  }

  return (
    <div className="bo-stack bo-plan-editor" role="group" aria-label={T.planTitle(areaName)}>
      <p id={hintId} className="bo-muted bo-wrap">
        {T.planHint}
      </p>
      <div ref={box} className="bo-plan" style={{ aspectRatio: `${view.width} / ${view.height}` } as CSSProperties}>
        {tables.map((table) => {
          const at = placeOf(table);
          return (
            <button
              key={table.id}
              type="button"
              className="bo-plan__table"
              data-shape={table.shape}
              data-dragging={drag?.id === table.id || undefined}
              data-plan-table={table.id}
              aria-label={T.moveTable(table.name, table.seats)}
              aria-describedby={hintId}
              style={{
                left: percent(at.x, view.width),
                top: percent(at.y, view.height),
                width: percent(table.width, view.width),
                height: percent(table.height, view.height),
              }}
              onPointerDown={(event) => onPointerDown(event, table)}
              onPointerMove={(event) => onPointerMove(event, table)}
              onPointerUp={() => onPointerUp(table)}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(event) => onKeyDown(event, table)}
            >
              <span className="bo-plan__name">{table.name}</span>
              <span className="bo-plan__seats">{T.seatsShort(table.seats)}</span>
            </button>
          );
        })}
      </div>
      <ErrorNotice message={write.error} />
      <SuccessNotice message={write.done} />
    </div>
  );
}
