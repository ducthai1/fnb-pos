import { type AreaBodyInput, type DiningTableBodyInput, FLOOR_PLAN_EXTENT } from "@fnb/contracts";
import type { Area, DiningTable } from "../api/floor-api";
import { parseCountText } from "../format/amount-text";

export const AREA_NAME_MAX = 60;
export const TABLE_NAME_MAX = 40;

/**
 * A name as the floor plan stores it: trimmed, not empty, within `max` characters counted
 * the way the contract counts them (UTF-16 units, so an emoji counts two).
 */
export function floorName(text: string, max: number): string | null {
  const name = text.trim();
  return name === "" || name.length > max ? null : name;
}

/** Seats typed by a person: a whole number from 1 to 99, or null. */
export function seatCount(text: string): number | null {
  const seats = parseCountText(text);
  return seats === null || seats < 1 || seats > 99 ? null : seats;
}

/** The next sort position after the given rows, so a new row goes last. */
export const nextSortOrder = (rows: readonly { sortOrder: number }[]) =>
  Math.min(9_999, rows.reduce((last, row) => Math.max(last, row.sortOrder + 10), 0));

/** A new area of the branch, created (version null) at the end of the list. */
export const newAreaBody = (branchId: string, name: string, areas: readonly Area[]): AreaBodyInput => ({
  version: null,
  branchId,
  name,
  sortOrder: nextSortOrder(areas),
});

/** The area renamed, based on the version the page read. */
export const renamedAreaBody = (area: Area, name: string): AreaBodyInput => ({
  version: area.version,
  branchId: area.branchId,
  name,
  sortOrder: area.sortOrder,
});

const SLOT = 1_200;
const PER_ROW = Math.floor(FLOOR_PLAN_EXTENT / SLOT);
const TABLE_SIZE = 1_000;

/**
 * A new table of an area. Nobody drags tables here, so a new one takes the next slot of a
 * grid on the plan (the POS draws the plan scaled to its screen); its place can be set
 * later in a plan editor without changing anything else about it.
 */
export function newTableBody(areaId: string, name: string, seats: number, tables: readonly DiningTable[]): DiningTableBodyInput {
  const index = tables.length;
  const row = Math.min(Math.floor(index / PER_ROW), PER_ROW - 1);
  return {
    version: null,
    areaId,
    name,
    x: (index % PER_ROW) * SLOT,
    y: row * SLOT,
    width: TABLE_SIZE,
    height: TABLE_SIZE,
    shape: "rectangle",
    seats,
    sortOrder: nextSortOrder(tables),
  };
}

/** The table with a new name and seat count, everything else as the page read it. */
export const editedTableBody = (table: DiningTable, name: string, seats: number): DiningTableBodyInput => ({
  version: table.version,
  areaId: table.areaId,
  name,
  x: table.x,
  y: table.y,
  width: table.width,
  height: table.height,
  shape: table.shape,
  seats,
  sortOrder: table.sortOrder,
});
