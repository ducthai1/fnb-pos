/** Floor rows as read from the database and as the API shows them. */

export interface AreaRow {
  id: string;
  branch_id: string;
  name: string;
  sort_order: number;
  version: number;
  archived_at: Date | null;
}

export interface DiningTableRow {
  id: string;
  area_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
  seats: number;
  sort_order: number;
  version: number;
  archived_at: Date | null;
}

export const AREA_COLUMNS = "id, branch_id, name, sort_order, version, archived_at";
export const DINING_TABLE_COLUMNS =
  "t.id, t.area_id, t.name, t.x, t.y, t.width, t.height, t.shape, t.seats, t.sort_order, " +
  "t.version, t.archived_at";

const instant = (at: Date | null) => (at === null ? null : at.toISOString());

export function areaView(row: AreaRow) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    sortOrder: row.sort_order,
    version: row.version,
    archivedAt: instant(row.archived_at),
  };
}

export function diningTableView(row: DiningTableRow) {
  return {
    id: row.id,
    areaId: row.area_id,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    shape: row.shape,
    seats: row.seats,
    sortOrder: row.sort_order,
    version: row.version,
    archivedAt: instant(row.archived_at),
  };
}
