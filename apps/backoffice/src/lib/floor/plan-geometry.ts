import { type DiningTableBodyInput, FLOOR_PLAN_EXTENT } from "@fnb/contracts";
import type { DiningTable } from "../api/floor-api";
import { editedTableBody } from "./floor-drafts";

/** Places snap to this many plan units, so tables line up without a ruler. */
export const PLAN_STEP = 50;
/** An arrow key moves a table this far; with Shift, five times as far. */
export const NUDGE = 100;
const MARGIN = 1_200;
const MIN_WIDTH = 4_800;
const MIN_HEIGHT = 3_000;

export interface PlanBox {
  readonly width: number;
  readonly height: number;
}

type Placed = Pick<DiningTable, "x" | "y" | "width" | "height">;

/**
 * The part of the plan the editor shows: every table with room around it to drag into,
 * never smaller than a small room, never past the edge the contract allows.
 */
export function planBox(tables: readonly Placed[]): PlanBox {
  const right = Math.max(0, ...tables.map((table) => table.x + table.width));
  const bottom = Math.max(0, ...tables.map((table) => table.y + table.height));
  return {
    width: Math.min(FLOOR_PLAN_EXTENT, Math.max(MIN_WIDTH, right + MARGIN)),
    height: Math.min(FLOOR_PLAN_EXTENT, Math.max(MIN_HEIGHT, bottom + MARGIN)),
  };
}

const snap = (value: number) => Math.round(value / PLAN_STEP) * PLAN_STEP;
const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max));

/** Where a table lands when dropped at (x, y): on the step grid, wholly inside the plan. */
export function placeAt(table: Placed, x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(snap(x), FLOOR_PLAN_EXTENT - table.width),
    y: clamp(snap(y), FLOOR_PLAN_EXTENT - table.height),
  };
}

/** The place an arrow key moves a table to. */
export function nudge(table: Placed, key: string, far: boolean): { x: number; y: number } | null {
  const step = far ? NUDGE * 5 : NUDGE;
  const move: Readonly<Record<string, readonly [number, number]>> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const delta = move[key];
  return delta === undefined ? null : placeAt(table, table.x + delta[0], table.y + delta[1]);
}

/** The table at a new place, everything else as the page read it. */
export const movedTableBody = (table: DiningTable, x: number, y: number): DiningTableBodyInput => ({
  ...editedTableBody(table, table.name, table.seats),
  x,
  y,
});
