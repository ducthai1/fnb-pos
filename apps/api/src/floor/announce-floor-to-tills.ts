import { FLOOR_AREA_ENTITY, FLOOR_TABLE_ENTITY, type PosFloorPlan } from "@fnb/contracts";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";

const AREA_COPY = "id, branch_id, name, sort_order, version, archived_at";
const TABLE_COPY =
  "t.id, t.area_id, t.name, t.x, t.y, t.width, t.height, t.shape, t.seats, t.sort_order, " +
  "t.version, t.archived_at";

interface AreaCopyRow {
  id: string;
  branch_id: string;
  name: string;
  sort_order: number;
  version: number;
  archived_at: Date | null;
}

interface TableCopyRow {
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

const areaCopy = (row: AreaCopyRow): PosFloorPlan["areas"][number] => ({
  id: row.id,
  branchId: row.branch_id,
  name: row.name,
  sortOrder: row.sort_order,
  version: row.version,
});

const tableCopy = (row: TableCopyRow): PosFloorPlan["tables"][number] => ({
  id: row.id,
  areaId: row.area_id,
  name: row.name,
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  shape: row.shape as "rectangle" | "circle",
  seats: row.seats,
  sortOrder: row.sort_order,
  version: row.version,
});

/** What is on the branch's floor now, for a till's bootstrap: archived rows left out. */
export async function readBranchFloor(client: pg.ClientBase, branchId: string) {
  const areas = await client.query<AreaCopyRow>(
    `SELECT ${AREA_COPY} FROM area WHERE branch_id = $1 AND archived_at IS NULL ` +
      "ORDER BY sort_order, name, id",
    [branchId],
  );
  const tables = await client.query<TableCopyRow>(
    `SELECT ${TABLE_COPY} FROM dining_table t JOIN area a ON a.tenant_id = t.tenant_id ` +
      "AND a.id = t.area_id WHERE a.branch_id = $1 AND a.archived_at IS NULL " +
      "AND t.archived_at IS NULL ORDER BY a.sort_order, a.name, a.id, t.sort_order, t.name, t.id",
    [branchId],
  );
  return { areas: areas.rows.map(areaCopy), tables: tables.rows.map(tableCopy) };
}

/**
 * Sends a floor row as it now stands to the tills of `branchId`, after the caller changed
 * it in this transaction: the copy, or null once it is archived or deleted, so a till's
 * floor screen follows the backoffice without asking the server.
 */
export async function announceFloorRow(
  client: pg.ClientBase,
  tenantId: string,
  branchId: string,
  row: { kind: "area" | "table"; id: string },
): Promise<void> {
  await lockTenantChangeFeed(client, tenantId);
  let snapshot: object | null;
  if (row.kind === "area") {
    const { rows } = await client.query<AreaCopyRow>(
      `SELECT ${AREA_COPY} FROM area WHERE id = $1`,
      [row.id],
    );
    const found = rows[0];
    snapshot = found === undefined || found.archived_at !== null ? null : areaCopy(found);
  } else {
    const { rows } = await client.query<TableCopyRow>(
      `SELECT ${TABLE_COPY} FROM dining_table t WHERE t.id = $1`,
      [row.id],
    );
    const found = rows[0];
    snapshot = found === undefined || found.archived_at !== null ? null : tableCopy(found);
  }
  await appendChange(client, tenantId, {
    branchId,
    entity: row.kind === "area" ? FLOOR_AREA_ENTITY : FLOOR_TABLE_ENTITY,
    entityId: row.id,
    snapshot,
    commandId: null,
  });
}
